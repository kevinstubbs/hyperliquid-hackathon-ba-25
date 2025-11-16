#!/bin/bash

# Debug script for contract calls using cast
# Usage: ./script/debug-contract.sh [VAULT_ADDRESS] [USER_ADDRESS] [RPC_URL]

set -e

VAULT_ADDRESS="${1:-${VAULT_ADDRESS}}"
USER_ADDRESS="${2:-${USER_ADDRESS:-0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266}}"
RPC_URL="${3:-${RPC_URL:-http://127.0.0.1:8545}}"

if [ -z "$VAULT_ADDRESS" ]; then
    echo "Error: VAULT_ADDRESS not provided"
    echo "Usage: $0 <VAULT_ADDRESS> [USER_ADDRESS] [RPC_URL]"
    exit 1
fi

echo "============================================================"
echo "Debugging Contract Call"
echo "============================================================"
echo "Vault Address: $VAULT_ADDRESS"
echo "User Address: $USER_ADDRESS"
echo "RPC URL: $RPC_URL"
echo ""

# Step 1: Check if contract exists (has code)
echo "Step 1: Checking if contract exists..."
CODE_SIZE=$(cast code "$VAULT_ADDRESS" --rpc-url "$RPC_URL" | wc -c)
if [ "$CODE_SIZE" -lt 10 ]; then
    echo "[ERROR] Contract has no code at address $VAULT_ADDRESS"
    echo "   This address is not a contract or doesn't exist on this network"
    exit 1
fi
echo "[OK] Contract exists (code size: $CODE_SIZE bytes)"
echo ""

# Step 2: Get contract code (first 100 chars to verify it's a contract)
echo "Step 2: Verifying contract code..."
CODE=$(cast code "$VAULT_ADDRESS" --rpc-url "$RPC_URL" | head -c 100)
echo "Contract code (first 100 chars): $CODE..."
echo ""

# Step 3: Try to call getUserPosition
echo "Step 3: Calling getUserPosition function..."
echo "Function signature: getUserPosition(address)"
echo ""

# The function returns a tuple, so we need to decode it properly
# getUserPosition(address) returns (uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)
RESULT=$(cast call "$VAULT_ADDRESS" \
    "getUserPosition(address)(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)" \
    "$USER_ADDRESS" \
    --rpc-url "$RPC_URL" 2>&1) || {
    echo "[ERROR] Error calling getUserPosition:"
    echo "$RESULT"
    echo ""
    echo "Trying alternative: Check if function exists by calling with --trace..."
    cast call "$VAULT_ADDRESS" \
        "getUserPosition(address)(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)" \
        "$USER_ADDRESS" \
        --rpc-url "$RPC_URL" \
        --trace 2>&1 || true
    exit 1
}

echo "[OK] Function call successful!"
echo "Raw result: $RESULT"
echo ""

# Step 4: Parse and display the result
echo "Step 4: Parsing result..."
IFS=' ' read -ra VALUES <<< "$RESULT"
if [ ${#VALUES[@]} -eq 8 ]; then
    echo "Shares: ${VALUES[0]}"
    echo "Underlying Assets: ${VALUES[1]}"
    echo "Collateral Value: ${VALUES[2]}"
    echo "Debt Value: ${VALUES[3]}"
    echo "Net Value: ${VALUES[4]}"
    echo "Health Factor: ${VALUES[5]}"
    echo "Current LTV: ${VALUES[6]}"
    echo "Leverage Ratio: ${VALUES[7]}"
    echo ""
    
    # Convert to human-readable (assuming 6 decimals for USDC, 18 for others)
    SHARES=$(echo "scale=6; ${VALUES[0]} / 1000000000000000000" | bc 2>/dev/null || echo "${VALUES[0]}")
    UNDERLYING=$(echo "scale=6; ${VALUES[1]} / 1000000" | bc 2>/dev/null || echo "${VALUES[1]}")
    COLLATERAL=$(echo "scale=6; ${VALUES[2]} / 100000000" | bc 2>/dev/null || echo "${VALUES[2]}")
    DEBT=$(echo "scale=6; ${VALUES[3]} / 100000000" | bc 2>/dev/null || echo "${VALUES[3]}")
    NET=$(echo "scale=6; ${VALUES[4]} / 1000000" | bc 2>/dev/null || echo "${VALUES[4]}")
    HF=$(echo "scale=6; ${VALUES[5]} / 1000000000000000000" | bc 2>/dev/null || echo "${VALUES[5]}")
    LTV=$(echo "scale=2; ${VALUES[6]} / 100" | bc 2>/dev/null || echo "${VALUES[6]}")
    LEVERAGE=$(echo "scale=2; ${VALUES[7]} / 10000" | bc 2>/dev/null || echo "${VALUES[7]}")
    
    echo "Formatted values:"
    echo "  Shares: $SHARES"
    echo "  Underlying Assets: $UNDERLYING USDC"
    echo "  Collateral Value: $COLLATERAL"
    echo "  Debt Value: $DEBT"
    echo "  Net Value: $NET USDC"
    echo "  Health Factor: $HF"
    echo "  Current LTV: $LTV%"
    echo "  Leverage Ratio: ${LEVERAGE}x"
else
    echo "[WARNING] Unexpected number of return values: ${#VALUES[@]}"
    echo "Expected 8 values, got: ${VALUES[@]}"
fi

echo ""
echo "============================================================"

