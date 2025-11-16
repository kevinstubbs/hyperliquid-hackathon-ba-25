export const formatError = (error: unknown, toolName: string): string => {
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

