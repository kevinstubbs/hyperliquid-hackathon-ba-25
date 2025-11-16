import React from 'react';
import { Box, Text } from 'ink';
import { BalanceSnapshot } from './types.js';

export type BalanceViewProps = {
	latestBalance: BalanceSnapshot | null;
	balanceHistory: BalanceSnapshot[];
};

export const BalanceView = ({ latestBalance, balanceHistory }: BalanceViewProps) => {
	return (
		<Box flexDirection="column" width="100%">
			<Box marginBottom={1}>
				<Text bold color="cyan">
					USDC Balance Information
				</Text>
			</Box>
			{latestBalance ? (
				<Box flexDirection="column" paddingLeft={2}>
					<Box marginBottom={1}>
						<Text>
							<Text bold>Current Balance:</Text> {latestBalance.formatted}
						</Text>
					</Box>
					<Box marginBottom={1}>
						<Text>
							<Text bold>Raw Balance:</Text> {latestBalance.balance}
						</Text>
					</Box>
					<Box marginBottom={1}>
						<Text>
							<Text bold>Last Updated:</Text>{' '}
							{latestBalance.timestamp.toLocaleString()}
						</Text>
					</Box>
					<Box marginTop={1}>
						<Text>
							<Text bold>History Points:</Text> {balanceHistory.length}
						</Text>
					</Box>
				</Box>
			) : (
				<Box paddingLeft={2}>
					<Text color="gray">No balance data available yet. Balance will appear after first check.</Text>
				</Box>
			)}
		</Box>
	);
};

