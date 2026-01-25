import { ethers } from "hardhat";

export async function getBalance(addr: string): Promise<bigint> {
  return await ethers.provider.getBalance(addr);
}

export async function getTxCost(txHash: string): Promise<bigint> {
  const r = await ethers.provider.getTransactionReceipt(txHash);
  if (!r) throw new Error("missing receipt");
  // effectiveGasPrice is present on EIP-1559 receipts
  const price = (r as any).effectiveGasPrice ?? (await ethers.provider.getTransaction(txHash))?.gasPrice;
  if (!price) throw new Error("missing gas price");
  return BigInt(r.gasUsed.toString()) * BigInt(price.toString());
}
