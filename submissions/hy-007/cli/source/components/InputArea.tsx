import React from 'react';
import { Box, Text } from 'ink';

export type InputAreaProps = {
	input: string;
	isWaitingForAddress: boolean;
};

export const InputArea = ({ input, isWaitingForAddress }: InputAreaProps) => {
	return (
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
						: 'Type your message (Enter to send, TAB to switch views, ESC to exit):'}
				</Text>
			</Box>
			<Box>
				<Text color="white">
					{input}
					<Text inverse> </Text>
				</Text>
			</Box>
		</Box>
	);
};

