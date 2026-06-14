# EOA Wallet Lab

Minimal browser-only EVM EOA wallet demo.

## Features

- Create a random secp256k1 EOA wallet.
- Import a private key or seed phrase. Seed phrase import uses `m/44'/60'/0'/0/0`.
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

## Cloudflare Pages RPC

When this app is deployed on Cloudflare Pages, the browser cannot use a private LAN RPC URL such as `http://dev-nuc:8545`. Use one of these approaches:

- Public/testnet RPC: set a Cloudflare Pages build environment variable named `VITE_RPC_URL` to the HTTPS RPC URL you want the browser to call directly.
- Local dev-chain RPC: expose the local RPC through Cloudflare Tunnel, then set a Pages runtime variable named `RPC_TARGET_URL` to the tunnel HTTPS URL. The app will call the same-origin `/rpc` Pages Function, which forwards JSON-RPC requests to `RPC_TARGET_URL`.

For the tunnel path, create a Cloudflare Tunnel public hostname, for example:

```text
rpc.example.com -> http://localhost:8545
```

Then configure the Pages project:

```text
Build command: npm run build
Build output directory: dist
Runtime variable: RPC_TARGET_URL=https://rpc.example.com
```

Use this only for a throwaway local chain or a locked-down RPC. A public RPC endpoint lets anyone who can reach it submit JSON-RPC requests.

## Commands

```bash
npm install
npm run dev
npm run build
npm run preview
```
