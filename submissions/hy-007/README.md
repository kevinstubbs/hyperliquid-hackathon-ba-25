# HY-007

Team/Author: Kevin Stubbs

## What is it
A HypurrFi Leveraged Vault controlled by an agentic CLI. An agent burdened with glorious purpose.

## Features

- ✅ One-click leveraged deposits
- ✅ Automatic position management
- ✅ Health factor monitoring
- ✅ Easy withdrawal (full or partial)
- ✅ Real-time position tracking
- ✅ Next.js frontend with wallet integration

## Project Structure

```
hypurrfi-vault/
├── foundry/          # Smart contracts (Foundry)
│   ├── src/          # Contract source files
│   ├── script/       # Deployment and interaction scripts
│   └── test/         # Contract tests
└── frontend/         # Next.js frontend
    ├── app/          # Next.js app directory
    ├── components/   # React components
    └── lib/          # Utilities and contract ABIs
```

## Quick Start

### Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation)
- [Node.js](https://nodejs.org/) (v18+)
- [Anvil](https://book.getfoundry.sh/anvil/) (comes with Foundry)

### 1. Setup Environment Variables

Foundry automatically loads environment variables from a `.env` file in the `foundry/` directory.

```bash
# In foundry/ directory
cp .env.example .env
# Edit .env with your values
```

**Important:** Foundry will automatically load the `.env` file when you run `forge script` or `forge test`. The scripts use `vm.envAddress()` and `vm.envString()` to read these variables.

Your `.env` file should contain:
- `HYPERLIQUID_RPC_URL` - RPC endpoint URL
- `POOL_ADDRESS` - HypurrFi Pool contract address
- `USDC_ADDRESS` - USDC token address
- `VAULT_ADDRESS` - Vault address (set after deployment)

### 2. Install Dependencies

```bash
# Install Foundry dependencies
cd foundry
forge install

# Install frontend dependencies
cd ../frontend
npm install
```

### 3. Start Local Fork

```bash
# In foundry/ directory
# Set and export the RPC URL
export HYPERLIQUID_RPC_URL=https://rpc.hyperliquid-testnet.xyz/evm
# main: 999
# test: 998
anvil --chain-id 1337 --fork-url https://rpc.hyperliquid.xyz/evm 
```

### 4. Deploy Contracts (in new terminal)

```bash
cd foundry
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
```

### 5. Update Frontend Config

Copy the deployed vault address to `frontend/.env.local`:

```bash
NEXT_PUBLIC_VAULT_ADDRESS=0x... # Your deployed vault address
NEXT_PUBLIC_USDC_ADDRESS=0x...  # USDC address from HypurrFi
```

### 6. Start Frontend

```bash
cd frontend
npm run dev
```

Visit http://localhost:3000

## Testing

### Run Contract Tests on Mainnet Fork

There are several ways to run tests against a mainnet fork:

#### Method 1: Using RPC Endpoint Name (Recommended)

Since `foundry.toml` already defines the `hyperliquid` RPC endpoint, you can use it directly:

```bash
cd foundry
# Set required environment variables
export HYPERLIQUID_RPC_URL=https://rpc.hyperliquid.xyz/evm
export POOL_ADDRESS=0x...  # HypurrFi Pool contract address
export USDC_ADDRESS=0x...  # USDC token address

# Run tests
forge test --fork-url hyperliquid -vvv
```

**Important:** You must set `POOL_ADDRESS` and `USDC_ADDRESS` environment variables. The test will fail with a clear error message if they're missing.

#### Method 2: Using Direct RPC URL

```bash
cd foundry
export HYPERLIQUID_RPC_URL=https://rpc.hyperliquid.xyz/evm
export POOL_ADDRESS=0x...  # Required
export USDC_ADDRESS=0x...  # Required
forge test --fork-url $HYPERLIQUID_RPC_URL -vvv
```

Or inline:
```bash
export POOL_ADDRESS=0x...
export USDC_ADDRESS=0x...
forge test --fork-url https://rpc.hyperliquid.xyz/evm -vvv
```

#### Using .env File

You can also create a `.env` file in the `foundry/` directory:

```bash
# foundry/.env
HYPERLIQUID_RPC_URL=https://rpc.hyperliquid.xyz/evm
POOL_ADDRESS=0x...
USDC_ADDRESS=0x...
```

Then load it when running tests:
```bash
cd foundry
source .env  # Load environment variables
forge test --fork-url hyperliquid -vvv
```

#### Method 3: Fork at Specific Block Number

To test against a specific block (useful for reproducibility):

```bash
cd foundry
export HYPERLIQUID_RPC_URL=https://rpc.hyperliquid.xyz/evm
forge test --fork-url $HYPERLIQUID_RPC_URL --fork-block-number 37736779 -vvv
```

#### Method 4: Using Foundry's RPC Endpoint Name

If you have the RPC URL set in your environment, you can reference it by name:

```bash
cd foundry
# Make sure HYPERLIQUID_RPC_URL is set in your environment
forge test --fork-url hyperliquid -vvv
```

### Run Specific Test

```bash
# Run a specific test function
forge test --fork-url hyperliquid --match-test testDeposit -vvv

# Run tests matching a pattern
forge test --fork-url hyperliquid --match-test "test*" -vvv
```

### Verbosity Levels

- `-v` - Show test results
- `-vv` - Show logs for failing tests
- `-vvv` - Show logs for all tests
- `-vvvv` - Show traces for failing tests
- `-vvvvv` - Show traces for all tests

### View Position via CLI

```bash
cd foundry
forge script script/Interact.s.sol --rpc-url http://127.0.0.1:8545
```

```bash
cd foundry
forge script script/FullFlow.s.sol --rpc-url http://127.0.0.1:8545 --broadcast -vvv
```

## Usage

### Deposit

1. Connect wallet on frontend
2. Enter amount in USDC
3. Click "Deposit"
4. Approve USDC spending
5. Confirm deposit transaction

The vault will automatically:
- Supply your USDC to HypurrFi
- Borrow against it
- Re-supply borrowed funds
- Loop to target leverage (70% LTV)

### Withdraw

1. Enter shares to withdraw OR click "Full Exit"
2. Confirm withdrawal transaction

The vault will automatically:
- Unwind your leveraged position
- Repay all debt
- Return underlying USDC (minus 0.5% fee)

### Rebalance

If health factor gets low or LTV drifts, click "Rebalance" to adjust position back to target parameters.

## Strategy Parameters

- **Target LTV**: 70%
- **Max LTV**: 75%
- **Min Health Factor**: 1.15

## Contract Architecture

```
Hy007FreeVault
├── deposit()           - Deposit assets and receive shares
├── withdraw()          - Withdraw assets by burning shares
├── withdrawAll()       - Full exit from vault
├── getUserPosition()   - View user's position details
├── getVaultStats()     - View vault-wide statistics
├── rebalance()         - Adjust position if needed
└── emergencyExit()     - Emergency deleveraging
```

## Security Considerations

⚠️ **This is a demonstration project. Use at your own risk.**

- Smart contracts are not audited
- Test thoroughly on testnet before mainnet
- Understand leverage risks
- Monitor health factor regularly
- Liquidation can occur if health factor < 1.0

## Development

### Add New Assets

1. Update `DEPOSIT_ASSET` in deployment script
2. Ensure asset is listed on HypurrFi
3. Test leverage loop works correctly

### Modify Strategy Parameters

Edit in `Hy007FreeVault.sol`:
```solidity
uint256 public targetLTV = 7000;  // 70%
uint256 public maxLTV = 7500;     // 75%
```

### Run Local Tests

```bash
forge test -vvv
```

## Troubleshooting

### Anvil Fork Issues

If fork fails:
```bash
# Use specific block number
anvil --fork-url $HYPERLIQUID_RPC_URL --fork-block-number 1234567
```

### Transaction Failing

- Check you have USDC on local fork
- Verify contract addresses in .env
- Ensure approval is confirmed before deposit

### Frontend Not Connecting

- Verify MetaMask is on localhost network
- Chain ID should be 31337
- RPC URL: http://127.0.0.1:8545

## Resources

- [HypurrFi Docs](https://docs.hypurr.fi)
- [Foundry Book](https://book.getfoundry.sh/)
- [Next.js Docs](https://nextjs.org/docs)
- [Wagmi Docs](https://wagmi.sh)

## License

MIT
