import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// Vault ABI for rebalance
const VAULT_ABI = [
	{
		inputs: [],
		name: 'rebalance',
		outputs: [],
		stateMutability: 'nonpayable',
		type: 'function',
	},
] as const;

/**
 * Tool: Rebalance vault position
 * Adjusts the vault's position to maintain target LTV and health factor
 * This can be called automatically by the agent when needed
 */
export async function rebalance(
	vaultAddress: string,
	privateKey: string,
	rpcUrl: string,
): Promise<string> {
	try {
		// Validate addresses
		if (!vaultAddress || !vaultAddress.startsWith('0x')) {
			return 'Error: Invalid vault address';
		}
		if (!privateKey || !privateKey.startsWith('0x')) {
			return 'Error: Invalid private key';
		}

		// Create account from private key
		const account = privateKeyToAccount(privateKey as `0x${string}`);

		// Create wallet and public clients
		const walletClient = createWalletClient({
			account,
			transport: http(rpcUrl),
		});

		const publicClient = createPublicClient({
			transport: http(rpcUrl),
		});

		const results: string[] = [];

		results.push('Rebalancing vault position...');
		try {
			const rebalanceHash = await walletClient.writeContract({
				address: vaultAddress as `0x${string}`,
				abi: VAULT_ABI,
				functionName: 'rebalance',
				args: [],
				chain: undefined,
			});

			results.push(`[OK] Rebalance transaction sent: ${rebalanceHash}`);
			results.push('Waiting for rebalance confirmation...');

			// Wait for transaction to be mined
			const receipt = await publicClient.waitForTransactionReceipt({
				hash: rebalanceHash,
			});

			results.push('[OK] Rebalance confirmed');
			results.push(`Transaction hash: ${rebalanceHash}`);
			results.push(`Block number: ${receipt.blockNumber}`);
			results.push('');
			results.push('Rebalance completed successfully!');
			results.push('The vault position has been adjusted to maintain target LTV and health factor.');

			return results.join('\n');
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			// Check if rebalance failed because position is already healthy
			if (errorMessage.includes('Position healthy') || errorMessage.includes('healthy')) {
				return 'Rebalance skipped: Position is already healthy and within target parameters.';
			}
			return `Error rebalancing: ${errorMessage}`;
		}
	} catch (error) {
		return `Error executing rebalance: ${error instanceof Error ? error.message : 'Unknown error'}`;
	}
}

