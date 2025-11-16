#!/usr/bin/env node
import 'dotenv/config';
import React from 'react';
import {render} from 'ink';
import meow from 'meow';
import App from './app.js';

const cli = meow(
	`
	Usage
	  $ cli

	Options
		--api-key       Anthropic API key (or set ANTHROPIC_API_KEY env var)
		--user-address  Your wallet address (or set USER_ADDRESS env var)
		--vault-address Vault contract address (or set VAULT_ADDRESS env var)
		--rpc-url       RPC URL for blockchain (or set RPC_URL env var)
		--usdc-address  USDC token address (or set USDC_ADDRESS env var)
		--private-key   Private key for automatic transactions (or set PRIVATE_KEY env var)

	Examples
	  $ cli
	  $ cli --api-key=sk-ant-... --user-address=0x...
	  $ cli --user-address=0x... --vault-address=0x...
`,
	{
		importMeta: import.meta,
		flags: {
			apiKey: {
				type: 'string',
				alias: 'k',
			},
			userAddress: {
				type: 'string',
				alias: 'u',
			},
			vaultAddress: {
				type: 'string',
				alias: 'v',
			},
			rpcUrl: {
				type: 'string',
				alias: 'r',
			},
			usdcAddress: {
				type: 'string',
			},
			privateKey: {
				type: 'string',
				alias: 'p',
			},
		},
	},
);

render(
	<App
		apiKey={cli.flags.apiKey}
		userAddress={cli.flags.userAddress}
		vaultAddress={cli.flags.vaultAddress}
		rpcUrl={cli.flags.rpcUrl}
		usdcAddress={cli.flags.usdcAddress}
		privateKey={cli.flags.privateKey}
	/>,
);
