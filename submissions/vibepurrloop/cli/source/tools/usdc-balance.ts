import { createPublicClient, http, formatUnits } from 'viem';

// ERC20 ABI for balanceOf
const ERC20_ABI = [
  {
    inputs: [{ internalType: 'address', name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'decimals',
    outputs: [{ internalType: 'uint8', name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/**
 * Tool: Get user's USDC balance
 * Fetches the user's USDC token balance
 */
export async function getUSDCBalance(
  usdcAddress: string,
  userAddress: string,
  rpcUrl: string,
): Promise<string> {
  try {
    console.log('usdcAddress', usdcAddress, userAddress);
    // Validate addresses
    if (!usdcAddress || !usdcAddress.startsWith('0x')) {
      return 'Error: Invalid USDC address';
    }
    if (!userAddress || !userAddress.startsWith('0x')) {
      return 'Error: Invalid user address';
    }

    // Create public client
    const client = createPublicClient({
      transport: http(rpcUrl),
    });

    // Get decimals (USDC typically has 6 decimals)
    let decimals = 6;
    try {
      const decimalsResult = await client.readContract({
        address: usdcAddress as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'decimals',
      });
      decimals = Number(decimalsResult);
    } catch {
      // Default to 6 if decimals call fails
    }

    // Get balance
    const balance = (await client.readContract({
      address: usdcAddress as `0x${string}`,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [userAddress as `0x${string}`],
    })) as bigint;

    const formattedBalance = formatUnits(balance, decimals);

    return JSON.stringify(
      {
        balance: formattedBalance,
        balanceRaw: balance.toString(),
        decimals,
        formatted: `${formattedBalance} USDC`,
      },
      null,
      2,
    );
  } catch (error) {
    return `Error fetching USDC balance: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}
