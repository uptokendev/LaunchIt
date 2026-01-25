import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", await deployer.getAddress());
  // Intentionally left minimal for test-focused repo.
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
