import { ethers } from "hardhat";

export type CoreFixture = {
  owner: any;
  creator: any;
  alice: any;
  bob: any;
  feeRecipient: any;
  lpReceiver: any;
  router: any;
  factory: any;
};

export async function deployCoreFixture(): Promise<CoreFixture> {
  const [owner, creator, alice, bob, feeRecipient, lpReceiver] = await ethers.getSigners();

  const Router = await ethers.getContractFactory("MockRouter");
  const router = await Router.deploy(ethers.ZeroAddress, ethers.ZeroAddress);

  const Factory = await ethers.getContractFactory("LaunchFactory");
  const factory = await Factory.deploy(await router.getAddress());

  // Make fee recipient explicit for assertions
  await factory.connect(owner).setFeeRecipient(await feeRecipient.getAddress());

  // Use small, test-friendly config
  await factory.connect(owner).setConfig({
    totalSupply: ethers.parseEther("1000"),      // 1000 tokens
    curveBps: 5000,                              // 50% curve
    liquidityTokenBps: 4000,                     // 40% LP
    basePrice: 10n ** 12n,                       // 0.000001 native per token (scaled)
    priceSlope: 10n ** 9n,                       // slope
    graduationTarget: ethers.parseEther("1"),    // 1 native target
    liquidityBps: 8000                           // 80% of raised (after finalize fee) to LP
  });

  return { owner, creator, alice, bob, feeRecipient, lpReceiver, router, factory };
}
