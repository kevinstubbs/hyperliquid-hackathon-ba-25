import React, { useState, useEffect, useRef } from 'react';
import { Box, useInput, useApp } from 'ink';
import Anthropic from '@anthropic-ai/sdk';
import { EVALUATION_INTERVAL_MS } from './constants.js';
import {
	Message,
	EvaluationStatus,
	ViewType,
	PositionSnapshot,
	BalanceSnapshot,
} from './components/types.js';
import { Header } from './components/Header.js';
import { ChatView } from './components/ChatView.js';
import { BalanceView } from './components/BalanceView.js';
import { PositionView } from './components/PositionView.js';
import { ChartView } from './components/ChartView.js';
import { InputArea } from './components/InputArea.js';
import { useScreenSize } from './hooks/useScreenSize.js';
import { getTools } from './services/toolDefinitions.js';
import { handleToolCalls, ToolCall } from './services/toolHandlers.js';
import { buildSystemContext } from './utils/systemContext.js';
import { getEvaluationPrompt } from './prompts/evaluationPrompts.js';
import { getSystemMessage } from './prompts/systemPrompts.js';
import { processAnthropicResponse } from './services/anthropicService.js';

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
	const [currentView, setCurrentView] = useState<ViewType>('chat');
	const [positionHistory, setPositionHistory] = useState<PositionSnapshot[]>([]);
	const [balanceHistory, setBalanceHistory] = useState<BalanceSnapshot[]>([]);
	const [latestPosition, setLatestPosition] = useState<PositionSnapshot | null>(null);
	const [latestBalance, setLatestBalance] = useState<BalanceSnapshot | null>(null);
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

	// Helper function to handle tool calls
	const handleToolCallsWrapper = async (
		toolCalls: ToolCall[],
	): Promise<Array<{ type: 'tool_result'; tool_use_id: string; content: string }>> => {
		return handleToolCalls(toolCalls, {
			userAddress,
			vaultAddress,
			rpcUrl,
			usdcAddress,
			privateKey,
			setMessages,
			onPositionParsed: (snapshot) => {
				if (snapshot) {
					setLatestPosition(snapshot);
					setPositionHistory(prev => [...prev, snapshot].slice(-100));
				}
			},
			onBalanceParsed: (snapshot) => {
				if (snapshot) {
					setLatestBalance(snapshot);
					setBalanceHistory(prev => [...prev, snapshot].slice(-100));
				}
			},
		});
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
			const systemContext = buildSystemContext(userAddress, vaultAddress, usdcAddress);
			const evaluationPrompt = getEvaluationPrompt(systemContext, !!userAddress);

			const conversationMessages: any[] = [
				{
					role: 'user',
					content: evaluationPrompt,
				},
			];

			const responseText = await processAnthropicResponse(
				anthropicRef.current,
				toolsList,
				conversationMessages,
				handleToolCallsWrapper,
				setMessages,
			);

			if (responseText) {
				const resultMessage: Message = {
					id: `eval-result-${Date.now()}`,
					type: 'evaluation',
					content: `[OK] Evaluation complete: ${responseText}`,
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
			const systemContext = buildSystemContext(userAddress, vaultAddress, usdcAddress);
			const systemMessage = getSystemMessage(systemContext, !!userAddress);

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

			const responseText = await processAnthropicResponse(
				anthropicRef.current,
				toolsList,
				conversationMessages,
				handleToolCallsWrapper,
				setMessages,
			);

			if (responseText) {
				const assistantMessage: Message = {
					id: `assistant-${Date.now()}`,
					type: 'assistant',
					content: responseText,
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

		// Handle tab key to switch views (only when not waiting for address)
		if (!isWaitingForAddress && key.tab) {
			const views: ViewType[] = ['chat', 'balance', 'position', 'chart'];
			const currentIndex = views.indexOf(currentView);
			const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % views.length : 0;
			const nextView = views[nextIndex];
			if (nextView) {
				setCurrentView(nextView);
			}
			return;
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
			{/* Header - visible on all tabs */}
			<Header
				timeUntilNext={timeUntilNext}
				evaluationCount={evaluationCount}
				evaluationStatus={evaluationStatus}
				currentView={currentView}
				latestBalance={latestBalance}
			/>

			{/* Main content area - different views */}
			<Box flexDirection="column" flexGrow={1} paddingX={1} paddingY={1} width="100%" minHeight={1}>
				{currentView === 'chat' && (
					<ChatView
						messages={visibleMessages}
						isTyping={isTyping}
						canScrollUp={canScrollUp}
						canScrollDown={canScrollDown}
						actualScrollOffset={actualScrollOffset}
						maxScroll={maxScroll}
					/>
				)}
				{currentView === 'balance' && (
					<BalanceView
						latestBalance={latestBalance}
						balanceHistory={balanceHistory}
					/>
				)}
				{currentView === 'position' && (
					<PositionView
						latestPosition={latestPosition}
						positionHistory={positionHistory}
					/>
				)}
				{currentView === 'chart' && (
					<ChartView
						positionHistory={positionHistory}
						balanceHistory={balanceHistory}
						width={width}
					/>
				)}
			</Box>

			{/* Input area */}
			<InputArea
				input={input}
				isWaitingForAddress={isWaitingForAddress}
			/>
		</Box>
	);
}