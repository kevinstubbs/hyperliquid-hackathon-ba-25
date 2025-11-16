import { createWalletClient, createPublicClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// Vault ABI for withdrawAll
const VAULT_ABI = [
	{
		inputs: [],
		name: 'withdrawAll',
		outputs: [{ internalType: 'uint256', name: 'assets', type: 'uint256' }],
		stateMutability: 'nonpayable',
		type: 'function',
	},
] as const;

/**
 * Tool: Withdraw all shares (full exit)
 * Withdraws all user shares from the vault and returns underlying assets
 * IMPORTANT: This should ONLY be called when the user explicitly requests it
 */
export async function withdrawAll(
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
		const userAddress = account.address;

		// Create wallet and public clients
		const walletClient = createWalletClient({
			account,
			transport: http(rpcUrl),
		});

		const publicClient = createPublicClient({
			transport: http(rpcUrl),
		});

		const results: string[] = [];

		results.push('Withdrawing all shares from vault...');
		results.push('This will exit your entire position and return underlying assets.');
		results.push('');

		try {
			const withdrawHash = await walletClient.writeContract({
				address: vaultAddress as `0x${string}`,
				abi: VAULT_ABI,
				functionName: 'withdrawAll',
				args: [],
				chain: undefined,
			});

			results.push(`[OK] Withdraw transaction sent: ${withdrawHash}`);
			results.push('Waiting for withdrawal confirmation...');

			// Wait for transaction to be mined
			const receipt = await publicClient.waitForTransactionReceipt({
				hash: withdrawHash,
			});

			results.push('[OK] Withdrawal confirmed');
			results.push(`Transaction hash: ${withdrawHash}`);
			results.push(`Block number: ${receipt.blockNumber}`);
			results.push('');
			results.push('Full withdrawal completed successfully!');
			results.push(`User address: ${userAddress}`);
			results.push('All shares have been withdrawn and underlying assets returned (minus withdrawal fee).');

			return results.join('\n');
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			if (errorMessage.includes('No shares')) {
				return 'Error: You have no shares to withdraw.';
			}
			return `Error withdrawing: ${errorMessage}`;
		}
	} catch (error) {
		return `Error executing withdrawal: ${error instanceof Error ? error.message : 'Unknown error'}`;
	}
}

