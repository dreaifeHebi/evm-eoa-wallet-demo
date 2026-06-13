# EOA Wallet Lab

Minimal browser-only EVM EOA wallet demo.

## Features

- Create a random secp256k1 EOA wallet.
- Import a private key.
- Save and unlock an encrypted ethers JSON keystore in browser localStorage.
- Generate an EIP-191 login-style request, sign it, and recover the signer.
- Sign and verify EIP-712 typed data.
- Build a type-2 EVM transaction, sign it locally, and recover the signer.
- Optionally connect to an RPC endpoint to populate transaction fields, check balance/nonce, and broadcast a raw transaction.

## Cost model

- Creating/importing a wallet is local only.
- EIP-191 and EIP-712 signing is local only.
- Transaction `Sign only` is local only and spends no gas.
- `Broadcast` sends the raw transaction to the configured RPC. This can spend gas on the selected chain.

For a no-real-money transaction path, run a local dev chain such as Anvil or Hardhat on the same host and use:

```text
http://<devNuc-hostname-or-ip>:8545
```

## Commands

```bash
npm install
npm run dev
npm run build
npm run preview
```
