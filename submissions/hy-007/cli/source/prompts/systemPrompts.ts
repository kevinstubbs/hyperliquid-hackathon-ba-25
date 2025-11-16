export const getSystemMessage = (
	systemContext: string,
	hasUserAddress: boolean,
): string | undefined => {
	if (hasUserAddress) {
		return `${systemContext}CRITICAL RULES FOR TOOL USAGE:
- CHECK BALANCE (get_user_position, get_usdc_balance): These are READ-ONLY queries. Use them freely to check current state.
- REBALANCE (rebalance): You can call this automatically at any time to maintain optimal position health. This does NOT require user consent - it's a maintenance operation.
- DEPOSIT (execute_deposit): ONLY use when the user EXPLICITLY requests to deposit funds. NEVER deposit without explicit user consent.
- WITHDRAW ALL (withdraw_all): ONLY use when the user EXPLICITLY requests to withdraw all funds or exit their position. NEVER withdraw without explicit user consent.

IMPORTANT: Always query live blockchain data using the available tools (get_user_position, get_usdc_balance, etc.). Never rely on chat history or make assumptions about the user's position, balance, or transaction history. Always verify current state by calling the appropriate tools before responding about positions, balances, or deposits.`;
	}
	return systemContext || undefined;
};

