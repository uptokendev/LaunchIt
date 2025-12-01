import { expect } from "chai";
import { ethers } from "hardhat";

describe("Launchpad clone", function () {
  async function deployFixture() {
    const [deployer, creator, trader] = await ethers.getSigners();

    const MockRouter = await ethers.getContractFactory("MockRouter");
    const router = await MockRouter.deploy(await deployer.getAddress(), await deployer.getAddress());

    const LaunchFactory = await ethers.getContractFactory("LaunchFactory");
    const factory = await LaunchFactory.deploy(await router.getAddress());

    return { deployer, creator, trader, router, factory };
  }

  it("creates campaigns, allows trading and finalization", async function () {
    const { creator, trader, factory } = await deployFixture();
    const request = {
      name: "Test Token",
      symbol: "TEST",
      logoURI: "ipfs://logo-hash",
      xAccount: "https://x.com/test",
      website: "https://example.com",
      extraLink: "https://t.me/test",
      basePrice: ethers.parseEther("0.0000005"),
      priceSlope: ethers.parseEther("0.0000000001"),
      graduationTarget: ethers.parseEther("0.1"),
      lpReceiver: creator.address,
    };

    await factory.connect(creator).createCampaign(request);
    const info = await factory.getCampaign(0);
    const campaign = await ethers.getContractAt("LaunchCampaign", info.campaign);
    const token = await ethers.getContractAt("LaunchToken", info.token);

    const purchaseAmount = ethers.parseUnits("100000", 18);
    const cost = await campaign.quoteBuyExactTokens(purchaseAmount);
    await campaign.connect(trader).buyExactTokens(purchaseAmount, cost, { value: cost });

    expect(await token.balanceOf(trader.address)).to.equal(purchaseAmount);
    expect(await campaign.sold()).to.equal(purchaseAmount);

    const sellAmount = purchaseAmount / 2n;
    await token.connect(trader).approve(await campaign.getAddress(), sellAmount);
    await expect(campaign.connect(trader).sellExactTokens(sellAmount, 0)).to.emit(campaign, "TokensSold");

    const additionalPurchase = ethers.parseUnits("150000", 18);
    const extraCost = await campaign.quoteBuyExactTokens(additionalPurchase);
    await campaign.connect(trader).buyExactTokens(additionalPurchase, extraCost, { value: extraCost });

    await expect(campaign.finalize(0, 0)).to.emit(campaign, "CampaignFinalized");
    expect(await campaign.launched()).to.equal(true);
  });
});
