import { PositionSnapshot, BalanceSnapshot } from '../components/types.js';

export const parsePosition = (result: string): PositionSnapshot | null => {
	try {
		const parsed = JSON.parse(result);
		if (parsed.shares !== undefined) {
			return {
				timestamp: new Date(),
				shares: parsed.shares || '0',
				underlyingAssets: parsed.underlyingAssets || '0',
				collateralValue: parsed.collateralValue || '0',
				debtValue: parsed.debtValue || '0',
				netValue: parsed.netValue || '0',
				healthFactor: parsed.healthFactor || '0',
				currentLTV: parsed.currentLTV || '0%',
				leverageRatio: parsed.leverageRatio || '0x',
			};
		}
	} catch {
		// Ignore parse errors
	}
	return null;
};

export const parseBalance = (result: string): BalanceSnapshot | null => {
	try {
		const parsed = JSON.parse(result);
		if (parsed.balance !== undefined) {
			return {
				timestamp: new Date(),
				balance: parsed.balance || '0',
				formatted: parsed.formatted || '0 USDC',
			};
		}
	} catch {
		// Ignore parse errors
	}
	return null;
};

