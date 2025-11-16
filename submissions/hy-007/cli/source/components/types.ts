export type Message = {
	id: string;
	type: 'user' | 'assistant' | 'evaluation';
	content: string;
	timestamp: Date;
};

export type EvaluationStatus = 'idle' | 'evaluating' | 'complete';

export type ViewType = 'chat' | 'balance' | 'position' | 'chart';

export type PositionSnapshot = {
	timestamp: Date;
	shares: string;
	underlyingAssets: string;
	collateralValue: string;
	debtValue: string;
	netValue: string;
	healthFactor: string;
	currentLTV: string;
	leverageRatio: string;
};

export type BalanceSnapshot = {
	timestamp: Date;
	balance: string;
	formatted: string;
};

