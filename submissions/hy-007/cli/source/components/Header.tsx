import React from 'react';
import { Box, Text } from 'ink';
import { EvaluationStatus, ViewType, BalanceSnapshot } from './types.js';

export type HeaderProps = {
	timeUntilNext: number;
	evaluationCount: number;
	evaluationStatus: EvaluationStatus;
	currentView: ViewType;
	latestBalance: BalanceSnapshot | null;
};

export const Header = ({
	timeUntilNext,
	evaluationCount,
	evaluationStatus,
	currentView,
	latestBalance,
}: HeaderProps) => {
	return (
		<Box
			borderStyle="single"
			borderBottom={true}
			paddingX={1}
			height={4}
			flexDirection="column"
		>
			<Box>
				<Text bold color="cyan">
					Agent CLI
				</Text>
				<Text> - Auto-evaluating every 30s</Text>
				{latestBalance && (
					<Text color="green"> | Balance: {latestBalance.formatted}</Text>
				)}
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
			<Box>
				<Text color="gray">
					Views: {' '}
					{['chat', 'balance', 'position', 'chart'].map((view, idx) => (
						<Text key={view}>
							{idx > 0 && ' | '}
							{currentView === view ? (
								<Text bold color="cyan">
									[{view.toUpperCase()}]
								</Text>
							) : (
								<Text>{view}</Text>
							)}
						</Text>
					))}
					<Text> | Press TAB to switch</Text>
				</Text>
			</Box>
		</Box>
	);
};

