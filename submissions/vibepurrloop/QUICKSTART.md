# Quick Start Guide

## 🚀 Get Up and Running in 5 Minutes

### Step 1: Configure Environment

```bash
# In foundry/ directory
cp .env.example .env
```

Edit `foundry/.env` and add:
- `HYPERLIQUID_RPC_URL` - Your HypurrFi RPC endpoint
- `POOL_ADDRESS` - HypurrFi Pool contract address
- `USDC_ADDRESS` - USDC token address

### Step 2: Install Dependencies

```bash
# Install Foundry contracts
cd foundry
forge install foundryrs/forge-std --no-commit

# Install frontend
cd ../frontend
npm install
```

### Step 3: Start Local Fork

```bash
# In foundry/ directory
anvil --fork-url $HYPERLIQUID_RPC_URL
```

Keep this terminal running.

### Step 4: Deploy Vault (in new terminal)

```bash
cd foundry
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
```

Copy the deployed vault address from the output.

### Step 5: Configure Frontend

```bash
cd ../frontend
cp .env.local.example .env.local
```

Edit `.env.local`:
```
NEXT_PUBLIC_VAULT_ADDRESS=0x... # Your deployed address
NEXT_PUBLIC_USDC_ADDRESS=0x...  # Same as foundry/.env
```

### Step 6: Start Frontend

```bash
npm run dev
```

Visit http://localhost:3000

### Step 7: Connect Wallet

1. Click "Connect Wallet"
2. Select MetaMask
3. Add localhost network:
   - Network Name: Localhost
   - RPC URL: http://127.0.0.1:8545
   - Chain ID: 31337
   - Currency: ETH

### Step 8: Test

You should see the vault interface. Try:
1. Deposit USDC
2. View your position
3. Withdraw

## 🧪 Running Tests

```bash
cd foundry
forge test --fork-url $HYPERLIQUID_RPC_URL -vvv
```

## 📊 View Position via CLI

```bash
cd foundry
forge script script/Interact.s.sol --rpc-url http://127.0.0.1:8545
```

## ⚠️ Troubleshooting

### "No USDC balance"
The fork needs USDC. Either:
1. Update whale addresses in test file
2. Use a different fork block number
3. Manually send USDC to your address on the fork

### "Transaction reverted"
Check:
1. Vault is deployed correctly
2. USDC address is correct in .env
3. Pool address is correct

### Frontend not connecting
Verify:
1. Anvil is running
2. MetaMask is on localhost network (Chain ID 31337)
3. .env.local has correct addresses

## 📚 Next Steps

- Read full [README.md](README.md)
- Explore contract in `foundry/src/HypurrFiVault.sol`
- Customize parameters (LTV, fees)
- Add your own features

## 🆘 Need Help?

Check the documentation:
- [Foundry Book](https://book.getfoundry.sh/)
- [HypurrFi Docs](https://docs.hypurr.fi)
- [Wagmi Docs](https://wagmi.sh)
