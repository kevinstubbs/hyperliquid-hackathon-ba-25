import React from 'react';
import { Box, Text } from 'ink';
import { Sparkline } from '@pppp606/ink-chart';
import { PositionSnapshot, BalanceSnapshot } from './types.js';

export type ChartViewProps = {
	positionHistory: PositionSnapshot[];
	balanceHistory: BalanceSnapshot[];
	width: number;
};

export const ChartView = ({ positionHistory, balanceHistory, width }: ChartViewProps) => {
	return (
		<Box flexDirection="column" width="100%">
			<Box marginBottom={1}>
				<Text bold color="cyan">
					Historical Position & Balance Charts
				</Text>
			</Box>
			{positionHistory.length > 0 || balanceHistory.length > 0 ? (
				<Box flexDirection="column" paddingLeft={2}>
					{/* Sparkline chart for balance */}
					{balanceHistory.length > 0 && (
						<Box flexDirection="column" marginBottom={2}>
							<Text bold>USDC Balance Over Time</Text>
							<Box marginTop={1}>
								<Sparkline
									data={balanceHistory.map(b => parseFloat(b.balance))}
									width={Math.min(width - 20, 60)}
									colorScheme="green"
								/>
							</Box>
							<Box marginTop={1}>
								<Text color="gray">
									Min: {Math.min(...balanceHistory.map(b => parseFloat(b.balance))).toFixed(2)} |{' '}
									Max: {Math.max(...balanceHistory.map(b => parseFloat(b.balance))).toFixed(2)} |{' '}
									Current: {balanceHistory[balanceHistory.length - 1]?.balance || '0'}
								</Text>
							</Box>
						</Box>
					)}
					{/* Sparkline chart for net value */}
					{positionHistory.length > 0 && (
						<Box flexDirection="column" marginBottom={2}>
							<Text bold>Net Value Over Time</Text>
							<Box marginTop={1}>
								<Sparkline
									data={positionHistory.map(p => parseFloat(p.netValue))}
									width={Math.min(width - 20, 60)}
									colorScheme="blue"
								/>
							</Box>
							<Box marginTop={1}>
								<Text color="gray">
									Min: {Math.min(...positionHistory.map(p => parseFloat(p.netValue))).toFixed(2)} |{' '}
									Max: {Math.max(...positionHistory.map(p => parseFloat(p.netValue))).toFixed(2)} |{' '}
									Current: {positionHistory[positionHistory.length - 1]?.netValue || '0'} USDC
								</Text>
							</Box>
						</Box>
					)}
					{/* Sparkline chart for health factor */}
					{positionHistory.length > 0 && (
						<Box flexDirection="column" marginBottom={2}>
							<Text bold>Health Factor Over Time</Text>
							<Box marginTop={1}>
								<Sparkline
									data={positionHistory.map(p => parseFloat(p.healthFactor))}
									width={Math.min(width - 20, 60)}
									colorScheme="red"
									threshold={[1.0, 1.2, 1.5, 2.0]}
								/>
							</Box>
							<Box marginTop={1}>
								<Text color="gray">
									Min: {Math.min(...positionHistory.map(p => parseFloat(p.healthFactor))).toFixed(2)} |{' '}
									Max: {Math.max(...positionHistory.map(p => parseFloat(p.healthFactor))).toFixed(2)} |{' '}
									Current: {positionHistory[positionHistory.length - 1]?.healthFactor || '0'}
								</Text>
							</Box>
						</Box>
					)}
					{/* Sparkline chart for LTV */}
					{positionHistory.length > 0 && (
						<Box flexDirection="column">
							<Text bold>Current LTV Over Time</Text>
							<Box marginTop={1}>
								<Sparkline
									data={positionHistory.map(p => parseFloat(p.currentLTV.replace('%', '')))}
									width={Math.min(width - 20, 60)}
									colorScheme="green"
								/>
							</Box>
							<Box marginTop={1}>
								<Text color="gray">
									Min: {Math.min(...positionHistory.map(p => parseFloat(p.currentLTV.replace('%', '')))).toFixed(2)}% |{' '}
									Max: {Math.max(...positionHistory.map(p => parseFloat(p.currentLTV.replace('%', '')))).toFixed(2)}% |{' '}
									Current: {positionHistory[positionHistory.length - 1]?.currentLTV || '0%'}
								</Text>
							</Box>
						</Box>
					)}
				</Box>
			) : (
				<Box paddingLeft={2}>
					<Text color="gray">No historical data available yet. Charts will appear as data is collected.</Text>
				</Box>
			)}
		</Box>
	);
};

