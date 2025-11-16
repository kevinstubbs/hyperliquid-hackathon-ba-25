import {createPublicClient, http, formatUnits} from 'viem';

// ABI for getUserPosition function
const VAULT_ABI = [
	{
		inputs: [{internalType: 'address', name: 'user', type: 'address'}],
		name: 'getUserPosition',
		outputs: [
			{
				components: [
					{internalType: 'uint256', name: 'shares', type: 'uint256'},
					{internalType: 'uint256', name: 'underlyingAssets', type: 'uint256'},
					{internalType: 'uint256', name: 'collateralValue', type: 'uint256'},
					{internalType: 'uint256', name: 'debtValue', type: 'uint256'},
					{internalType: 'uint256', name: 'netValue', type: 'uint256'},
					{internalType: 'uint256', name: 'healthFactor', type: 'uint256'},
					{internalType: 'uint256', name: 'currentLTV', type: 'uint256'},
					{internalType: 'uint256', name: 'leverageRatio', type: 'uint256'},
				],
				internalType: 'struct Hy007FreeVault.UserPosition',
				name: 'position',
				type: 'tuple',
			},
		],
		stateMutability: 'view',
		type: 'function',
	},
] as const;

type UserPosition = {
	shares: bigint;
	underlyingAssets: bigint;
	collateralValue: bigint;
	debtValue: bigint;
	netValue: bigint;
	healthFactor: bigint;
	currentLTV: bigint;
	leverageRatio: bigint;
};

/**
 * Tool: Get user position from Hy007FreeVault
 * Fetches the user's position data from the vault contract
 */
export async function getUserPosition(
	vaultAddress: string,
	userAddress: string,
	rpcUrl: string,
): Promise<string> {
	try {
		// Validate addresses
		if (!vaultAddress || !vaultAddress.startsWith('0x')) {
			return 'Error: Invalid vault address';
		}
		if (!userAddress || !userAddress.startsWith('0x')) {
			return 'Error: Invalid user address';
		}

		// Create public client
		const client = createPublicClient({
			transport: http(rpcUrl),
		});

		// Call the contract
		const position = (await client.readContract({
			address: vaultAddress as `0x${string}`,
			abi: VAULT_ABI,
			functionName: 'getUserPosition',
			args: [userAddress as `0x${string}`],
		})) as UserPosition;

		// Format the response
		if (position.shares === 0n) {
			return JSON.stringify(
				{
					message: 'No position found',
					shares: '0',
					underlyingAssets: '0',
					collateralValue: '0',
					debtValue: '0',
					netValue: '0',
					healthFactor: '0',
					currentLTV: '0',
					leverageRatio: '0',
				},
				null,
				2,
			);
		}

		// Format values (assuming 6 decimals for USDC, 18 for others)
		const formatted = {
			shares: formatUnits(position.shares, 18),
			underlyingAssets: formatUnits(position.underlyingAssets, 6),
			collateralValue: formatUnits(position.collateralValue, 8),
			debtValue: formatUnits(position.debtValue, 8),
			netValue: formatUnits(position.netValue, 6),
			healthFactor: formatUnits(position.healthFactor, 18),
			currentLTV: formatUnits(position.currentLTV, 2),
			leverageRatio: formatUnits(position.leverageRatio, 4),
		};

		return JSON.stringify(
			{
				shares: formatted.shares,
				underlyingAssets: formatted.underlyingAssets,
				collateralValue: formatted.collateralValue,
				debtValue: formatted.debtValue,
				netValue: formatted.netValue,
				healthFactor: formatted.healthFactor,
				currentLTV: `${formatted.currentLTV}%`,
				leverageRatio: `${formatted.leverageRatio}x`,
			},
			null,
			2,
		);
	} catch (error) {
		console.error('Error fetching user position:', error);
		return `Error fetching user position: ${error instanceof Error ? error.message : 'Unknown error'}`;
	}
}
