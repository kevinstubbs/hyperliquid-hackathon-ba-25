import React from 'react';
import { Box, Text } from 'ink';
import { PositionSnapshot } from './types.js';

export type PositionViewProps = {
	latestPosition: PositionSnapshot | null;
	positionHistory: PositionSnapshot[];
};

export const PositionView = ({ latestPosition, positionHistory }: PositionViewProps) => {
	return (
		<Box flexDirection="column" width="100%">
			<Box marginBottom={1}>
				<Text bold color="cyan">
					Vault Position Information
				</Text>
			</Box>
			{latestPosition ? (
				<Box flexDirection="column" paddingLeft={2}>
					<Box marginBottom={1}>
						<Text>
							<Text bold>Shares:</Text> {latestPosition.shares}
						</Text>
					</Box>
					<Box marginBottom={1}>
						<Text>
							<Text bold>Underlying Assets:</Text> {latestPosition.underlyingAssets} USDC
						</Text>
					</Box>
					<Box marginBottom={1}>
						<Text>
							<Text bold>Collateral Value:</Text> ${latestPosition.collateralValue}
						</Text>
					</Box>
					<Box marginBottom={1}>
						<Text>
							<Text bold>Debt Value:</Text> ${latestPosition.debtValue}
						</Text>
					</Box>
					<Box marginBottom={1}>
						<Text>
							<Text bold>Net Value:</Text> {latestPosition.netValue} USDC
						</Text>
					</Box>
					<Box marginBottom={1}>
						<Text>
							<Text bold>Health Factor:</Text>{' '}
							<Text color={parseFloat(latestPosition.healthFactor) < 1.0 ? 'red' : 'green'}>
								{latestPosition.healthFactor}
							</Text>
						</Text>
					</Box>
					<Box marginBottom={1}>
						<Text>
							<Text bold>Current LTV:</Text> {latestPosition.currentLTV}
						</Text>
					</Box>
					<Box marginBottom={1}>
						<Text>
							<Text bold>Leverage Ratio:</Text> {latestPosition.leverageRatio}
						</Text>
					</Box>
					<Box marginTop={1}>
						<Text>
							<Text bold>Last Updated:</Text>{' '}
							{latestPosition.timestamp.toLocaleString()}
						</Text>
					</Box>
					<Box marginTop={1}>
						<Text>
							<Text bold>History Points:</Text> {positionHistory.length}
						</Text>
					</Box>
				</Box>
			) : (
				<Box paddingLeft={2}>
					<Text color="gray">No position data available yet. Position will appear after first check.</Text>
				</Box>
			)}
		</Box>
	);
};

