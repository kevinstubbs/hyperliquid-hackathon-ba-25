import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput, useApp, useStdout } from 'ink';
import Anthropic from '@anthropic-ai/sdk';
import { getHyperliquidMetadata } from './tools/hyperliquid-metadata.js';
import { getUserPosition } from './tools/user-position.js';
import { getUSDCBalance } from './tools/usdc-balance.js';
import { prepareDeposit } from './tools/prepare-deposit.js';
import { executeDeposit } from './tools/execute-deposit.js';
import { rebalance } from './tools/rebalance.js';
import { withdrawAll } from './tools/withdraw-all.js';
import { MAX_TOKENS, EVALUATION_INTERVAL_MS } from './constants.js';

type Message = {
	id: string;
	type: 'user' | 'assistant' | 'evaluation';
	content: string;
	timestamp: Date;
};

type EvaluationStatus = 'idle' | 'evaluating' | 'complete';

interface SizeType {
	width: number;
	height: number;
}

// Tool definitions for Anthropic API
const getTools = (hasUserAddress: boolean, hasPrivateKey: boolean) => [
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

function useScreenSize(): SizeType {
	const { stdout } = useStdout() as any;
	const [size, setSize] = useState(() => ({
		width: stdout.columns,
		height: stdout.rows,
	}));

	useEffect(() => {
		const onResize = () =>
			setSize({
				width: stdout.columns,
				height: stdout.rows,
			});

		stdout.on('resize', onResize);
		return () => void stdout.off('resize', onResize);
	}, [stdout]);

	return size;
}

type Props = {
	apiKey?: string;
	userAddress?: string;
	vaultAddress?: string;
	rpcUrl?: string;
	usdcAddress?: string;
	privateKey?: string;
};

export default function App({ apiKey, userAddress: initialUserAddress, vaultAddress: initialVaultAddress, rpcUrl: initialRpcUrl, usdcAddress: initialUsdcAddress, privateKey: initialPrivateKey }: Props) {
	const { exit } = useApp();
	const { width, height } = useScreenSize();
	const [messages, setMessages] = useState<Message[]>([]);
	const [input, setInput] = useState('');
	const [isTyping, setIsTyping] = useState(false);
	const [evaluationStatus, setEvaluationStatus] = useState<EvaluationStatus>('idle');
	const [evaluationCount, setEvaluationCount] = useState(0);
	const [isClientReady, setIsClientReady] = useState(false);
	const [userAddress, setUserAddress] = useState<string | null>(
		initialUserAddress || process.env['USER_ADDRESS'] || null,
	);
	const [vaultAddress] = useState<string>(
		initialVaultAddress || process.env['VAULT_ADDRESS'] || '',
	);
	const [rpcUrl] = useState<string>(
		initialRpcUrl || process.env['RPC_URL'] || process.env['HYPERLIQUID_RPC_URL'] || 'https://rpc.hyperliquid.xyz/evm',
	);
	const [usdcAddress] = useState<string>(
		initialUsdcAddress || process.env['USDC_ADDRESS'] || '0xb88339CB7199b77E23DB6E890353E22632Ba630f',
	);
	const [privateKey] = useState<string | null>(
		initialPrivateKey || process.env['PRIVATE_KEY'] || null,
	);
	const [isWaitingForAddress, setIsWaitingForAddress] = useState(!userAddress);
	const [scrollOffset, setScrollOffset] = useState(0);
	const anthropicRef = useRef<Anthropic | null>(null);
	const evaluationTimerRef = useRef<NodeJS.Timeout | null>(null);
	const lastEvaluationTimeRef = useRef<Date>(new Date());
	const hasInitialEvaluationRef = useRef(false);
	const userScrolledRef = useRef(false);

	// Initialize Anthropic client and show welcome message
	useEffect(() => {
		const key = apiKey || process.env['ANTHROPIC_API_KEY'];
		if (!key) {
			setMessages([
				{
					id: 'error-1',
					type: 'assistant',
					content: 'Error: ANTHROPIC_API_KEY environment variable is required',
					timestamp: new Date(),
				},
			]);
			return;
		}

		anthropicRef.current = new Anthropic({
			apiKey: key,
		});

		// Show welcome message
		const welcomeMessage: Message = {
			id: 'welcome-1',
			type: 'assistant',
			content: 'Welcome to Viberpurrloops Agent Terminal!',
			timestamp: new Date(),
		};

		const messagesToShow = [welcomeMessage];
		if (!userAddress) {
			const addressPrompt: Message = {
				id: 'address-prompt-1',
				type: 'assistant',
				content: 'Please enter your wallet address (0x...):',
				timestamp: new Date(),
			};
			messagesToShow.push(addressPrompt);
		}

		setMessages(messagesToShow);
		setIsClientReady(true);
	}, [apiKey]);

	// Trigger initial evaluation after client is ready (and address is set if needed)
	useEffect(() => {
		if (isClientReady && !hasInitialEvaluationRef.current && evaluationStatus === 'idle' && !isWaitingForAddress) {
			hasInitialEvaluationRef.current = true;
			// Trigger initial evaluation after a short delay
			const timer = setTimeout(() => {
				performEvaluation();
			}, 500);
			return () => {
				clearTimeout(timer);
			};
		}
		return undefined;
	}, [isClientReady, evaluationStatus, isWaitingForAddress]);

	// Set up 30-second evaluation timer
	useEffect(() => {
		const startEvaluationTimer = () => {
			if (evaluationTimerRef.current) {
				clearInterval(evaluationTimerRef.current);
			}

			evaluationTimerRef.current = setInterval(() => {
				performEvaluation();
			}, EVALUATION_INTERVAL_MS);
		};

		startEvaluationTimer();

		return () => {
			if (evaluationTimerRef.current) {
				clearInterval(evaluationTimerRef.current);
			}
		};
	}, []);

	// Helper function to format error details
	const formatError = (error: unknown, toolName: string): string => {
		if (error instanceof Error) {
			return JSON.stringify(
				{
					error: true,
					tool: toolName,
					message: error.message,
					stack: error.stack,
					name: error.name,
				},
				null,
				2,
			);
		}
		return JSON.stringify(
			{
				error: true,
				tool: toolName,
				message: String(error),
			},
			null,
			2,
		);
	};

	// Helper function to handle tool calls
	const handleToolCalls = async (
		toolCalls: Array<{ id: string; name: string; input: any }>,
	): Promise<Array<{ type: 'tool_result'; tool_use_id: string; content: string }>> => {
		const toolResults = [];

		for (const toolCall of toolCalls) {
			if (toolCall.name === 'get_hyperliquid_metadata') {
				const toolMessage: Message = {
					id: `tool-${Date.now()}`,
					type: 'evaluation',
					content: `[TOOL] Using tool: get_hyperliquid_metadata`,
					timestamp: new Date(),
				};
				setMessages(prev => [...prev, toolMessage]);

				try {
					const result = await getHyperliquidMetadata();
					toolResults.push({
						type: 'tool_result' as const,
						tool_use_id: toolCall.id,
						content: result,
					});
				} catch (error) {
					toolResults.push({
						type: 'tool_result' as const,
						tool_use_id: toolCall.id,
						content: formatError(error, toolCall.name),
					});
				}
			} else if (toolCall.name === 'get_user_position') {
				if (!userAddress || !vaultAddress) {
					toolResults.push({
						type: 'tool_result' as const,
						tool_use_id: toolCall.id,
						content: 'Error: User address and vault address must be configured to check position',
					});
					continue;
				}

				const toolMessage: Message = {
					id: `tool-${Date.now()}`,
					type: 'evaluation',
					content: `[TOOL] Using tool: get_user_position`,
					timestamp: new Date(),
				};
				setMessages(prev => [...prev, toolMessage]);

				try {
					const result = await getUserPosition(vaultAddress, userAddress, rpcUrl);
					toolResults.push({
						type: 'tool_result' as const,
						tool_use_id: toolCall.id,
						content: result,
					});
				} catch (error) {
					toolResults.push({
						type: 'tool_result' as const,
						tool_use_id: toolCall.id,
						content: formatError(error, toolCall.name),
					});
				}
			} else if (toolCall.name === 'get_usdc_balance') {
				if (!userAddress || !usdcAddress) {
					toolResults.push({
						type: 'tool_result' as const,
						tool_use_id: toolCall.id,
						content: 'Error: User address and USDC address must be configured to check balance',
					});
					continue;
				}

				const toolMessage: Message = {
					id: `tool-${Date.now()}`,
					type: 'evaluation',
					content: `[TOOL] Using tool: get_usdc_balance`,
					timestamp: new Date(),
				};
				setMessages(prev => [...prev, toolMessage]);

				try {
					const result = await getUSDCBalance(usdcAddress, userAddress, rpcUrl);
					toolResults.push({
						type: 'tool_result' as const,
						tool_use_id: toolCall.id,
						content: result,
					});
				} catch (error) {
					toolResults.push({
						type: 'tool_result' as const,
						tool_use_id: toolCall.id,
						content: formatError(error, toolCall.name),
					});
				}
			} else if (toolCall.name === 'execute_deposit') {
				if (!vaultAddress) {
					toolResults.push({
						type: 'tool_result' as const,
						tool_use_id: toolCall.id,
						content: 'Error: Vault address must be configured to execute deposit',
					});
					continue;
				}

				if (!privateKey) {
					toolResults.push({
						type: 'tool_result' as const,
						tool_use_id: toolCall.id,
						content: 'Error: Private key must be configured to execute deposit. Set PRIVATE_KEY environment variable.',
					});
					continue;
				}

				const amount = toolCall.input?.amount;
				if (!amount) {
					toolResults.push({
						type: 'tool_result' as const,
						tool_use_id: toolCall.id,
						content: 'Error: Amount is required. Please provide the amount of USDC to deposit.',
					});
					continue;
				}

				const toolMessage: Message = {
					id: `tool-${Date.now()}`,
					type: 'evaluation',
					content: `[TOOL] Using tool: execute_deposit (${amount} USDC)`,
					timestamp: new Date(),
				};
				setMessages(prev => [...prev, toolMessage]);

				try {
					const result = await executeDeposit(vaultAddress, usdcAddress, amount, privateKey, rpcUrl);
					toolResults.push({
						type: 'tool_result' as const,
						tool_use_id: toolCall.id,
						content: result,
					});
				} catch (error) {
					toolResults.push({
						type: 'tool_result' as const,
						tool_use_id: toolCall.id,
						content: formatError(error, toolCall.name),
					});
				}
			} else if (toolCall.name === 'prepare_deposit') {
				if (!vaultAddress) {
					toolResults.push({
						type: 'tool_result' as const,
						tool_use_id: toolCall.id,
						content: 'Error: Vault address must be configured to prepare deposit',
					});
					continue;
				}

				const amount = toolCall.input?.amount;
				if (!amount) {
					toolResults.push({
						type: 'tool_result' as const,
						tool_use_id: toolCall.id,
						content: 'Error: Amount is required. Please provide the amount of USDC to deposit.',
					});
					continue;
				}

				const toolMessage: Message = {
					id: `tool-${Date.now()}`,
					type: 'evaluation',
					content: `[TOOL] Using tool: prepare_deposit (${amount} USDC)`,
					timestamp: new Date(),
				};
				setMessages(prev => [...prev, toolMessage]);

				try {
					const result = await prepareDeposit(vaultAddress, amount);
					toolResults.push({
						type: 'tool_result' as const,
						tool_use_id: toolCall.id,
						content: result,
					});
				} catch (error) {
					toolResults.push({
						type: 'tool_result' as const,
						tool_use_id: toolCall.id,
						content: formatError(error, toolCall.name),
					});
				}
			} else if (toolCall.name === 'rebalance') {
				if (!vaultAddress) {
					toolResults.push({
						type: 'tool_result' as const,
						tool_use_id: toolCall.id,
						content: 'Error: Vault address must be configured to rebalance',
					});
					continue;
				}

				if (!privateKey) {
					toolResults.push({
						type: 'tool_result' as const,
						tool_use_id: toolCall.id,
						content: 'Error: Private key must be configured to rebalance. Set PRIVATE_KEY environment variable.',
					});
					continue;
				}

				const toolMessage: Message = {
					id: `tool-${Date.now()}`,
					type: 'evaluation',
					content: `[TOOL] Using tool: rebalance`,
					timestamp: new Date(),
				};
				setMessages(prev => [...prev, toolMessage]);

				try {
					const result = await rebalance(vaultAddress, privateKey, rpcUrl);
					toolResults.push({
						type: 'tool_result' as const,
						tool_use_id: toolCall.id,
						content: result,
					});
				} catch (error) {
					toolResults.push({
						type: 'tool_result' as const,
						tool_use_id: toolCall.id,
						content: formatError(error, toolCall.name),
					});
				}
			} else if (toolCall.name === 'withdraw_all') {
				if (!vaultAddress) {
					toolResults.push({
						type: 'tool_result' as const,
						tool_use_id: toolCall.id,
						content: 'Error: Vault address must be configured to withdraw',
					});
					continue;
				}

				if (!privateKey) {
					toolResults.push({
						type: 'tool_result' as const,
						tool_use_id: toolCall.id,
						content: 'Error: Private key must be configured to withdraw. Set PRIVATE_KEY environment variable.',
					});
					continue;
				}

				const toolMessage: Message = {
					id: `tool-${Date.now()}`,
					type: 'evaluation',
					content: `[TOOL] Using tool: withdraw_all`,
					timestamp: new Date(),
				};
				setMessages(prev => [...prev, toolMessage]);

				try {
					const result = await withdrawAll(vaultAddress, privateKey, rpcUrl, usdcAddress);
					toolResults.push({
						type: 'tool_result' as const,
						tool_use_id: toolCall.id,
						content: result,
					});
				} catch (error) {
					toolResults.push({
						type: 'tool_result' as const,
						tool_use_id: toolCall.id,
						content: formatError(error, toolCall.name),
					});
				}
			}
		}

		return toolResults;
	};

	// Helper function to build system context with addresses (NEVER includes private keys)
	const buildSystemContext = (): string => {
		const contextParts: string[] = [];
		
		if (userAddress) {
			contextParts.push(`User address: ${userAddress}`);
		}
		if (vaultAddress) {
			contextParts.push(`Vault address: ${vaultAddress}`);
		}
		if (usdcAddress) {
			contextParts.push(`USDC address: ${usdcAddress}`);
		}
		
		if (contextParts.length > 0) {
			return `Configuration:\n${contextParts.join('\n')}\n\n`;
		}
		return '';
	};

	const performEvaluation = async () => {
		if (!anthropicRef.current || evaluationStatus === 'evaluating') {
			return;
		}

		setEvaluationStatus('evaluating');
		setEvaluationCount(prev => prev + 1);
		lastEvaluationTimeRef.current = new Date();

		const evaluationMessage: Message = {
			id: `eval-${Date.now()}`,
			type: 'evaluation',
			content: '[EVAL] Evaluating current state and context...',
			timestamp: new Date(),
		};

		setMessages(prev => [...prev, evaluationMessage]);

		try {
			const toolsList = getTools(!!userAddress, !!privateKey);
			const systemContext = buildSystemContext();
			const evaluationPrompt = userAddress
				? `${systemContext}You are an autonomous agent that evaluates its current state and context. You have access to tools to fetch Hyperliquid token metadata, check the user's position in the vault, check their USDC balance, execute deposit transactions, rebalance the vault, and withdraw all funds.

CRITICAL RULES FOR TOOL USAGE:
- CHECK BALANCE (get_user_position, get_usdc_balance): These are READ-ONLY queries. Use them freely to check current state.
- REBALANCE (rebalance): You can call this automatically at any time to maintain optimal position health. This does NOT require user consent - it's a maintenance operation.
- DEPOSIT (execute_deposit): ONLY use when the user EXPLICITLY requests to deposit funds. NEVER deposit without explicit user consent.
- WITHDRAW ALL (withdraw_all): ONLY use when the user EXPLICITLY requests to withdraw all funds or exit their position. NEVER withdraw without explicit user consent.

IMPORTANT: Always query live blockchain data using the available tools. Never rely on chat history or make assumptions about the user's position, balance, or transaction history. Always check the user's position first using get_user_position. If the user has no position (shares = 0), check their USDC balance using get_usdc_balance and offer to help them enter a position. If the position needs rebalancing (low health factor, LTV drift), you can proactively call rebalance. Provide a brief evaluation of what you are observing from the live data. Keep it concise (1-2 sentences).`
				: `${systemContext}You are an autonomous agent that evaluates its current state and context. You have access to tools to fetch Hyperliquid token metadata if needed. Provide a brief evaluation of what you are observing or thinking about. Keep it concise (1-2 sentences).`;

			const conversationMessages: any[] = [
				{
					role: 'user',
					content: evaluationPrompt,
				},
			];

			// Call Anthropic API for evaluation with tool support
			let response = await anthropicRef.current.messages.create({
				model: 'claude-3-haiku-20240307',
				max_tokens: MAX_TOKENS,
				tools: toolsList,
				messages: conversationMessages,
			});

			// Handle tool use if needed
			while (response.stop_reason === 'tool_use') {
				const toolCalls = response.content
					.filter((block: any) => block.type === 'tool_use')
					.map((block: any) => ({
						id: block.id,
						name: block.name,
						input: block.input,
					}));

				if (toolCalls.length > 0) {
					const toolResults = await handleToolCalls(toolCalls);

					// Display tool results directly to user for tools that return detailed status
					// This ensures users see all status updates (especially for execute_deposit, rebalance, withdraw_all)
					for (const toolResult of toolResults) {
						const toolCall = toolCalls.find(tc => tc.id === toolResult.tool_use_id);
						// Display results for transaction tools and any tool that returns multi-line output
						if (
							toolCall?.name === 'execute_deposit' ||
							toolCall?.name === 'rebalance' ||
							toolCall?.name === 'withdraw_all' ||
							toolResult.content.includes('\n')
						) {
							const resultMessage: Message = {
								id: `tool-result-${Date.now()}-${toolResult.tool_use_id}`,
								type: 'evaluation',
								content: `[TOOL] ${toolCall?.name || 'Tool'} Result:\n${toolResult.content}`,
								timestamp: new Date(),
							};
							setMessages(prev => [...prev, resultMessage]);
						}
					}

					// Add tool results to conversation and continue
					conversationMessages.push({
						role: 'assistant',
						content: response.content,
					});

					conversationMessages.push({
						role: 'user',
						content: toolResults,
					});

					response = await anthropicRef.current.messages.create({
						model: 'claude-3-haiku-20240307',
						max_tokens: MAX_TOKENS,
						tools: toolsList,
						messages: conversationMessages,
					});
				} else {
					break;
				}
			}

			const evaluationResult = response.content.find(
				(block: any) => block.type === 'text',
			);
			if (evaluationResult && evaluationResult.type === 'text') {
				const resultMessage: Message = {
					id: `eval-result-${Date.now()}`,
					type: 'evaluation',
					content: `[OK] Evaluation complete: ${evaluationResult.text}`,
					timestamp: new Date(),
				};

				setMessages(prev => [...prev, resultMessage]);
			}
		} catch (error) {
			const errorMessage: Message = {
				id: `eval-error-${Date.now()}`,
				type: 'evaluation',
					content: `[ERROR] Evaluation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
				timestamp: new Date(),
			};

			setMessages(prev => [...prev, errorMessage]);
		} finally {
			setEvaluationStatus('complete');
			// Reset to idle after a short delay
			setTimeout(() => {
				setEvaluationStatus('idle');
			}, 2000);
		}
	};

	const sendMessage = async () => {
		if (!input.trim() || !anthropicRef.current || isTyping) {
			return;
		}

		const userMessage: Message = {
			id: `user-${Date.now()}`,
			type: 'user',
			content: input.trim(),
			timestamp: new Date(),
		};

		const currentInput = input.trim();
		setInput('');
		setIsTyping(true);

		// Build conversation history from existing messages BEFORE adding the new user message
		// This prevents duplication and ensures proper message ordering
		const conversationHistory = messages
			.filter(m => m.type === 'user' || m.type === 'assistant')
			.map(m => ({
				role: (m.type === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
				content: m.content,
			}));

		// Now add the user message to the UI
		setMessages(prev => [...prev, userMessage]);

		try {
			// Build system message with addresses and instructions (NEVER includes private keys)
			const systemContext = buildSystemContext();
			const systemMessage = userAddress
				? `${systemContext}CRITICAL RULES FOR TOOL USAGE:
- CHECK BALANCE (get_user_position, get_usdc_balance): These are READ-ONLY queries. Use them freely to check current state.
- REBALANCE (rebalance): You can call this automatically at any time to maintain optimal position health. This does NOT require user consent - it's a maintenance operation.
- DEPOSIT (execute_deposit): ONLY use when the user EXPLICITLY requests to deposit funds. NEVER deposit without explicit user consent.
- WITHDRAW ALL (withdraw_all): ONLY use when the user EXPLICITLY requests to withdraw all funds or exit their position. NEVER withdraw without explicit user consent.

IMPORTANT: Always query live blockchain data using the available tools (get_user_position, get_usdc_balance, etc.). Never rely on chat history or make assumptions about the user's position, balance, or transaction history. Always verify current state by calling the appropriate tools before responding about positions, balances, or deposits.`
				: systemContext || undefined;

			const conversationMessages: any[] = systemMessage
				? [
						{
							role: 'user' as const,
							content: systemMessage,
						},
						...conversationHistory,
						{
							role: 'user' as const,
							content: currentInput,
						},
					]
				: [
						...conversationHistory,
						{
							role: 'user' as const,
							content: currentInput,
						},
					];

			// Call Anthropic API with tool support
			const toolsList = getTools(!!userAddress, !!privateKey);
			let response = await anthropicRef.current.messages.create({
				model: 'claude-3-haiku-20240307',
				max_tokens: MAX_TOKENS,
				tools: toolsList,
				messages: conversationMessages,
			});

			// Handle tool use if needed
			while (response.stop_reason === 'tool_use') {
				const toolCalls = response.content
					.filter((block: any) => block.type === 'tool_use')
					.map((block: any) => ({
						id: block.id,
						name: block.name,
						input: block.input,
					}));

				if (toolCalls.length > 0) {
					const toolMessage: Message = {
						id: `tool-${Date.now()}`,
						type: 'evaluation',
						content: `[TOOL] Using tool: ${toolCalls.map(tc => tc.name).join(', ')}`,
						timestamp: new Date(),
					};
					setMessages(prev => [...prev, toolMessage]);

					const toolResults = await handleToolCalls(toolCalls);

					// Display tool results directly to user for tools that return detailed status
					// This ensures users see all status updates (especially for execute_deposit, rebalance, withdraw_all)
					for (const toolResult of toolResults) {
						const toolCall = toolCalls.find(tc => tc.id === toolResult.tool_use_id);
						// Display results for transaction tools and any tool that returns multi-line output
						if (
							toolCall?.name === 'execute_deposit' ||
							toolCall?.name === 'rebalance' ||
							toolCall?.name === 'withdraw_all' ||
							toolResult.content.includes('\n')
						) {
							const resultMessage: Message = {
								id: `tool-result-${Date.now()}-${toolResult.tool_use_id}`,
								type: 'evaluation',
								content: `[TOOL] ${toolCall?.name || 'Tool'} Result:\n${toolResult.content}`,
								timestamp: new Date(),
							};
							setMessages(prev => [...prev, resultMessage]);
						}
					}

					// Add tool results to conversation and continue
					conversationMessages.push({
						role: 'assistant',
						content: response.content,
					});

					conversationMessages.push({
						role: 'user',
						content: toolResults,
					});

					response = await anthropicRef.current.messages.create({
						model: 'claude-3-haiku-20240307',
						max_tokens: MAX_TOKENS,
						tools: toolsList,
						messages: conversationMessages,
					});
				} else {
					break;
				}
			}

			const assistantResponse = response.content.find(
				(block: any) => block.type === 'text',
			);
			if (assistantResponse && assistantResponse.type === 'text') {
				const assistantMessage: Message = {
					id: `assistant-${Date.now()}`,
					type: 'assistant',
					content: assistantResponse.text,
					timestamp: new Date(),
				};

				setMessages(prev => [...prev, assistantMessage]);
			}
		} catch (error) {
			const errorMessage: Message = {
				id: `error-${Date.now()}`,
				type: 'assistant',
				content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
				timestamp: new Date(),
			};

			setMessages(prev => [...prev, errorMessage]);
		} finally {
			setIsTyping(false);
		}
	};

	useInput((input, key) => {
		if (key.escape || (key.ctrl && input === 'c')) {
			exit();
			return;
		}

		// Handle address input
		if (isWaitingForAddress) {
			if (key.return) {
				const address = input.trim();
				if (address && address.startsWith('0x') && address.length === 42) {
					setUserAddress(address);
					setIsWaitingForAddress(false);
					setInput('');
					const addressMessage: Message = {
						id: `address-${Date.now()}`,
						type: 'assistant',
						content: `[OK] User address set: ${address}`,
						timestamp: new Date(),
					};
					setMessages(prev => [...prev, addressMessage]);
					// Trigger initial evaluation now that address is set
					if (isClientReady && !hasInitialEvaluationRef.current) {
						hasInitialEvaluationRef.current = true;
						setTimeout(() => {
							performEvaluation();
						}, 500);
					}
				} else if (address) {
					const errorMessage: Message = {
						id: `error-${Date.now()}`,
						type: 'assistant',
						content: '[ERROR] Invalid address format. Please enter a valid Ethereum address (0x...)',
						timestamp: new Date(),
					};
					setMessages(prev => [...prev, errorMessage]);
					setInput('');
				}
				return;
			}

			if (key.backspace || key.delete) {
				setInput(prev => prev.slice(0, prev.length - 1));
				return;
			}

			// Ignore special keys
			if (
				key.ctrl ||
				key.meta ||
				key.upArrow ||
				key.downArrow ||
				key.leftArrow ||
				key.rightArrow
			) {
				return;
			}

			// Add character to input
			setInput(prev => prev + input);
			return;
		}

		// Normal chat input
		if (key.return) {
			sendMessage();
			return;
		}

		if (key.backspace || key.delete) {
			setInput(prev => prev.slice(0, prev.length - 1));
			return;
		}

		// Handle scrolling with arrow keys (when not waiting for address input)
		if (!isWaitingForAddress) {
			if (key.upArrow) {
				setScrollOffset(prev => {
					userScrolledRef.current = true;
					return Math.min(prev + 1, Math.max(0, messages.length - (height - 8)));
				});
				return;
			}
			if (key.downArrow) {
				setScrollOffset(prev => {
					const newOffset = Math.max(0, prev - 1);
					if (newOffset === 0) {
						userScrolledRef.current = false;
					}
					return newOffset;
				});
				return;
			}
			// Page up/down for faster scrolling
			if (key.pageUp) {
				setScrollOffset(prev => {
					userScrolledRef.current = true;
					return Math.min(prev + 10, Math.max(0, messages.length - (height - 8)));
				});
				return;
			}
			if (key.pageDown) {
				setScrollOffset(prev => {
					const newOffset = Math.max(0, prev - 10);
					if (newOffset === 0) {
						userScrolledRef.current = false;
					}
					return newOffset;
				});
				return;
			}
		}

		// Ignore other special keys
		if (key.ctrl || key.meta || key.leftArrow || key.rightArrow) {
			return;
		}

		// Add character to input
		setInput(prev => prev + input);
	});

	// Calculate time until next evaluation
	const getTimeUntilNextEvaluation = () => {
		const now = new Date();
		const timeSinceLastEvaluation =
			now.getTime() - lastEvaluationTimeRef.current.getTime();
		const timeUntilNext = Math.max(0, EVALUATION_INTERVAL_MS - timeSinceLastEvaluation);
		return Math.ceil(timeUntilNext / 1000);
	};

	const [timeUntilNext, setTimeUntilNext] = useState(getTimeUntilNextEvaluation());

	useEffect(() => {
		const interval = setInterval(() => {
			setTimeUntilNext(getTimeUntilNextEvaluation());
		}, 1000);

		return () => clearInterval(interval);
	}, [evaluationStatus]);

	// Auto-scroll to bottom when new messages arrive (unless user has scrolled up)
	useEffect(() => {
		if (!userScrolledRef.current) {
			setScrollOffset(0);
		}
	}, [messages.length]);

	// Calculate visible messages based on scroll offset
	const messagesToShow = height - 8; // Reserve space for header and input
	const maxScroll = Math.max(0, messages.length - messagesToShow);
	const actualScrollOffset = Math.min(scrollOffset, maxScroll);
	const visibleMessages = messages.slice(
		Math.max(0, messages.length - messagesToShow - actualScrollOffset),
		messages.length - actualScrollOffset,
	);
	const canScrollUp = actualScrollOffset < maxScroll;
	const canScrollDown = actualScrollOffset > 0;

	return (
		<Box flexDirection="column" width={width} height={height}>
			{/* Header */}
			<Box
				borderStyle="single"
				borderBottom={true}
				paddingX={1}
				height={3}
				flexDirection="column"
			>
				<Box>
					<Text bold color="cyan">
						Agent CLI
					</Text>
					<Text> - Auto-evaluating every 30s</Text>
				</Box>
				<Box>
					<Text color="gray">
						Next evaluation in: {timeUntilNext}s | Evaluations: {evaluationCount} |
						Status:{' '}
						{evaluationStatus === 'evaluating' ? (
							<Text color="yellow">Evaluating...</Text>
						) : (
							<Text color="green">Idle</Text>
						)}
						{canScrollUp && (
							<Text color="gray"> | [UP] Scroll up</Text>
						)}
						{canScrollDown && (
							<Text color="gray"> | [DOWN] Scroll down</Text>
						)}
						{actualScrollOffset > 0 && (
							<Text color="gray"> | Scroll: {actualScrollOffset}/{maxScroll}</Text>
						)}
					</Text>
				</Box>
			</Box>

			{/* Messages area */}
			<Box flexDirection="column" flexGrow={1} paddingX={1} paddingY={1} width="100%">
				{visibleMessages.map(message => {
					const isEvaluation = message.type === 'evaluation';
					const isUser = message.type === 'user';
					const color = isEvaluation
						? 'yellow'
						: isUser
							? 'blue'
							: 'white';

					return (
						<Box key={message.id} marginBottom={1} flexDirection="column" width="100%">
							<Box>
								<Text color={color} bold={isEvaluation}>
									{isEvaluation ? '[EVAL]' : isUser ? '[YOU]' : '[AGENT]'}:{' '}
								</Text>
							</Box>
							<Box paddingLeft={2} width="100%">
								<Text wrap="wrap">{message.content}</Text>
							</Box>
						</Box>
					);
				})}
				{isTyping && (
					<Box>
						<Text color="gray">[AGENT] Agent is typing...</Text>
					</Box>
				)}
			</Box>

			{/* Input area */}
			<Box
				borderStyle="single"
				borderTop={true}
				paddingX={1}
				height={3}
				flexDirection="column"
			>
				<Box>
					<Text color="gray">
						{isWaitingForAddress
							? 'Enter your wallet address (0x...):'
							: 'Type your message (Enter to send, ESC to exit):'}
					</Text>
				</Box>
				<Box>
					<Text color="white">
						{input}
						<Text inverse> </Text>
					</Text>
				</Box>
			</Box>
		</Box>
	);
}