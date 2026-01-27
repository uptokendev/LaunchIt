import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  const feeReceiver = process.env.FEE_RECEIVER;
  if (!feeReceiver) throw new Error("Missing FEE_RECEIVER env var");

  const UPVoteTreasury = await ethers.getContractFactory("UPVoteTreasury");
  const treasury = await UPVoteTreasury.deploy(deployer.address, feeReceiver);
  await treasury.waitForDeployment();

  const addr = await treasury.getAddress();
  console.log("UPVoteTreasury deployed to:", addr);

  // Configure minimums (example values; set yours)
  // Native BNB min: 0.005 BNB
  await (await treasury.setAsset(ethers.ZeroAddress, true, ethers.parseEther("0.005"))).wait();

  // Optional: set ERC20 mins (addresses depend on network)
  // await (await treasury.setAsset(USDT_ADDR, true, ethers.parseUnits("2", 18))).wait();

  console.log("Configured assets.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});