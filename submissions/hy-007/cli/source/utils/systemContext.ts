export const buildSystemContext = (
	userAddress: string | null,
	vaultAddress: string,
	usdcAddress: string,
): string => {
	const contextParts: string[] = [];

	if (userAddress) {
		contextParts.push(`User address: ${userAddress}`);
	}
	if (vaultAddress) {
		contextParts.push(`Vault address: ${vaultAddress}`);
	}
	if (usdcAddress) {
		contextParts.push(`USDC address: ${usdcAddress}`);
	}

	if (contextParts.length > 0) {
		return `Configuration:\n${contextParts.join('\n')}\n\n`;
	}
	return '';
};

