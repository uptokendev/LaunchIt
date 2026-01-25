# LaunchIt / Bonding-Curve Contracts — Fresh Hardhat Test Suite

## Quick start
```bash
npm i
npm test
```

Optional:
```bash
npm run coverage
npm run gas
```

## Notes
- Solidity compiler set to **0.8.24** (matches contracts).
- Includes a test-only helper contract `contracts/test/FactoryCaller.sol` to exercise `LaunchCampaign.buyExactTokensFor`.
