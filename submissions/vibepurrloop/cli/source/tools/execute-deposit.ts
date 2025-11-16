import { createWalletClient, createPublicClient, http, parseUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

// ERC20 ABI for approve
const ERC20_ABI = [
	{
		inputs: [
			{ internalType: 'address', name: 'spender', type: 'address' },
			{ internalType: 'uint256', name: 'amount', type: 'uint256' },
		],
		name: 'approve',
		outputs: [{ internalType: 'bool', name: '', type: 'bool' }],
		stateMutability: 'nonpayable',
		type: 'function',
	},
] as const;

// Vault ABI for deposit
const VAULT_ABI = [
	{
		inputs: [{ internalType: 'uint256', name: 'assets', type: 'uint256' }],
		name: 'deposit',
		outputs: [{ internalType: 'uint256', name: 'userShares', type: 'uint256' }],
		stateMutability: 'nonpayable',
		type: 'function',
	},
] as const;

/**
 * Tool: Execute deposit transaction
 * Automatically approves USDC spending and deposits into the vault
 */
export async function executeDeposit(
	vaultAddress: string,
	usdcAddress: string,
	amount: string, // Amount in USDC (will be converted to wei with 6 decimals)
	privateKey: string,
	rpcUrl: string,
): Promise<string> {
	try {
		// Validate addresses
		if (!vaultAddress || !vaultAddress.startsWith('0x')) {
			return 'Error: Invalid vault address';
		}
		if (!usdcAddress || !usdcAddress.startsWith('0x')) {
			return 'Error: Invalid USDC address';
		}
		if (!privateKey || !privateKey.startsWith('0x')) {
			return 'Error: Invalid private key';
		}

		// Parse amount (assuming 6 decimals for USDC)
		const amountFloat = parseFloat(amount);
		if (isNaN(amountFloat) || amountFloat <= 0) {
			return 'Error: Invalid amount. Please provide a positive number.';
		}

		// Convert to wei (6 decimals for USDC)
		const amountWei = parseUnits(amount, 6);

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

		// Step 1: Approve USDC spending
		results.push('Step 1: Approving USDC spending...');
		try {
			const approveHash = await walletClient.writeContract({
				address: usdcAddress as `0x${string}`,
				abi: ERC20_ABI,
				functionName: 'approve',
				args: [vaultAddress as `0x${string}`, amountWei],
				chain: undefined,
			});

			results.push(`[OK] Approval transaction sent: ${approveHash}`);
			results.push('Waiting for approval confirmation...');

			// Wait for transaction to be mined
			await publicClient.waitForTransactionReceipt({ hash: approveHash });
			results.push('[OK] Approval confirmed');
		} catch (error) {
			return `Error approving USDC: ${error instanceof Error ? error.message : 'Unknown error'}`;
		}

		// Step 2: Deposit into vault
		results.push('');
		results.push('Step 2: Depositing into vault...');
		try {
			const depositHash = await walletClient.writeContract({
				address: vaultAddress as `0x${string}`,
				abi: VAULT_ABI,
				functionName: 'deposit',
				args: [amountWei],
				chain: undefined,
			});

			results.push(`[OK] Deposit transaction sent: ${depositHash}`);
			results.push('Waiting for deposit confirmation...');

			// Wait for transaction to be mined
			const receipt = await publicClient.waitForTransactionReceipt({
				hash: depositHash,
			});

			results.push('[OK] Deposit confirmed');
			results.push(`Transaction hash: ${depositHash}`);
			results.push(`Block number: ${receipt.blockNumber}`);

			// Try to get the shares from the transaction receipt/logs
			// Note: This is a simplified version - in production you'd parse the logs
			results.push('');
			results.push('Deposit completed successfully!');
			results.push(`Amount deposited: ${amount} USDC`);
			results.push(`User address: ${userAddress}`);

			return results.join('\n');
		} catch (error) {
			return `Error depositing: ${error instanceof Error ? error.message : 'Unknown error'}`;
		}
	} catch (error) {
		return `Error executing deposit: ${error instanceof Error ? error.message : 'Unknown error'}`;
	}
}

