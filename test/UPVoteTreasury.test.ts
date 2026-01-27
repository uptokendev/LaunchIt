import { expect } from "chai";
import { ethers } from "hardhat";

describe("UPVoteTreasury (forwarding)", function () {
  async function deploy() {
    const [owner, feeReceiver, alice, bob] = await ethers.getSigners();

    const Treasury = await ethers.getContractFactory("UPVoteTreasury");
    const treasury = await Treasury.deploy(owner.address, feeReceiver.address);
    await treasury.waitForDeployment();

    return { treasury, owner, feeReceiver, alice, bob };
  }

  it("deploys with feeReceiver and native enabled", async () => {
    const { treasury, feeReceiver } = await deploy();
    expect(await treasury.feeReceiver()).to.eq(feeReceiver.address);

    const cfg = await treasury.assetConfig(ethers.ZeroAddress);
    expect(cfg.enabled).to.eq(true);
  });

  it("only owner can setAsset / setFeeReceiver", async () => {
    const { treasury, alice } = await deploy();
    await expect(
      treasury.connect(alice).setAsset(ethers.ZeroAddress, true, 123n)
    ).to.be.revertedWith("NOT_OWNER");

    await expect(
      treasury.connect(alice).setFeeReceiver(alice.address)
    ).to.be.revertedWith("NOT_OWNER");
  });

  it("voteWithBNB reverts when below minAmount", async () => {
    const { treasury, owner, alice } = await deploy();

    await (await treasury.connect(owner).setAsset(
      ethers.ZeroAddress,
      true,
      ethers.parseEther("0.01")
    )).wait();

    await expect(
      treasury.connect(alice).voteWithBNB(alice.address, ethers.ZeroHash, { value: ethers.parseEther("0.005") })
    ).to.be.revertedWith("AMOUNT_TOO_LOW");
  });

  it("voteWithBNB forwards to feeReceiver and emits event", async () => {
    const { treasury, owner, alice, feeReceiver } = await deploy();

    await (await treasury.connect(owner).setAsset(
      ethers.ZeroAddress,
      true,
      ethers.parseEther("0.005")
    )).wait();

    const campaign = "0x0000000000000000000000000000000000001234";
    const value = ethers.parseEther("0.005");
    const meta = ethers.keccak256(ethers.toUtf8Bytes("user"));

    const before = await ethers.provider.getBalance(feeReceiver.address);

    await expect(
      treasury.connect(alice).voteWithBNB(campaign, meta, { value })
    )
      .to.emit(treasury, "VoteCast")
      .withArgs(campaign, alice.address, ethers.ZeroAddress, value, meta);

    const after = await ethers.provider.getBalance(feeReceiver.address);
    expect(after - before).to.eq(value);

    // contract balance should not accumulate (ignoring dust)
    const contractBal = await ethers.provider.getBalance(await treasury.getAddress());
    expect(contractBal).to.eq(0n);
  });

  it("voteWithToken pulls ERC20, forwards to feeReceiver, emits received amount", async () => {
    const { treasury, owner, alice, feeReceiver } = await deploy();

    const Mock = await ethers.getContractFactory("MockERC20");
    // This repo's MockERC20 constructor is: (name, symbol, supply, to)
    const initialSupply = ethers.parseUnits("1000", 18);
    const usdt = await Mock.deploy("Tether", "USDT", initialSupply, alice.address);
    await usdt.waitForDeployment();

    // enable token with min 2
    await (await treasury
      .connect(owner)
      .setAsset(await usdt.getAddress(), true, ethers.parseUnits("2", 18))).wait();

    // approve
    await (await usdt
      .connect(alice)
      .approve(await treasury.getAddress(), ethers.parseUnits("3", 18))).wait();

    const campaign = "0x0000000000000000000000000000000000005678";
    const amount = ethers.parseUnits("3", 18);
    const meta = ethers.keccak256(ethers.toUtf8Bytes("user"));

    const before = await usdt.balanceOf(feeReceiver.address);

    await expect(
      treasury.connect(alice).voteWithToken(campaign, await usdt.getAddress(), amount, meta)
    )
      .to.emit(treasury, "VoteCast")
      // received == amount for normal ERC20
      .withArgs(campaign, alice.address, await usdt.getAddress(), amount, meta);

    const after = await usdt.balanceOf(feeReceiver.address);
    expect(after - before).to.eq(amount);

    // treasury should not hold tokens
    const held = await usdt.balanceOf(await treasury.getAddress());
    expect(held).to.eq(0n);
  });

  it("voteWithToken respects fee-on-transfer: minAmount enforced on received, and forwards received", async () => {
    const { treasury, owner, alice, feeReceiver } = await deploy();

    const FeeToken = await ethers.getContractFactory("MockFeeOnTransferERC20");
    // 10% fee
    const feeToken = await FeeToken.deploy(1000);
    await feeToken.waitForDeployment();

    const tokenAddr = await feeToken.getAddress();

    // If we want min received = 90, set minAmount=90
    const minReceived = ethers.parseUnits("90", 18);
    await (await treasury.connect(owner).setAsset(tokenAddr, true, minReceived)).wait();

    // mint 200 to alice
    await (await feeToken.mint(alice.address, ethers.parseUnits("200", 18))).wait();

    // alice votes with 100; received by treasury will be 90
    const sendAmount = ethers.parseUnits("100", 18);
    await (await feeToken.connect(alice).approve(await treasury.getAddress(), sendAmount)).wait();

    const campaign = "0x0000000000000000000000000000000000009999";
    const meta = ethers.keccak256(ethers.toUtf8Bytes("user"));

    const before = await feeToken.balanceOf(feeReceiver.address);

    await expect(
      treasury.connect(alice).voteWithToken(campaign, tokenAddr, sendAmount, meta)
    )
      .to.emit(treasury, "VoteCast")
      .withArgs(campaign, alice.address, tokenAddr, minReceived, meta);

    const after = await feeToken.balanceOf(feeReceiver.address);
    // NOTE: fee-on-transfer tokens charge a fee on *each* transfer.
    // In this forwarding design:
    //   (1) Alice -> Treasury is taxed
    //   (2) Treasury -> feeReceiver is taxed again
    // The VoteCast event records what the Treasury received (minReceived),
    // but feeReceiver will receive less if the token taxes outgoing transfers.
    const feeBps = BigInt(await feeToken.feeBps());
    const expectedToFeeReceiver = (minReceived * (10_000n - feeBps)) / 10_000n;
    expect(after - before).to.eq(expectedToFeeReceiver);

    // treasury should not hold tokens
    const held = await feeToken.balanceOf(await treasury.getAddress());
    expect(held).to.eq(0n);
  });

  it("campaign allowlist can be enabled and enforced", async () => {
    const { treasury, owner, alice } = await deploy();

    const campaign = "0x000000000000000000000000000000000000ABCD";

    await (await treasury.connect(owner).setCampaignAllowlistEnabled(true)).wait();

    await expect(
      treasury.connect(alice).voteWithBNB(campaign, ethers.ZeroHash, { value: 1n })
    ).to.be.revertedWith("CAMPAIGN_NOT_ALLOWED");

    await (await treasury.connect(owner).setCampaignAllowed(campaign, true)).wait();

    // enable tiny min
    await (await treasury.connect(owner).setAsset(ethers.ZeroAddress, true, 1n)).wait();

    await expect(
      treasury.connect(alice).voteWithBNB(campaign, ethers.ZeroHash, { value: 1n })
    ).to.emit(treasury, "VoteCast");
  });

  it("direct BNB transfer to receive() does not emit VoteCast", async () => {
    const { treasury, alice } = await deploy();

    await expect(
      alice.sendTransaction({ to: await treasury.getAddress(), value: 123n })
    ).to.not.emit(treasury, "VoteCast");
  });
});
