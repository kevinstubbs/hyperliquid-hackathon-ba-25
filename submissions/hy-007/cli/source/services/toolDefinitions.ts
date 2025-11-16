export const getTools = (hasUserAddress: boolean, hasPrivateKey: boolean) => [
	{
		name: 'get_hyperliquid_metadata',
		description: 'Fetches token metadata from Hyperliquid exchange. Use this when you need information about available tokens, their symbols, or trading pairs on Hyperliquid.',
		input_schema: {
			type: 'object' as const,
			properties: {},
			required: [],
		},
	},
	...(hasUserAddress
		? [
			{
				name: 'get_user_position',
				description: 'CHECK BALANCE: Gets the user\'s CURRENT position in the HypurrFiVault by querying live blockchain data. Returns shares, collateral, debt, health factor, LTV, and leverage ratio. This is a READ-ONLY query - it does not perform any actions. ALWAYS use this tool to check the user\'s current position status - never rely on chat history or assumptions. If shares are 0, the user has no position.',
				input_schema: {
					type: 'object' as const,
					properties: {},
					required: [],
				},
			},
			{
				name: 'get_usdc_balance',
				description: 'CHECK BALANCE: Gets the user\'s CURRENT USDC token balance by querying live blockchain data. This is a READ-ONLY query - it does not perform any actions. ALWAYS use this tool to check how much USDC the user has available - never rely on chat history or assumptions about previous transactions.',
				input_schema: {
					type: 'object' as const,
					properties: {},
					required: [],
				},
			},
			...(hasPrivateKey
				? [
					{
						name: 'execute_deposit',
						description: 'DEPOSIT: Executes a deposit into the vault. This will approve USDC spending and deposit the specified amount. CRITICAL: Only use this when the user EXPLICITLY requests to deposit funds. NEVER deposit without explicit user consent. Provide the amount in USDC (e.g., "100" for 100 USDC).',
						input_schema: {
							type: 'object' as const,
							properties: {
								amount: {
									type: 'string',
									description: 'Amount of USDC to deposit (e.g., "100" for 100 USDC)',
								},
							},
							required: ['amount'],
						},
					},
					{
						name: 'rebalance',
						description: 'REBALANCE: Adjusts the vault position to maintain target LTV and health factor. This can be called automatically when the position needs adjustment (e.g., health factor is low, LTV has drifted). You can call this proactively to maintain optimal position health. This does NOT require explicit user consent - it is a maintenance operation.',
						input_schema: {
							type: 'object' as const,
							properties: {},
							required: [],
						},
					},
					{
						name: 'withdraw_all',
						description: 'WITHDRAW ALL: Withdraws all user shares from the vault (full exit). This exits the entire position and returns underlying assets. CRITICAL: Only use this when the user EXPLICITLY requests to withdraw all funds or exit their position. NEVER withdraw without explicit user consent.',
						input_schema: {
							type: 'object' as const,
							properties: {},
							required: [],
						},
					},
				]
				: [
					{
						name: 'prepare_deposit',
						description: 'Prepares a deposit transaction for the vault. Use this when the user wants to deposit USDC into the vault. Provide the amount in USDC (e.g., "100" for 100 USDC). Note: This only prepares the transaction - you need a private key to execute it automatically.',
						input_schema: {
							type: 'object' as const,
							properties: {
								amount: {
									type: 'string',
									description: 'Amount of USDC to deposit (e.g., "100" for 100 USDC)',
								},
							},
							required: ['amount'],
						},
					},
				]),
		]
		: []),
];

