import Anthropic from '@anthropic-ai/sdk';
import { MAX_TOKENS } from '../constants.js';
import { Message } from '../components/types.js';
import { ToolCall, ToolResult } from './toolHandlers.js';

export const processAnthropicResponse = async (
	client: Anthropic,
	tools: any[],
	messages: any[],
	handleToolCalls: (toolCalls: ToolCall[]) => Promise<ToolResult[]>,
	setMessages: (updater: (prev: Message[]) => Message[]) => void,
): Promise<string | null> => {
	let response = await client.messages.create({
		model: 'claude-3-haiku-20240307',
		max_tokens: MAX_TOKENS,
		tools,
		messages,
	});

	// Handle tool use if needed
	while (response.stop_reason === 'tool_use') {
		const toolCalls: ToolCall[] = response.content
			.filter((block: any) => block.type === 'tool_use')
			.map((block: any) => ({
				id: block.id,
				name: block.name,
				input: block.input,
			}));

		if (toolCalls.length > 0) {
			const toolResults = await handleToolCalls(toolCalls);

			// Display tool results directly to user for tools that return detailed status
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
			messages.push({
				role: 'assistant',
				content: response.content,
			});

			messages.push({
				role: 'user',
				content: toolResults,
			});

			response = await client.messages.create({
				model: 'claude-3-haiku-20240307',
				max_tokens: MAX_TOKENS,
				tools,
				messages,
			});
		} else {
			break;
		}
	}

	const textResponse = response.content.find(
		(block: any) => block.type === 'text',
	);
	if (textResponse && textResponse.type === 'text') {
		return textResponse.text;
	}
	return null;
};

