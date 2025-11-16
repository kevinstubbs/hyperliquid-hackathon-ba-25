import React, { useState, useEffect, useRef } from 'react';
import { Box, Text, useInput, useApp, useStdout } from 'ink';
import Anthropic from '@anthropic-ai/sdk';
import { getHyperliquidMetadata } from './tools/hyperliquid-metadata.js';
import { getUserPosition } from './tools/user-position.js';
import { getUSDCBalance } from './tools/usdc-balance.js';
import { prepareDeposit } from './tools/prepare-deposit.js';

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
const getTools = (hasUserAddress: boolean) => [
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
				description: 'Gets the user\'s position in the HypurrFiVault. Returns shares, collateral, debt, health factor, LTV, and leverage ratio. Use this to check the user\'s current position status. If shares are 0, the user has no position.',
				input_schema: {
					type: 'object' as const,
					properties: {},
					required: [],
				},
			},
			{
				name: 'get_usdc_balance',
				description: 'Gets the user\'s USDC token balance. Use this to check how much USDC the user has available to deposit into the vault.',
				input_schema: {
					type: 'object' as const,
					properties: {},
					required: [],
				},
			},
			{
				name: 'prepare_deposit',
				description: 'Prepares a deposit transaction for the vault. Use this when the user wants to deposit USDC into the vault. Provide the amount in USDC (e.g., "100" for 100 USDC).',
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
};

export default function App({ apiKey, userAddress: initialUserAddress, vaultAddress: initialVaultAddress, rpcUrl: initialRpcUrl, usdcAddress: initialUsdcAddress }: Props) {
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
	const [isWaitingForAddress, setIsWaitingForAddress] = useState(!userAddress);
	const anthropicRef = useRef<Anthropic | null>(null);
	const evaluationTimerRef = useRef<NodeJS.Timeout | null>(null);
	const lastEvaluationTimeRef = useRef<Date>(new Date());
	const hasInitialEvaluationRef = useRef(false);

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
			}, 30_000); // 30 seconds
		};

		startEvaluationTimer();

		return () => {
			if (evaluationTimerRef.current) {
				clearInterval(evaluationTimerRef.current);
			}
		};
	}, []);

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
					content: `🔧 Using tool: get_hyperliquid_metadata`,
					timestamp: new Date(),
				};
				setMessages(prev => [...prev, toolMessage]);

				const result = await getHyperliquidMetadata();
				toolResults.push({
					type: 'tool_result' as const,
					tool_use_id: toolCall.id,
					content: result,
				});
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
					content: `🔧 Using tool: get_user_position`,
					timestamp: new Date(),
				};
				setMessages(prev => [...prev, toolMessage]);

				const result = await getUserPosition(vaultAddress, userAddress, rpcUrl);
				toolResults.push({
					type: 'tool_result' as const,
					tool_use_id: toolCall.id,
					content: result,
				});
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
					content: `🔧 Using tool: get_usdc_balance`,
					timestamp: new Date(),
				};
				setMessages(prev => [...prev, toolMessage]);

				const result = await getUSDCBalance(usdcAddress, userAddress, rpcUrl);
				toolResults.push({
					type: 'tool_result' as const,
					tool_use_id: toolCall.id,
					content: result,
				});
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
					content: `🔧 Using tool: prepare_deposit (${amount} USDC)`,
					timestamp: new Date(),
				};
				setMessages(prev => [...prev, toolMessage]);

				const result = await prepareDeposit(vaultAddress, amount);
				toolResults.push({
					type: 'tool_result' as const,
					tool_use_id: toolCall.id,
					content: result,
				});
			}
		}

		return toolResults;
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
			content: '🔍 Evaluating current state and context...',
			timestamp: new Date(),
		};

		setMessages(prev => [...prev, evaluationMessage]);

		try {
			const toolsList = getTools(!!userAddress);
			const evaluationPrompt = userAddress
				? 'You are an autonomous agent that evaluates its current state and context. You have access to tools to fetch Hyperliquid token metadata, check the user\'s position in the vault, check their USDC balance, and prepare deposit transactions. Always check the user\'s position first. If the user has no position (shares = 0), check their USDC balance and offer to help them enter a position by asking how much they want to deposit. Provide a brief evaluation of what you are observing or thinking about. Keep it concise (1-2 sentences).'
				: 'You are an autonomous agent that evaluates its current state and context. You have access to tools to fetch Hyperliquid token metadata if needed. Provide a brief evaluation of what you are observing or thinking about. Keep it concise (1-2 sentences).';

			const conversationMessages: any[] = [
				{
					role: 'user',
					content: evaluationPrompt,
				},
			];

			// Call Anthropic API for evaluation with tool support
			let response = await anthropicRef.current.messages.create({
				model: 'claude-3-haiku-20240307',
				max_tokens: 1024,
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
						max_tokens: 1024,
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
					content: `✅ Evaluation complete: ${evaluationResult.text}`,
					timestamp: new Date(),
				};

				setMessages(prev => [...prev, resultMessage]);
			}
		} catch (error) {
			const errorMessage: Message = {
				id: `eval-error-${Date.now()}`,
				type: 'evaluation',
				content: `❌ Evaluation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
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

		setMessages(prev => [...prev, userMessage]);
		const currentInput = input;
		setInput('');
		setIsTyping(true);

		try {
			const conversationHistory = messages
				.filter(m => m.type === 'user' || m.type === 'assistant')
				.map(m => ({
					role: (m.type === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
					content: m.content,
				}));

			const conversationMessages: any[] = [
				...conversationHistory,
				{
					role: 'user' as const,
					content: currentInput,
				},
			];

			// Call Anthropic API with tool support
			const toolsList = getTools(!!userAddress);
			let response = await anthropicRef.current.messages.create({
				model: 'claude-3-haiku-20240307',
				max_tokens: 1024,
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
						type: 'assistant',
						content: `🔧 Using tool: ${toolCalls.map(tc => tc.name).join(', ')}`,
						timestamp: new Date(),
					};
					setMessages(prev => [...prev, toolMessage]);

					const toolResults = await handleToolCalls(toolCalls);

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
						max_tokens: 1024,
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
						content: `✅ User address set: ${address}`,
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
						content: '❌ Invalid address format. Please enter a valid Ethereum address (0x...)',
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
	});

	// Calculate time until next evaluation
	const getTimeUntilNextEvaluation = () => {
		const now = new Date();
		const timeSinceLastEvaluation =
			now.getTime() - lastEvaluationTimeRef.current.getTime();
		const timeUntilNext = Math.max(0, 30_000 - timeSinceLastEvaluation);
		return Math.ceil(timeUntilNext / 1000);
	};

	const [timeUntilNext, setTimeUntilNext] = useState(getTimeUntilNextEvaluation());

	useEffect(() => {
		const interval = setInterval(() => {
			setTimeUntilNext(getTimeUntilNextEvaluation());
		}, 1000);

		return () => clearInterval(interval);
	}, [evaluationStatus]);

	// Get visible messages (last N messages that fit on screen)
	const visibleMessages = messages.slice(-Math.max(1, height - 8));

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
					</Text>
				</Box>
			</Box>

			{/* Messages area */}
			<Box flexDirection="column" flexGrow={1} paddingX={1} paddingY={1}>
				{visibleMessages.map(message => {
					const isEvaluation = message.type === 'evaluation';
					const isUser = message.type === 'user';
					const color = isEvaluation
						? 'yellow'
						: isUser
							? 'blue'
							: 'white';

					return (
						<Box key={message.id} marginBottom={1} flexDirection="column">
							<Box>
								<Text color={color} bold={isEvaluation}>
									{isEvaluation ? '🤖 [EVAL]' : isUser ? '👤 You' : '🤖 Agent'}:{' '}
								</Text>
							</Box>
							<Box paddingLeft={2}>
								<Text>{message.content}</Text>
							</Box>
						</Box>
					);
				})}
				{isTyping && (
					<Box>
						<Text color="gray">🤖 Agent is typing...</Text>
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