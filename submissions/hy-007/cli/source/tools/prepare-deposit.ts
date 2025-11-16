import {encodeFunctionData} from 'viem';

// ABI for deposit function
const VAULT_ABI = [
	{
		inputs: [{internalType: 'uint256', name: 'assets', type: 'uint256'}],
		name: 'deposit',
		outputs: [{internalType: 'uint256', name: 'userShares', type: 'uint256'}],
		stateMutability: 'nonpayable',
		type: 'function',
	},
] as const;

/**
 * Tool: Prepare deposit transaction
 * Prepares the transaction data for depositing into the vault
 */
export async function prepareDeposit(
	vaultAddress: string,
	amount: string, // Amount in USDC (will be converted to wei with 6 decimals)
): Promise<string> {
	try {
		// Validate address
		if (!vaultAddress || !vaultAddress.startsWith('0x')) {
			return 'Error: Invalid vault address';
		}

		// Parse amount (assuming 6 decimals for USDC)
		const amountFloat = parseFloat(amount);
		if (isNaN(amountFloat) || amountFloat <= 0) {
			return 'Error: Invalid amount. Please provide a positive number.';
		}

		// Convert to wei (6 decimals for USDC)
		const amountWei = BigInt(Math.floor(amountFloat * 1_000_000));

		// Encode function data
		const data = encodeFunctionData({
			abi: VAULT_ABI,
			functionName: 'deposit',
			args: [amountWei],
		});

		return JSON.stringify(
			{
				to: vaultAddress,
				data,
				value: '0',
				amount: amount,
				amountWei: amountWei.toString(),
				instructions: [
					'1. Approve the vault to spend your USDC:',
					`   - Token: USDC`,
					`   - Spender: ${vaultAddress}`,
					`   - Amount: ${amount} USDC (or max)`,
					'',
					'2. Execute the deposit transaction:',
					`   - To: ${vaultAddress}`,
					`   - Data: ${data}`,
					`   - Value: 0 ETH`,
					'',
					'3. The vault will automatically:',
					'   - Deposit your USDC as collateral',
					'   - Borrow against it to create leverage',
					'   - Mint vault shares to you',
				],
			},
			null,
			2,
		);
	} catch (error) {
		return `Error preparing deposit: ${error instanceof Error ? error.message : 'Unknown error'}`;
	}
}
