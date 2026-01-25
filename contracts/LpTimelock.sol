// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @dev Minimal timelock for LP tokens.
 * Holds an ERC20 and allows the beneficiary to claim after releaseTime.
 */
contract LpTimelock {
    IERC20 public immutable token;
    address public immutable beneficiary;
    uint256 public immutable releaseTime;

    constructor(IERC20 token_, address beneficiary_, uint256 releaseTime_) {
        require(address(token_) != address(0), "token=0");
        require(beneficiary_ != address(0), "beneficiary=0");
        require(releaseTime_ > block.timestamp, "releaseTime");
        token = token_;
        beneficiary = beneficiary_;
        releaseTime = releaseTime_;
    }

    function release() external {
        require(block.timestamp >= releaseTime, "not released");
        uint256 amount = token.balanceOf(address(this));
        require(amount > 0, "no tokens");
        require(token.transfer(beneficiary, amount), "transfer failed");
    }
}
