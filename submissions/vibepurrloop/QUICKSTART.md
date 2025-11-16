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
pnpm i
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

### Run Tests Against Mainnet Fork

**Important:** You must set `POOL_ADDRESS` and `USDC_ADDRESS` environment variables before running tests.

```bash
cd foundry
# Set required environment variables
export HYPERLIQUID_RPC_URL=https://rpc.hyperliquid.xyz/evm
export POOL_ADDRESS=0x...  # HypurrFi Pool contract address
export USDC_ADDRESS=0x...  # USDC token address

# Run tests
forge test --fork-url hyperliquid -vvv
```

Or use the RPC URL directly:
```bash
export POOL_ADDRESS=0x...
export USDC_ADDRESS=0x...
forge test --fork-url $HYPERLIQUID_RPC_URL -vvv
```

**Note:** If environment variables are not set, the test will fail with a clear error message explaining what's missing.

### Fork at Specific Block (for reproducibility)

```bash
forge test --fork-url $HYPERLIQUID_RPC_URL --fork-block-number 37736779 -vvv
```

### Run Specific Test

```bash
forge test --fork-url hyperliquid --match-test testDeposit -vvv
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
