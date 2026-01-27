export const LAUNCH_FACTORY_ABI = [
  // events
  "event CampaignCreated(uint256 indexed id,address indexed campaign,address indexed token,address creator,string name,string symbol)",

  // view helpers for robust campaign discovery (avoids missing events due to RPC log issues)
  "function campaignsCount() view returns (uint256)",
  "function getCampaign(uint256 id) view returns (tuple(address campaign,address token,address creator,string name,string symbol,string logoURI,string xAccount,string website,string extraLink,uint64 createdAt))"
];

export const LAUNCH_CAMPAIGN_ABI = [
  "event TokensPurchased(address indexed buyer,uint256 amountOut,uint256 cost)",
  "event TokensSold(address indexed seller,uint256 amountIn,uint256 payout)",
  "event CampaignFinalized(address indexed caller,uint256 liquidityTokens,uint256 liquidityBnb,uint256 protocolFee,uint256 creatorPayout)"
];
