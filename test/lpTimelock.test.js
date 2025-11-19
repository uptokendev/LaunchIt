import { expect } from "chai";
import hre from "hardhat";

const { ethers } = await hre.network.connect();
const { parseEther } = ethers;

// ✅ Helper to jump time using ethers.provider
async function setNextBlockTimestamp(timestamp) {
  await ethers.provider.send("evm_setNextBlockTimestamp", [timestamp]);
  await ethers.provider.send("evm_mine", []);
}

describe("LpTimelock", function () {
  let owner, beneficiary, other;
  let token;
  let LpTimelock;

  beforeEach(async function () {
    [owner, beneficiary, other] = await ethers.getSigners();

    // Use your TokenTemplate as the ERC20
    const TokenTemplate = await ethers.getContractFactory("TokenTemplate");
    token = await TokenTemplate.deploy();
    await token.waitForDeployment();

    // Initialize token so it behaves like in the other tests
    await token
      .connect(owner)
      .initialize("LP Token", "LPT", owner.address);

    LpTimelock = await ethers.getContractFactory("LpTimelock");
  });

  it("sets token, beneficiary and releaseTime in constructor", async function () {
    const tokenAddr = await token.getAddress();

    const latest = await ethers.provider.getBlock("latest");
    const now = latest.timestamp;
    const releaseTime = now + 3600; // 1 hour from now

    const timelock = await LpTimelock.deploy(
      tokenAddr,
      beneficiary.address,
      releaseTime
    );
    await timelock.waitForDeployment();

    expect(await timelock.token()).to.equal(tokenAddr);
    expect(await timelock.beneficiary()).to.equal(beneficiary.address);
    expect(await timelock.releaseTime()).to.equal(releaseTime);
  });

  it("reverts if releaseTime is not strictly in the future", async function () {
    const tokenAddr = await token.getAddress();
    const latest = await ethers.provider.getBlock("latest");
    const now = latest.timestamp;

    let errorEqual;
    try {
      await LpTimelock.deploy(tokenAddr, beneficiary.address, now);
    } catch (e) {
      errorEqual = e;
    }
    expect(errorEqual).to.be.an("Error");
    expect(String(errorEqual.message)).to.include("Release before now");

    let errorPast;
    try {
      await LpTimelock.deploy(tokenAddr, beneficiary.address, now - 1);
    } catch (e) {
      errorPast = e;
    }
    expect(errorPast).to.be.an("Error");
    expect(String(errorPast.message)).to.include("Release before now");
  });

  it("reverts release() before releaseTime", async function () {
    const tokenAddr = await token.getAddress();
    const latest = await ethers.provider.getBlock("latest");
    const now = latest.timestamp;
    const releaseTime = now + 3600;

    const timelock = await LpTimelock.deploy(
      tokenAddr,
      beneficiary.address,
      releaseTime
    );
    await timelock.waitForDeployment();

    let error;
    try {
      await timelock.connect(beneficiary).release();
    } catch (e) {
      error = e;
    }

    expect(error).to.be.an("Error");
    expect(String(error.message)).to.include("Not released");
  });

  it("reverts release() after time if no tokens locked", async function () {
    const tokenAddr = await token.getAddress();
    const latest = await ethers.provider.getBlock("latest");
    const now = latest.timestamp;
    const releaseTime = now + 3600;

    const timelock = await LpTimelock.deploy(
      tokenAddr,
      beneficiary.address,
      releaseTime
    );
    await timelock.waitForDeployment();

    // move just past releaseTime
    await setNextBlockTimestamp(releaseTime + 1);

    let error;
    try {
      await timelock.connect(beneficiary).release();
    } catch (e) {
      error = e;
    }

    expect(error).to.be.an("Error");
    expect(String(error.message)).to.include("No tokens");
  });

  it("releases full balance to beneficiary after releaseTime", async function () {
    const tokenAddr = await token.getAddress();
    const latest = await ethers.provider.getBlock("latest");
    const now = latest.timestamp;
    const releaseTime = now + 3600;

    const timelock = await LpTimelock.deploy(
      tokenAddr,
      beneficiary.address,
      releaseTime
    );
    await timelock.waitForDeployment();

    const timelockAddr = await timelock.getAddress();
    const amount = parseEther("1000");

    // owner has MINTER_ROLE by default from initialize()
    await token.connect(owner).mint(owner.address, amount);

    // send LP tokens to the timelock
    await token.connect(owner).transfer(timelockAddr, amount);

    const beforeBeneficiary = await token.balanceOf(beneficiary.address);
    const beforeLock = await token.balanceOf(timelockAddr);

    expect(beforeLock).to.equal(amount);

    // move time past releaseTime
    await setNextBlockTimestamp(releaseTime + 1);

    // release tokens
    const tx = await timelock.connect(beneficiary).release();
    await tx.wait();

    const afterBeneficiary = await token.balanceOf(beneficiary.address);
    const afterLock = await token.balanceOf(timelockAddr);

    expect(afterLock).to.equal(0n);
    expect(afterBeneficiary - beforeBeneficiary).to.equal(amount);
  });
});
