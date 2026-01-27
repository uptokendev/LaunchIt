// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * Simple fee-on-transfer token for testing.
 * Charges feeBps (e.g., 1000 = 10%) and "burns" it by sending to address(0).
 */
contract MockFeeOnTransferERC20 {
    string public name = "FeeToken";
    string public symbol = "FEE";
    uint8 public decimals = 18;

    uint256 public totalSupply;
    uint256 public feeBps; // e.g., 1000 = 10%

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(uint256 _feeBps) {
        require(_feeBps <= 2000, "fee too high");
        feeBps = _feeBps;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        require(a >= amount, "ALLOWANCE");
        allowance[from][msg.sender] = a - amount;
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(balanceOf[from] >= amount, "BAL");

        uint256 fee = (amount * feeBps) / 10_000;
        uint256 net = amount - fee;

        balanceOf[from] -= amount;
        balanceOf[to] += net;

        // burn fee
        if (fee > 0) {
            balanceOf[address(0)] += fee;
            emit Transfer(from, address(0), fee);
        }

        emit Transfer(from, to, net);
    }
}