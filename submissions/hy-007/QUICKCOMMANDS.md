More like a scratchpad without much explanation.


### Deploy
```bash
cd foundry
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
```

### Build & Run CLI
- User is anvil's 1st test user.
- Replace vault address with your deployed address.
- Replace -r with your RPC if you aren't running against local fork.
```bash
 npm run build && node dist/cli.js -u 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 -r http://127.0.0.1:8545 -v 0x9d4454B023096f34B160D6B654540c56A1F81688
```
