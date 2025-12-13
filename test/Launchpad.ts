import { expect } from "chai";
import { ethers } from "hardhat";

describe("Launchpad end-to-end", function () {
  async function deployFactoryAndRouter() {
    const [deployer, creator, trader, other] = await ethers.getSigners();

    const MockRouter = await ethers.getContractFactory("MockRouter");
    const router = await MockRouter.deploy(
      await deployer.getAddress(),
      await deployer.getAddress()
    );

    const LaunchFactory = await ethers.getContractFactory("LaunchFactory");
    const factory = await LaunchFactory.deploy(await router.getAddress());

    return { deployer, creator, trader, other, router, factory };
  }

  it("deploys factory with default config and creates a campaign with correct params", async () => {
    const { deployer, creator, router, factory } = await deployFactoryAndRouter();

    // Check default config
    const cfg = await factory.config();
    expect(cfg.totalSupply).to.equal(ethers.parseUnits("1000000000", 18));
    expect(cfg.curveBps).to.equal(8800n);
    expect(cfg.liquidityTokenBps).to.equal(1000n);

    // FIX: basePrice is 5e13 (0.00005 BNB)
    expect(cfg.basePrice).to.equal(50_000_000_000_000n);

    expect(cfg.priceSlope).to.equal(1_000_000_000n);
    expect(cfg.graduationTarget).to.equal(ethers.parseEther("50"));
    expect(cfg.liquidityBps).to.equal(7000n);

    // Build request overriding some params
    const request = {
      name: "Test Token",
      symbol: "TEST",
      logoURI: "ipfs://logo-hash",
      xAccount: "https://x.com/test",
      website: "https://example.com",
      extraLink: "https://t.me/test",
      // override base, slope, target
      basePrice: ethers.parseEther("0.0000005"),
      priceSlope: ethers.parseEther("0.0000000001"),
      graduationTarget: ethers.parseEther("0.5"),
      lpReceiver: creator.address,
    };

    const tx = await factory.connect(creator).createCampaign(request);
    await tx.wait();

    // One campaign created
    expect(await factory.campaignsCount()).to.equal(1n);

    const info = await factory.getCampaign(0);
    const campaign = await ethers.getContractAt("LaunchCampaign", info.campaign);
    const token = await ethers.getContractAt("LaunchToken", info.token);

    // Basic metadata
    expect(info.creator).to.equal(creator.address);
    expect(info.name).to.equal(request.name);
    expect(info.symbol).to.equal(request.symbol);
    expect(info.logoURI).to.equal(request.logoURI);
    expect(info.website).to.equal(request.website);
    expect(info.xAccount).to.equal(request.xAccount);
    expect(info.extraLink).to.equal(request.extraLink);

    // Campaign invariants
    expect(await campaign.basePrice()).to.equal(request.basePrice);
    expect(await campaign.priceSlope()).to.equal(request.priceSlope);
    expect(await campaign.graduationTarget()).to.equal(request.graduationTarget);
    expect(await campaign.liquidityBps()).to.equal(cfg.liquidityBps);
    expect(await campaign.protocolFeeBps()).to.equal(await factory.protocolFeeBps());

    const totalSupply = await campaign.totalSupply();
    const curveSupply = await campaign.curveSupply();
    const liquiditySupply = await campaign.liquiditySupply();
    const creatorReserve = await campaign.creatorReserve();

    // Supply splits
    expect(totalSupply).to.equal(cfg.totalSupply);
    expect(curveSupply).to.equal((cfg.totalSupply * cfg.curveBps) / 10_000n);
    expect(liquiditySupply).to.equal((cfg.totalSupply * cfg.liquidityTokenBps) / 10_000n);
    expect(creatorReserve).to.equal(totalSupply - curveSupply - liquiditySupply);

    // Token was deployed and minted to campaign
    expect(await token.totalSupply()).to.equal(totalSupply);
    expect(await token.balanceOf(await campaign.getAddress())).to.equal(totalSupply);

    // Router and LP receiver configured
    expect(await campaign.router()).to.equal(await router.getAddress());
    expect(await campaign.lpReceiver()).to.equal(request.lpReceiver);
  });

  it("computes quotes, allows buys/sells, and updates price and sold correctly", async () => {
    const { creator, trader, router, factory } = await deployFactoryAndRouter();

    // Use a custom, smaller config for easier numbers
    const newConfig = {
      totalSupply: ethers.parseUnits("1000", 18),
      curveBps: 8000n,
      liquidityTokenBps: 1000n,
      basePrice: ethers.parseEther("0.001"),
      priceSlope: ethers.parseEther("0.000001"),
      graduationTarget: ethers.parseEther("1"),
      liquidityBps: 7000n,
    };
    await factory.setConfig(newConfig);

    const request = {
      name: "Quote Token",
      symbol: "QUO",
      logoURI: "ipfs://logo-quote",
      xAccount: "",
      website: "",
      extraLink: "",
      // leave these as 0 to use config defaults
      basePrice: 0n,
      priceSlope: 0n,
      graduationTarget: 0n,
      lpReceiver: creator.address,
    };

    await factory.connect(creator).createCampaign(request);
    const info = await factory.getCampaign(0);
    const campaign = await ethers.getContractAt("LaunchCampaign", info.campaign);
    const token = await ethers.getContractAt("LaunchToken", info.token);

    // Initial price == basePrice
    const basePrice = await campaign.basePrice();
    const initialPrice = await campaign.currentPrice();
    expect(initialPrice).to.equal(basePrice);

    // quoteBuyExactTokens should revert on 0 amount
    await expect(campaign.quoteBuyExactTokens(0)).to.be.revertedWith("zero amount");

    const buyAmount = ethers.parseUnits("10", 18);
    const cost = await campaign.quoteBuyExactTokens(buyAmount);
    expect(cost).to.be.gt(0n);

    // Buy 10 tokens
    await expect(
      campaign.connect(trader).buyExactTokens(buyAmount, cost, { value: cost })
    )
      .to.emit(campaign, "TokensPurchased")
      .withArgs(trader.address, buyAmount, cost);

    expect(await token.balanceOf(trader.address)).to.equal(buyAmount);
    expect(await campaign.sold()).to.equal(buyAmount);

    // Price should have increased
    const newPrice = await campaign.currentPrice();
    expect(newPrice).to.be.gt(initialPrice);

    // quoteSellExactTokens reverts on invalid amounts
    await expect(campaign.quoteSellExactTokens(0)).to.be.revertedWith("zero amount");
    await expect(
      campaign.quoteSellExactTokens(buyAmount + 1n)
    ).to.be.revertedWith("exceeds sold");

    const sellAmount = ethers.parseUnits("4", 18);
    const payout = await campaign.quoteSellExactTokens(sellAmount);
    expect(payout).to.be.gt(0n);

    // Sell 4 tokens
    await token.connect(trader).approve(await campaign.getAddress(), sellAmount);
    await expect(
      campaign.connect(trader).sellExactTokens(sellAmount, 0)
    )
      .to.emit(campaign, "TokensSold")
      .withArgs(trader.address, sellAmount, payout);

    // sold reduced correctly
    expect(await campaign.sold()).to.equal(buyAmount - sellAmount);
  });
    it("fuzz: random buy/sell sequences preserve invariants on the curve", async () => {
    const { creator, trader, router, factory } = await deployFactoryAndRouter();

    // Small numbers to keep fuzz deterministic and cheap
    const newConfig = {
      totalSupply: ethers.parseUnits("1000", 18),
      curveBps: 8000n,            // 800 tokens on curve
      liquidityTokenBps: 1000n,   // 100 tokens for LP
      basePrice: ethers.parseEther("0.001"),
      priceSlope: ethers.parseEther("0.000001"),
      graduationTarget: ethers.parseEther("10"), // high enough so we won't accidentally hit it
      liquidityBps: 7000n,
    };
    await factory.setConfig(newConfig);

    const request = {
      name: "Fuzz Token",
      symbol: "FZZ",
      logoURI: "ipfs://logo-fuzz",
      xAccount: "",
      website: "",
      extraLink: "",
      basePrice: 0n,
      priceSlope: 0n,
      graduationTarget: 0n,
      lpReceiver: creator.address,
    };

    await factory.connect(creator).createCampaign(request);
    const info = await factory.getCampaign(0);
    const campaign = await ethers.getContractAt("LaunchCampaign", info.campaign);
    const token = await ethers.getContractAt("LaunchToken", info.token);

    const totalSupply = await campaign.totalSupply();
    const curveSupply = await campaign.curveSupply();

    // Initial sanity
    expect(await campaign.sold()).to.equal(0n);
    expect(await token.totalSupply()).to.equal(totalSupply);
    expect(await token.balanceOf(await campaign.getAddress())).to.equal(totalSupply);
    expect(await token.balanceOf(trader.address)).to.equal(0n);

    const iterations = 40; // enough to explore, not too slow

    for (let i = 0; i < iterations; i++) {
      const sold = await campaign.sold();
      const traderBal = await token.balanceOf(trader.address);
      const campaignAddr = await campaign.getAddress();
      const campaignBalTokens = await token.balanceOf(campaignAddr);

      // Invariant: before any operation
      expect(sold).to.be.gte(0n);
      expect(sold).to.be.lte(curveSupply);
      expect(campaignBalTokens + traderBal).to.equal(totalSupply);
      expect(sold).to.equal(traderBal); // only trader holds curve tokens

      // Decide action: bias slightly to buys so we don't drain all BNB
      const doBuy = Math.random() < 0.6;

      if (doBuy) {
        const remainingCurve = curveSupply - sold;
        if (remainingCurve === 0n) {
          // Can't buy any more, just skip this iteration
          continue;
        }

        // Choose random buy size between 1 and up to 20 tokens (but not more than remainingCurve)
        const rawTokens = BigInt(1 + Math.floor(Math.random() * 20));
        let amountTokens = ethers.parseUnits(rawTokens.toString(), 18);
        if (amountTokens > remainingCurve) {
          amountTokens = remainingCurve;
        }

        const cost = await campaign.quoteBuyExactTokens(amountTokens);
        // If cost is zero (can happen at tiny slope early), skip to avoid sending 0-value tx
        if (cost === 0n) continue;

        await campaign.connect(trader).buyExactTokens(amountTokens, cost, { value: cost });

      } else {
        // Sell path
        if (traderBal === 0n) {
          // Nothing to sell -> skip
          continue;
        }

        // Choose random sell size between 1 and up to 20 tokens (but not more than traderBal)
        const rawTokens = BigInt(1 + Math.floor(Math.random() * 20));
        let amountTokens = ethers.parseUnits(rawTokens.toString(), 18);
        if (amountTokens > traderBal) {
          amountTokens = traderBal;
        }

        const payout = await campaign.quoteSellExactTokens(amountTokens);
        if (payout === 0n) continue;

        const balBefore = await ethers.provider.getBalance(campaignAddr);

        await token.connect(trader).approve(campaignAddr, amountTokens);
        await campaign.connect(trader).sellExactTokens(amountTokens, 0);

        const balAfter = await ethers.provider.getBalance(campaignAddr);
        const paidOut = balBefore - balAfter;

        // Invariant: ETH paid equals quote
        expect(paidOut).to.equal(payout);
      }

      // Re-check invariants after this operation
      const newSold = await campaign.sold();
      const newTraderBal = await token.balanceOf(trader.address);
      const newCampaignBalTokens = await token.balanceOf(await campaign.getAddress());
      const newTotalSupply = await token.totalSupply();

      expect(newSold).to.be.gte(0n);
      expect(newSold).to.be.lte(curveSupply);
      expect(newTotalSupply).to.equal(totalSupply); // no burns before finalize
      expect(newCampaignBalTokens + newTraderBal).to.equal(totalSupply);
      expect(newSold).to.equal(newTraderBal);
    }
  });

  it("enforces pre-launch lock: no user transfers or manual LP before finalize", async () => {
    const { creator, trader, other, router, factory } = await deployFactoryAndRouter();

    const request = {
      name: "Locked Token",
      symbol: "LOCK",
      logoURI: "ipfs://logo-locked",
      xAccount: "",
      website: "",
      extraLink: "",
      basePrice: ethers.parseEther("0.0000005"),
      priceSlope: ethers.parseEther("0.0000000001"),
      graduationTarget: ethers.parseEther("0.5"),
      lpReceiver: creator.address,
    };

    await factory.connect(creator).createCampaign(request);
    const info = await factory.getCampaign(0);
    const campaign = await ethers.getContractAt("LaunchCampaign", info.campaign);
    const token = await ethers.getContractAt("LaunchToken", info.token);

    // Trading is disabled initially
    expect(await token.tradingEnabled()).to.equal(false);

    // Trader buys some tokens
    const buyAmount = ethers.parseUnits("100000", 18);
    const cost = await campaign.quoteBuyExactTokens(buyAmount);
    await campaign.connect(trader).buyExactTokens(buyAmount, cost, { value: cost });

    // Direct transfer between users must fail
    const transferAmount = buyAmount / 10n;
    await expect(
      token.connect(trader).transfer(other.address, transferAmount)
    ).to.be.revertedWithCustomError(token, "TradingNotEnabled");

    // Attempt to add liquidity manually via router before finalize -> must fail
    const lpAmount = await token.balanceOf(trader.address);
    await token.connect(trader).approve(await router.getAddress(), lpAmount);

    await expect(
      router
        .connect(trader)
        .addLiquidityETH(
          await token.getAddress(),
          lpAmount,
          0n,
          0n,
          trader.address,
          Math.floor(Date.now() / 1000) + 3600,
          { value: ethers.parseEther("0.1") }
        )
    ).to.be.revertedWithCustomError(token, "TradingNotEnabled");
  });

  it("only the campaign owner can finalize, and finalize can only be called once", async () => {
    const { deployer, creator, trader, router, factory } = await deployFactoryAndRouter();

    // Small config to avoid huge ETH amounts
    const newConfig = {
      totalSupply: ethers.parseUnits("1000", 18),
      curveBps: 8000n,
      liquidityTokenBps: 1000n,
      basePrice: ethers.parseEther("0.001"),
      priceSlope: ethers.parseEther("0.000001"),
      graduationTarget: ethers.parseEther("1"), // 1 BNB target
      liquidityBps: 7000n,
    };
    await factory.setConfig(newConfig);

    const request = {
      name: "Finalize Token",
      symbol: "FIN",
      logoURI: "ipfs://logo-finalize",
      xAccount: "",
      website: "",
      extraLink: "",
      basePrice: 0n,
      priceSlope: 0n,
      graduationTarget: 0n,
      lpReceiver: creator.address,
    };

    await factory.connect(creator).createCampaign(request);
    const info = await factory.getCampaign(0);
    const campaign = await ethers.getContractAt("LaunchCampaign", info.campaign);
    const token = await ethers.getContractAt("LaunchToken", info.token);

    // Buy some tokens (but don't sell out)
    const buyAmount = ethers.parseUnits("10", 18);
    const cost = await campaign.quoteBuyExactTokens(buyAmount);
    await campaign.connect(trader).buyExactTokens(buyAmount, cost, { value: cost });

    // Top up BNB directly into campaign to reach graduation target
    const target = await campaign.graduationTarget();
    const currentBal = await ethers.provider.getBalance(await campaign.getAddress());
    const missing = target - currentBal;
    await deployer.sendTransaction({
      to: await campaign.getAddress(),
      value: missing,
    });

    // Non-owner cannot finalize (reverts because of access or because threshold not met – we only care it reverts)
    await expect(campaign.connect(trader).finalize(0, 0)).to.be.reverted;

    // Record balance before finalize for later checks
    const balanceBefore = await ethers.provider.getBalance(await campaign.getAddress());
    const liqBps = await campaign.liquidityBps();
    const expectedLiquidityValue = (balanceBefore * liqBps) / 10_000n;

    // Owner (creator) can finalize, and router receives liquidity
    await expect(campaign.connect(creator).finalize(0, 0))
      .to.emit(campaign, "CampaignFinalized")
      .and.to.emit(router, "LiquidityAdded");

    // Launched and trading enabled
    expect(await campaign.launched()).to.equal(true);
    expect(await token.tradingEnabled()).to.equal(true);

    // Campaign contract should hold no ETH afterwards
    expect(await ethers.provider.getBalance(await campaign.getAddress())).to.equal(0n);

    // Router holds exactly the liquidity ETH
    expect(await ethers.provider.getBalance(await router.getAddress())).to.equal(
      expectedLiquidityValue
    );

    // Cannot finalize again
    await expect(campaign.connect(creator).finalize(0, 0)).to.be.revertedWith("finalized");
  });

  it("after finalize, tokens and LP are distributed correctly and trading is open", async () => {
    const { creator, trader, other, router, factory } = await deployFactoryAndRouter();

    const newConfig = {
      totalSupply: ethers.parseUnits("1000", 18),
      curveBps: 8000n,
      liquidityTokenBps: 1000n,
      basePrice: ethers.parseEther("0.001"),
      priceSlope: ethers.parseEther("0.000001"),
      graduationTarget: ethers.parseEther("1"),
      liquidityBps: 7000n,
    };
    await factory.setConfig(newConfig);

    const request = {
      name: "Distrib Token",
      symbol: "DST",
      logoURI: "ipfs://logo-distrib",
      xAccount: "",
      website: "",
      extraLink: "",
      basePrice: 0n,
      priceSlope: 0n,
      graduationTarget: 0n,
      lpReceiver: creator.address,
    };

    await factory.connect(creator).createCampaign(request);
    const info = await factory.getCampaign(0);
    const campaign = await ethers.getContractAt("LaunchCampaign", info.campaign);
    const token = await ethers.getContractAt("LaunchToken", info.token);

    const totalSupply = await campaign.totalSupply();
    const curveSupply = await campaign.curveSupply();
    const liquiditySupply = await campaign.liquiditySupply();
    const creatorReserve = await campaign.creatorReserve();

    // Trader buys some tokens (so sold > 0 but < curveSupply)
    const buyAmount = ethers.parseUnits("10", 18);
    const cost = await campaign.quoteBuyExactTokens(buyAmount);
    await campaign.connect(trader).buyExactTokens(buyAmount, cost, { value: cost });

    // Top up BNB to reach graduation target
    const target = await campaign.graduationTarget();
    const currentBal = await ethers.provider.getBalance(await campaign.getAddress());
    const missing = target - currentBal;
    await creator.sendTransaction({
      to: await campaign.getAddress(),
      value: missing,
    });

    // Finalize by owner
    await campaign.connect(creator).finalize(0, 0);

    // After finalize:
    // 1) Token trading enabled
    expect(await token.tradingEnabled()).to.equal(true);

    // 2) Campaign should hold no tokens
    expect(await token.balanceOf(await campaign.getAddress())).to.equal(0n);

    // 3) Router should hold exactly liquiditySupply tokens
    expect(await token.balanceOf(await router.getAddress())).to.equal(liquiditySupply);

    // 4) Creator should hold creatorReserve tokens
    expect(await token.balanceOf(creator.address)).to.equal(creatorReserve);

    // 5) Total supply should now be:
    //    original totalSupply - (unsold curve tokens)
    //    = liquiditySupply + creatorReserve + sold
    const sold = await campaign.sold();
    const expectedTotalSupply =
      totalSupply - (curveSupply - sold); // equivalent to liquiditySupply + creatorReserve + sold
    expect(await token.totalSupply()).to.equal(expectedTotalSupply);

    // 6) Trader can transfer tokens freely after launch
    const transferAmount = buyAmount / 2n;
    await token.connect(trader).transfer(other.address, transferAmount);
    expect(await token.balanceOf(other.address)).to.equal(transferAmount);

    // 7) Buys and sells via campaign are blocked after launch
    await expect(
      campaign
        .connect(trader)
        .buyExactTokens(ethers.parseUnits("1", 18), ethers.parseEther("1"), {
          value: ethers.parseEther("1"),
        })
    ).to.be.revertedWith("campaign launched");

    await token
      .connect(trader)
      .approve(await campaign.getAddress(), ethers.parseUnits("1", 18));
    await expect(
      campaign.connect(trader).sellExactTokens(ethers.parseUnits("1", 18), 0)
    ).to.be.revertedWith("campaign launched");
  });
    it("curve price discovery is consistent with the bonding integral and quotes", async () => {
    const { creator, trader, router, factory } = await deployFactoryAndRouter();

    const newConfig = {
      totalSupply: ethers.parseUnits("1000", 18),
      curveBps: 8000n,
      liquidityTokenBps: 1000n,
      basePrice: ethers.parseEther("0.001"),
      priceSlope: ethers.parseEther("0.000001"),
      graduationTarget: ethers.parseEther("1"),
      liquidityBps: 7000n,
    };
    await factory.setConfig(newConfig);

    const request = {
      name: "Curve Test Token",
      symbol: "CRV",
      logoURI: "ipfs://logo-curve",
      xAccount: "",
      website: "",
      extraLink: "",
      // use config defaults for curve params
      basePrice: 0n,
      priceSlope: 0n,
      graduationTarget: 0n,
      lpReceiver: creator.address,
    };

    await factory.connect(creator).createCampaign(request);
    const info = await factory.getCampaign(0);
    const campaign = await ethers.getContractAt("LaunchCampaign", info.campaign);
    const token = await ethers.getContractAt("LaunchToken", info.token);

    const basePrice = await campaign.basePrice();
    const priceSlope = await campaign.priceSlope();
    const WAD = ethers.parseUnits("1", 18);

    // JS version of _area(x)
    const area = (x: bigint) => {
      const linear = (x * basePrice) / WAD;
      const square = x * x;
      const slopeTerm = (priceSlope * square) / (2n * WAD * WAD);
      return linear + slopeTerm;
    };

    // Initially nothing sold
    expect(await campaign.sold()).to.equal(0n);

    // ---- First buy ----
    const amount1 = ethers.parseUnits("10", 18); // 10 tokens
    const quoted1 = await campaign.quoteBuyExactTokens(amount1);
    const expected1 = area(amount1) - area(0n);
    expect(quoted1).to.equal(expected1);

    await campaign.connect(trader).buyExactTokens(amount1, quoted1, { value: quoted1 });
    expect(await campaign.sold()).to.equal(amount1);

    // ---- Second buy ----
    const amount2 = ethers.parseUnits("5", 18); // 5 tokens
    const quoted2 = await campaign.quoteBuyExactTokens(amount2);
    const expected2 = area(amount1 + amount2) - area(amount1);
    expect(quoted2).to.equal(expected2);

    await campaign.connect(trader).buyExactTokens(amount2, quoted2, { value: quoted2 });

    const soldAfter = await campaign.sold();
    expect(soldAfter).to.equal(amount1 + amount2);

    // Spot price must match currentPrice formula
    const currentPrice = await campaign.currentPrice();
    const expectedPrice = basePrice + (priceSlope * soldAfter) / WAD;
    expect(currentPrice).to.equal(expectedPrice);

    // ---- Sell test ----
    const sellAmount = amount2; // sell back the second chunk
    const sellQuote = await campaign.quoteSellExactTokens(sellAmount);
    const expectedSell = area(soldAfter) - area(soldAfter - sellAmount);
    expect(sellQuote).to.equal(expectedSell);

    await token.connect(trader).approve(await campaign.getAddress(), sellAmount);

    await expect(
      campaign.connect(trader).sellExactTokens(sellAmount, 0)
    )
      .to.emit(campaign, "TokensSold")
      .withArgs(trader.address, sellAmount, sellQuote);
  });
      it("collects protocol fees correctly based on remaining balance after liquidity", async () => {
    const { creator, trader, router, factory } = await deployFactoryAndRouter();

    const newConfig = {
      totalSupply: ethers.parseUnits("1000", 18),
      curveBps: 8000n,
      liquidityTokenBps: 1000n,
      basePrice: ethers.parseEther("0.001"),
      priceSlope: ethers.parseEther("0.000001"),
      graduationTarget: ethers.parseEther("1"),
      liquidityBps: 7000n,
    };
    await factory.setConfig(newConfig);

    const request = {
      name: "Fee Token",
      symbol: "FEE",
      logoURI: "ipfs://logo-fee",
      xAccount: "",
      website: "",
      extraLink: "",
      basePrice: 0n,
      priceSlope: 0n,
      graduationTarget: 0n,
      lpReceiver: creator.address,
    };

    await factory.connect(creator).createCampaign(request);
    const info = await factory.getCampaign(0);
    const campaign = await ethers.getContractAt("LaunchCampaign", info.campaign);

    const feeRecipientAddr = await factory.feeRecipient();
    const routerAddr = await router.getAddress();

    const feeRecipientBalanceBefore = await ethers.provider.getBalance(feeRecipientAddr);
    const routerBalanceBefore = await ethers.provider.getBalance(routerAddr);

    let totalIn = 0n;

    // Two buys into the curve
    const amount1 = ethers.parseUnits("10", 18);
    const cost1 = await campaign.quoteBuyExactTokens(amount1);
    await campaign.connect(trader).buyExactTokens(amount1, cost1, { value: cost1 });
    totalIn += cost1;

    const amount2 = ethers.parseUnits("5", 18);
    const cost2 = await campaign.quoteBuyExactTokens(amount2);
    await campaign.connect(trader).buyExactTokens(amount2, cost2, { value: cost2 });
    totalIn += cost2;

    const campaignAddr = await campaign.getAddress();
    const target = await campaign.graduationTarget();
    let campaignBalance = await ethers.provider.getBalance(campaignAddr);

    // Top up directly to hit graduationTarget if needed
    if (campaignBalance < target) {
      const missing = target - campaignBalance;
      await creator.sendTransaction({ to: campaignAddr, value: missing });
      totalIn += missing;
    }

    // Sanity: all BNB sent in is still on the campaign before finalize
    campaignBalance = await ethers.provider.getBalance(campaignAddr);
    expect(campaignBalance).to.equal(totalIn);

    const liquidityBps = await campaign.liquidityBps();
    const protocolFeeBps = await factory.protocolFeeBps();

    const expectedLiquidityValue = (campaignBalance * liquidityBps) / 10_000n;
    const remainingAfterLP = campaignBalance - expectedLiquidityValue;
    const expectedProtocolFee = (remainingAfterLP * protocolFeeBps) / 10_000n;
    const expectedCreatorPayout = remainingAfterLP - expectedProtocolFee;

    // Finalize: send LP to router, fee to feeRecipient, payout to creator
    const finalizeTx = await campaign.connect(creator).finalize(0, 0);
    const finalizeRc = await finalizeTx.wait();

    // Decode CampaignFinalized event (use indexes, not names)
    let parsed: any = null;
    for (const log of finalizeRc!.logs) {
      try {
        const p = campaign.interface.parseLog(log);
        if (p.name === "CampaignFinalized") {
          parsed = p;
          break;
        }
      } catch {
        // ignore logs from other contracts
      }
    }
    if (!parsed) {
      throw new Error("CampaignFinalized event not found");
    }

    // args: [caller, usedTokens, usedBnb, protocolFee, remainingBalance]
    const protocolFeeFromEvent = parsed.args[3] as bigint;
    const creatorPayoutFromEvent = parsed.args[4] as bigint;

    expect(protocolFeeFromEvent).to.equal(expectedProtocolFee);
    expect(creatorPayoutFromEvent).to.equal(expectedCreatorPayout);

    // Final balances: campaign empty, router & feeRecipient funded
    const routerBalanceAfter = await ethers.provider.getBalance(routerAddr);
    const feeRecipientBalanceAfter = await ethers.provider.getBalance(feeRecipientAddr);
    campaignBalance = await ethers.provider.getBalance(campaignAddr);

    expect(campaignBalance).to.equal(0n);
    expect(routerBalanceAfter - routerBalanceBefore).to.equal(expectedLiquidityValue);
    expect(feeRecipientBalanceAfter - feeRecipientBalanceBefore).to.equal(expectedProtocolFee);
  });
    it("full workflow: campaign creation, multi-user buys/sells, finalize and LP", async () => {
    const { router, factory } = await deployFactoryAndRouter();

    // We'll re-get some signers for clarity
    const [deployer, creator, alice, bob, carol] = await ethers.getSigners();

    // Use a small config so numbers stay manageable
    const newConfig = {
      totalSupply: ethers.parseUnits("1000", 18),
      curveBps: 8000n,            // 800 tokens for curve
      liquidityTokenBps: 1000n,   // 100 tokens for LP
      basePrice: ethers.parseEther("0.001"),
      priceSlope: ethers.parseEther("0.000001"),
      graduationTarget: ethers.parseEther("1"), // 1 BNB target
      liquidityBps: 7000n,        // 70% of BNB to LP
    };
    await factory.setConfig(newConfig);

    const request = {
      name: "Scenario Token",
      symbol: "SCN",
      logoURI: "ipfs://logo-scenario",
      xAccount: "",
      website: "",
      extraLink: "",
      basePrice: 0n,          // use config defaults
      priceSlope: 0n,
      graduationTarget: 0n,
      lpReceiver: creator.address,
    };

    // 1. Creator launches a campaign via factory
    await factory.connect(creator).createCampaign(request);
    const info = await factory.getCampaign(0);
    const campaign = await ethers.getContractAt("LaunchCampaign", info.campaign);
    const token = await ethers.getContractAt("LaunchToken", info.token);

    const totalSupply = await campaign.totalSupply();
    const curveSupply = await campaign.curveSupply();
    const liquiditySupply = await campaign.liquiditySupply();
    const creatorReserve = await campaign.creatorReserve();

    // Initial invariants
    expect(await token.totalSupply()).to.equal(totalSupply);
    expect(await token.balanceOf(await campaign.getAddress())).to.equal(totalSupply);
    expect(await campaign.sold()).to.equal(0n);
    expect(totalSupply).to.equal(curveSupply + liquiditySupply + creatorReserve);

    // Helper functions for buys/sells in “human units”
    const buyTokens = async (user: any, rawAmount: number) => {
      const amount = ethers.parseUnits(rawAmount.toString(), 18);
      const cost = await campaign.quoteBuyExactTokens(amount);
      await campaign.connect(user).buyExactTokens(amount, cost, { value: cost });
      return { amount, cost };
    };

    const sellTokens = async (user: any, rawAmount: number) => {
      const amount = ethers.parseUnits(rawAmount.toString(), 18);
      const bal = await token.balanceOf(user.address);
      if (amount > bal) {
        // nothing to do
        return null;
      }
      const payout = await campaign.quoteSellExactTokens(amount);
      await token.connect(user).approve(await campaign.getAddress(), amount);
      const balBefore = await ethers.provider.getBalance(await campaign.getAddress());
      await campaign.connect(user).sellExactTokens(amount, 0);
      const balAfter = await ethers.provider.getBalance(await campaign.getAddress());
      const paidOut = balBefore - balAfter;
      expect(paidOut).to.equal(payout);
      return { amount, payout };
    };

    // 2. Multiple users buy into the curve
    await buyTokens(alice, 10); // Alice buys 10
    await buyTokens(bob, 20);   // Bob buys 20
    await buyTokens(carol, 5);  // Carol buys 5

    // Quick invariant: sold equals sum of all external balances
    const soldAfterBuys = await campaign.sold();
    const aliceBal1 = await token.balanceOf(alice.address);
    const bobBal1 = await token.balanceOf(bob.address);
    const carolBal1 = await token.balanceOf(carol.address);
    const sumBal1 = aliceBal1 + bobBal1 + carolBal1;

    expect(soldAfterBuys).to.equal(sumBal1);

    // And campaign holds the rest
    const campaignTokenBal1 = await token.balanceOf(await campaign.getAddress());
    expect(campaignTokenBal1 + sumBal1).to.equal(totalSupply);

    // 3. Some sells happen (profit-taking, rebalancing)
    await sellTokens(alice, 3); // Alice sells 3 (keeps 7)
    await sellTokens(bob, 5);   // Bob sells 5 (keeps 15)

    const soldAfterTrades = await campaign.sold();
    const aliceBal2 = await token.balanceOf(alice.address);
    const bobBal2 = await token.balanceOf(bob.address);
    const carolBal2 = await token.balanceOf(carol.address);
    const sumBal2 = aliceBal2 + bobBal2 + carolBal2;

    // Invariants still hold
    expect(soldAfterTrades).to.equal(sumBal2);
    const campaignTokenBal2 = await token.balanceOf(await campaign.getAddress());
    expect(campaignTokenBal2 + sumBal2).to.equal(totalSupply);
    expect(soldAfterTrades).to.be.lte(curveSupply);

    // 4. Reach graduation target (simulate more activity / external funding)
    const target = await campaign.graduationTarget();
    const campaignAddr = await campaign.getAddress();
    let campaignEthBal = await ethers.provider.getBalance(campaignAddr);
    if (campaignEthBal < target) {
      const missing = target - campaignEthBal;
      await deployer.sendTransaction({ to: campaignAddr, value: missing });
      campaignEthBal = await ethers.provider.getBalance(campaignAddr);
    }
    expect(campaignEthBal).to.be.gte(target);

    // 5. Only creator can finalize; and this will add LP via router
    await expect(
      campaign.connect(alice).finalize(0, 0)
    ).to.be.reverted; // non-owner

    await expect(
      campaign.connect(creator).finalize(0, 0)
    )
      .to.emit(campaign, "CampaignFinalized")
      .and.to.emit(router, "LiquidityAdded");

    // 6. Post-finalize state: launched, trading enabled
    expect(await campaign.launched()).to.equal(true);
    expect(await token.tradingEnabled()).to.equal(true);

    // Campaign should hold no tokens
    expect(await token.balanceOf(campaignAddr)).to.equal(0n);

    // Router should hold exactly liquiditySupply tokens
    expect(await token.balanceOf(await router.getAddress())).to.equal(liquiditySupply);

    // Creator should hold creatorReserve
    expect(await token.balanceOf(creator.address)).to.equal(creatorReserve);

    // Total supply = liquiditySupply + creatorReserve + sold (unsold curve burned)
    const soldFinal = await campaign.sold();
    const expectedTotalSupply =
      totalSupply - (curveSupply - soldFinal); // == liquiditySupply + creatorReserve + soldFinal
    expect(await token.totalSupply()).to.equal(expectedTotalSupply);

    // 7. Post-launch user-to-user transfers (simulating trading on an AMM)
    const transferAmount = ethers.parseUnits("2", 18);
    await token.connect(alice).transfer(bob.address, transferAmount);
    const aliceFinal = await token.balanceOf(alice.address);
    const bobFinal = await token.balanceOf(bob.address);
    expect(aliceFinal + bobFinal + (await token.balanceOf(carol.address)) + creatorReserve + liquiditySupply)
      .to.equal(await token.totalSupply());

    // 8. Campaign is "closed": no more buys/sells
    await expect(
      campaign
        .connect(alice)
        .buyExactTokens(ethers.parseUnits("1", 18), ethers.parseEther("1"), { value: ethers.parseEther("1") })
    ).to.be.revertedWith("campaign launched");

    await token
      .connect(alice)
      .approve(campaignAddr, ethers.parseUnits("1", 18));
    await expect(
      campaign.connect(alice).sellExactTokens(ethers.parseUnits("1", 18), 0)
    ).to.be.revertedWith("campaign launched");
  });

});
