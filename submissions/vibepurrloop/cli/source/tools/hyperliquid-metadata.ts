import axios from 'axios';

/**
 * Tool: Get Hyperliquid token metadata
 * Fetches token metadata from Hyperliquid exchange API
 */
export async function getHyperliquidMetadata(): Promise<string> {
	try {
		const response = await axios.post('https://api.hyperliquid.xyz/info', {
			type: 'meta',
		}, {
			headers: {
				'Content-Type': 'application/json',
			},
		});

		return JSON.stringify(response.data, null, 2);
	} catch (error) {
		return `Error fetching Hyperliquid metadata: ${error instanceof Error ? error.message : 'Unknown error'}`;
	}
}
