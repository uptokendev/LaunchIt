import { expect } from "chai";
import hre from "hardhat";
import { Interface } from "ethers";  // <-- get Interface from ethers package

const { ethers } = await hre.network.connect();

// same helper style as factory test
async function waitForDeployment(contract) {
  if (typeof contract.waitForDeployment === "function") {
    await contract.waitForDeployment(); // ethers v6
  } else if (typeof contract.deployed === "function") {
    await contract.deployed(); // ethers v5
  }
}

describe("TokenTemplate", function () {
  let owner, alice, bob;
  let TokenTemplate;
  let token;

  beforeEach(async function () {
    [owner, alice, bob] = await ethers.getSigners();

    TokenTemplate = await ethers.getContractFactory("TokenTemplate");

    // 🔴 OLD (causes invalid overrides):
    // token = await TokenTemplate.deploy(owner.address);

    // ✅ NEW: no constructor args, matches the compiled contract ABI
    token = await TokenTemplate.deploy();

    await waitForDeployment(token);
  });

  it("sets the initial owner correctly (if constructor sets it)", async function () {
    // If your TokenTemplate constructor uses Ownable(msg.sender),
    // this will pass. If you still plan to set owner in initialize(),
    // you might need to adjust this expectation later.
    expect(await token.owner()).to.equal(owner.address);
  });

  it("initializes name, symbol and owner", async function () {
    await token.initialize("MyToken", "MTK", owner.address);

    expect(await token.name()).to.equal("MyToken");
    expect(await token.symbol()).to.equal("MTK");
    expect(await token.owner()).to.equal(owner.address);
  });

  it("reverts if initialize() is called twice", async function () {
    await token.initialize("AAA", "AAA", owner.address);

    await expect(
      token.initialize("BBB", "BBB", owner.address)
    ).to.be.revertedWith("Already initialized");
  });

  it("owner can grant minter role", async function () {
    await token.initialize("T", "T", owner.address);
    await token.grantMinter(alice.address);

    // no isMinter() in the contract, so we rely on AccessControl.hasRole
    const minterRole = await token.MINTER_ROLE();
    expect(await token.hasRole(minterRole, alice.address)).to.equal(true);
  });

  it("non-owner cannot grant minter role", async function () {
    await token.initialize("T", "T", owner.address);

    await expect(
      token.connect(alice).grantMinter(bob.address)
    ).to.be.revertedWithCustomError(token, "OwnableUnauthorizedAccount");
  });

  it("minter can mint tokens", async function () {
    await token.initialize("T", "T", owner.address);
    await token.grantMinter(owner.address);

    await token.mint(bob.address, 123);
    expect(await token.balanceOf(bob.address)).to.equal(123);
  });

  it("non-minter cannot mint", async function () {
    await token.initialize("T", "T", owner.address);

    await expect(
      token.connect(alice).mint(bob.address, 500)
    ).to.be.revertedWith("Not minter");
  });

  it("holder can burn their tokens", async function () {
    await token.initialize("T", "T", owner.address);
    await token.grantMinter(owner.address);

    await token.mint(owner.address, 1000);
    await token.burn(400);

    expect(await token.balanceOf(owner.address)).to.equal(600);
  });
});
