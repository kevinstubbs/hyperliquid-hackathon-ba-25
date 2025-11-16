import { Message } from '../components/types.js';
import { formatError } from '../utils/errorUtils.js';
import { parsePosition, parseBalance } from '../utils/dataParsing.js';
import { getHyperliquidMetadata } from '../tools/hyperliquid-metadata.js';
import { getUserPosition } from '../tools/user-position.js';
import { getUSDCBalance } from '../tools/usdc-balance.js';
import { prepareDeposit } from '../tools/prepare-deposit.js';
import { executeDeposit } from '../tools/execute-deposit.js';
import { rebalance } from '../tools/rebalance.js';
import { withdrawAll } from '../tools/withdraw-all.js';

export type ToolCall = {
	id: string;
	name: string;
	input: any;
};

export type ToolResult = {
	type: 'tool_result';
	tool_use_id: string;
	content: string;
};

export type ToolHandlerDependencies = {
	userAddress: string | null;
	vaultAddress: string;
	rpcUrl: string;
	usdcAddress: string;
	privateKey: string | null;
	setMessages: (updater: (prev: Message[]) => Message[]) => void;
	onPositionParsed: (snapshot: ReturnType<typeof parsePosition>) => void;
	onBalanceParsed: (snapshot: ReturnType<typeof parseBalance>) => void;
};

export const handleToolCalls = async (
	toolCalls: ToolCall[],
	deps: ToolHandlerDependencies,
): Promise<ToolResult[]> => {
	const toolResults: ToolResult[] = [];
	const {
		userAddress,
		vaultAddress,
		rpcUrl,
		usdcAddress,
		privateKey,
		setMessages,
		onPositionParsed,
		onBalanceParsed,
	} = deps;

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
				const parsed = parsePosition(result);
				if (parsed) {
					onPositionParsed(parsed);
				}
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
				const parsed = parseBalance(result);
				if (parsed) {
					onBalanceParsed(parsed);
				}
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
				const result = await withdrawAll(vaultAddress, privateKey, rpcUrl);
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

