export const VAULT_ADDRESS = process.env.NEXT_PUBLIC_VAULT_ADDRESS as `0x${string}`;
export const USDC_ADDRESS = process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}`;

export const VAULT_ABI = [
  {
    "inputs": [{"internalType": "uint256", "name": "assets", "type": "uint256"}],
    "name": "deposit",
    "outputs": [{"internalType": "uint256", "name": "userShares", "type": "uint256"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "userShares", "type": "uint256"}],
    "name": "withdraw",
    "outputs": [{"internalType": "uint256", "name": "assets", "type": "uint256"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "withdrawAll",
    "outputs": [{"internalType": "uint256", "name": "assets", "type": "uint256"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "address", "name": "user", "type": "address"}],
    "name": "getUserPosition",
    "outputs": [{
      "components": [
        {"internalType": "uint256", "name": "shares", "type": "uint256"},
        {"internalType": "uint256", "name": "underlyingAssets", "type": "uint256"},
        {"internalType": "uint256", "name": "collateralValue", "type": "uint256"},
        {"internalType": "uint256", "name": "debtValue", "type": "uint256"},
        {"internalType": "uint256", "name": "netValue", "type": "uint256"},
        {"internalType": "uint256", "name": "healthFactor", "type": "uint256"},
        {"internalType": "uint256", "name": "currentLTV", "type": "uint256"},
        {"internalType": "uint256", "name": "leverageRatio", "type": "uint256"}
      ],
      "internalType": "struct Hy007FreeVault.UserPosition",
      "name": "position",
      "type": "tuple"
    }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getVaultStats",
    "outputs": [{
      "components": [
        {"internalType": "uint256", "name": "totalShares", "type": "uint256"},
        {"internalType": "uint256", "name": "totalAssets", "type": "uint256"},
        {"internalType": "uint256", "name": "totalCollateral", "type": "uint256"},
        {"internalType": "uint256", "name": "totalDebt", "type": "uint256"},
        {"internalType": "uint256", "name": "currentAPY", "type": "uint256"},
        {"internalType": "uint256", "name": "healthFactor", "type": "uint256"},
        {"internalType": "address", "name": "collateralAsset", "type": "address"},
        {"internalType": "address", "name": "borrowAsset", "type": "address"}
      ],
      "internalType": "struct Hy007FreeVault.VaultStats",
      "name": "stats",
      "type": "tuple"
    }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "uint256", "name": "userShares", "type": "uint256"}],
    "name": "previewWithdraw",
    "outputs": [{"internalType": "uint256", "name": "assets", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "rebalance",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "healthFactor",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getTVL",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

export const ERC20_ABI = [
  {
    "inputs": [
      {"internalType": "address", "name": "spender", "type": "address"},
      {"internalType": "uint256", "name": "amount", "type": "uint256"}
    ],
    "name": "approve",
    "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "address", "name": "account", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {"internalType": "address", "name": "owner", "type": "address"},
      {"internalType": "address", "name": "spender", "type": "address"}
    ],
    "name": "allowance",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  }
] as const;
