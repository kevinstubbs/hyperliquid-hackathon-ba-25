#!/bin/bash

# Deploy script that funds the test user with USDC and then deploys the vault
# Usage: ./script/deploy.sh [TEST_USER_ADDRESS]

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Check required environment variables
if [ -z "$USDC_ADDRESS" ]; then
    echo -e "${RED}Error: USDC_ADDRESS not set in .env${NC}"
    exit 1
fi

if [ -z "$POOL_ADDRESS" ]; then
    echo -e "${RED}Error: POOL_ADDRESS not set in .env${NC}"
    exit 1
fi

# Get test user address (from argument or env var, or use first anvil account)
if [ -n "$1" ]; then
    TEST_USER="$1"
elif [ -n "$TEST_USER" ]; then
    TEST_USER="$TEST_USER"
else
    # Default to first anvil account
    TEST_USER="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
fi

RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"
WHALE_ADDRESS="0x68e37dE8d93d3496ae143F2E900490f6280C57cD"
AMOUNT="100000000" # 100 USDC (6 decimals)

echo -e "${GREEN}============================================================${NC}"
echo -e "${GREEN}Deploy Script - Funding and Deployment${NC}"
echo -e "${GREEN}============================================================${NC}"
echo "RPC URL: $RPC_URL"
echo "USDC Address: $USDC_ADDRESS"
echo "Test User: $TEST_USER"
echo "Whale Address: $WHALE_ADDRESS"
echo ""

# Check if RPC is accessible
echo -e "${YELLOW}Checking RPC connection...${NC}"
if ! cast block-number --rpc-url "$RPC_URL" > /dev/null 2>&1; then
    echo -e "${RED}Error: Cannot connect to RPC at $RPC_URL${NC}"
    echo "Make sure Anvil is running: anvil --fork-url \$HYPERLIQUID_RPC_URL"
    exit 1
fi
echo -e "${GREEN}[OK] RPC connection OK${NC}"
echo ""

# Step 1: Check current balance
echo -e "${YELLOW}Step 1: Checking current USDC balance...${NC}"
CURRENT_BALANCE=$(cast balance --erc20 "$USDC_ADDRESS" "$TEST_USER" -r "$RPC_URL" 2>/dev/null || echo "0")
echo "Current balance: $CURRENT_BALANCE"
echo ""

# Step 2: Fund user if balance is 0
if [ "$CURRENT_BALANCE" = "0" ] || [ -z "$CURRENT_BALANCE" ]; then
    echo -e "${YELLOW}Step 2: Funding test user with 100 USDC...${NC}"
    
    # Check whale balance first
    WHALE_BALANCE=$(cast call "$USDC_ADDRESS" "balanceOf(address)(uint256)" "$WHALE_ADDRESS" -r "$RPC_URL" 2>/dev/null || echo "0")
    echo "Whale balance: $WHALE_BALANCE"
    
    if [ "$WHALE_BALANCE" = "0" ] || [ -z "$WHALE_BALANCE" ]; then
        echo -e "${RED}Error: Whale address has no USDC balance${NC}"
        echo "Trying alternative whale address..."
        WHALE_ADDRESS="0x462B95575cb2D56de9d1aAaAAb452279B058Aa06"
        WHALE_BALANCE=$(cast call "$USDC_ADDRESS" "balanceOf(address)(uint256)" "$WHALE_ADDRESS" -r "$RPC_URL" 2>/dev/null || echo "0")
        echo "Alternative whale balance: $WHALE_BALANCE"
        
        if [ "$WHALE_BALANCE" = "0" ] || [ -z "$WHALE_BALANCE" ]; then
            echo -e "${RED}Error: No whale found with USDC balance${NC}"
            exit 1
        fi
    fi
    
    # Impersonate the whale account
    echo "Impersonating whale account..."
    if ! cast rpc anvil_impersonateAccount "$WHALE_ADDRESS" --rpc-url "$RPC_URL" 2>&1; then
        echo -e "${YELLOW}Warning: Could not impersonate account (this is OK if Anvil allows it by default)${NC}"
    fi
    
    # Give the whale some ETH for gas (required when impersonating)
    echo "Funding whale with ETH for gas..."
    cast rpc anvil_setBalance "$WHALE_ADDRESS" "0x1000000000000000000" --rpc-url "$RPC_URL" > /dev/null 2>&1 || {
        echo -e "${YELLOW}Warning: Could not set balance (may not be needed)${NC}"
    }
    
    # Transfer USDC from whale to test user
    echo "Transferring $AMOUNT (100 USDC) to test user..."
    echo "Command: cast send $USDC_ADDRESS \"transfer(address,uint256)\" $TEST_USER $AMOUNT --rpc-url $RPC_URL --unlocked --from $WHALE_ADDRESS"
    
    if cast send "$USDC_ADDRESS" \
        "transfer(address,uint256)" "$TEST_USER" "$AMOUNT" \
        --rpc-url "$RPC_URL" \
        --unlocked \
        --from "$WHALE_ADDRESS" 2>&1; then
        echo -e "${GREEN}[OK] Successfully funded test user${NC}"
        
        # Verify the transfer
        echo "Verifying transfer..."
        NEW_BALANCE=$(cast balance --erc20 "$USDC_ADDRESS" "$TEST_USER" -r "$RPC_URL" 2>&1 || echo "0")
        echo "New balance: $NEW_BALANCE"
        
        # Check if balance actually increased
        if [ "$NEW_BALANCE" = "0" ] || [ -z "$NEW_BALANCE" ]; then
            echo -e "${RED}Error: Transfer may have failed - balance is still 0${NC}"
            exit 1
        fi
    else
        echo -e "${RED}Error: Failed to transfer USDC${NC}"
        echo "Make sure Anvil is running and the whale address has USDC balance"
        exit 1
    fi
    echo ""
else
    echo -e "${GREEN}[OK] User already has USDC balance, skipping funding${NC}"
    echo ""
fi

# Step 3: Deploy the vault
echo -e "${YELLOW}Step 3: Deploying Hy007FreeVault...${NC}"
export TEST_USER="$TEST_USER"

# Use the test user as the sender (deployer) - this is the first anvil account by default
DEPLOYER="${DEPLOYER:-$TEST_USER}"

forge script script/Deploy.s.sol \
    --rpc-url "$RPC_URL" \
    --broadcast \
    --sender "$DEPLOYER" \
    --unlocked \
    --gas-limit 30000000 \
    -vvv

echo ""
echo -e "${GREEN}============================================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}============================================================${NC}"

