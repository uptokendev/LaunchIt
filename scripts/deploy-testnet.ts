import { ethers } from "hardhat";

async function main() {
  const router = process.env.PANCAKE_V2_ROUTER!;
  const feeRecipient = process.env.FEE_RECIPIENT!;
  const protocolFeeBps = BigInt(process.env.PROTOCOL_FEE_BPS ?? "200");

  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Router:", router);

  const Factory = await ethers.getContractFactory("LaunchFactory");
  const factory = await Factory.deploy(router);
  await factory.waitForDeployment();

  const factoryAddr = await factory.getAddress();
  console.log("LaunchFactory deployed:", factoryAddr);

  // Update fee recipient if you don’t want it to remain deployer
  if (feeRecipient.toLowerCase() !== deployer.address.toLowerCase()) {
    const tx = await factory.setFeeRecipient(feeRecipient);
    await tx.wait();
    console.log("FeeRecipient set:", feeRecipient);
  }

  // Optional: set protocol fee (constructor sets 200 already)
  if (protocolFeeBps !== 200n) {
    const tx = await factory.setProtocolFee(protocolFeeBps);
    await tx.wait();
    console.log("ProtocolFeeBps set:", protocolFeeBps.toString());
  }

  // Optional: setConfig if you want to override defaults
  // await (await factory.setConfig({ ... })).wait();

  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
