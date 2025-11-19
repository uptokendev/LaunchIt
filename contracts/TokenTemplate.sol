// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract TokenTemplate is ERC20Burnable, Ownable, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    uint8 private constant _DECIMALS = 18;

    string private _tokenName;
    string private _tokenSymbol;

    // flag to protect initialize() for both impl + clones
    bool private _initialized;

    constructor() ERC20("", "") Ownable(msg.sender) {
        // Implementation contract:
        // - owner = deployer (useful in tests)
        // Clones:
        // - this constructor is NOT executed; storage starts zeroed
    }

    /// @notice Factory (or anyone in tests) initializes a clone/instance
    function initialize(
        string memory name_,
        string memory symbol_,
        address initialOwner
    ) external {
        require(!_initialized, "Already initialized");
        require(initialOwner != address(0), "Owner zero");
        _initialized = true;

        // set real owner for this instance / clone
        _transferOwnership(initialOwner);

        // grant roles to the owner
        _grantRole(DEFAULT_ADMIN_ROLE, initialOwner);
        _grantRole(MINTER_ROLE, initialOwner);

        _tokenName = name_;
        _tokenSymbol = symbol_;
    }

    function decimals() public pure override returns (uint8) {
        return _DECIMALS;
    }

    function name() public view override returns (string memory) {
        return _tokenName;
    }

    function symbol() public view override returns (string memory) {
        return _tokenSymbol;
    }

    function mint(address to, uint256 amount) external {
        require(hasRole(MINTER_ROLE, _msgSender()), "Not minter");
        _mint(to, amount);
    }

    function revokeMinter(address sale) external onlyOwner {
        if (hasRole(MINTER_ROLE, sale)) {
            _revokeRole(MINTER_ROLE, sale);
        }
        if (hasRole(MINTER_ROLE, _msgSender())) {
        _revokeRole(MINTER_ROLE, _msgSender());
        }
    }

    function grantMinter(address sale) external onlyOwner {
        _grantRole(MINTER_ROLE, sale);
    }
}
