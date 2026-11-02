# Blockchain Decoder: Cryptocurrency Transaction Tracker

Blockchain Decoder is an Ethereum transaction monitoring and decoding project. It is intended to make on-chain activity easier to inspect by translating raw transactions and event logs into recognizable actions, then helping surface transactions that may influence token markets.

## Objective

The longer-term goal is to track and explain transactions that can shape market behavior or affect prices. This includes activity such as large swaps, liquidity changes, token mints and burns, and other contract actions that may be useful context when investigating a price move. Decoded transactions can provide clues about what happened on-chain; they do not, on their own, establish causation or predict future prices.

The current implementation is an early backend prototype. It listens for Ethereum mainnet blocks, retrieves transactions and receipts, decodes contract calls and logs, classifies common transaction kinds, and writes selected decoded transactions to local development files. The React client is still the Vite starter screen and is not yet connected to this data pipeline. A user-facing transaction tracker and market-impact analysis are future work.

## Technical Overview

- **Client:** React 19, TypeScript, and Vite. The client package includes build and ESLint scripts.
- **Server:** TypeScript running with `tsx`. A WebSocket subscription to Alchemy's Ethereum mainnet endpoint receives new block headers; JSON-RPC requests then fetch each block and its receipts.
- **Decoding:** Ethers provides ABI-based transaction-call and event-log decoding. The server classifies actions such as swaps, transfers, mints, burns, deposits, withdrawals, staking, and approvals.
- **Metadata:** Token and wallet labels are sourced from public lists and cached locally. Contract ABIs, proxy information, and externally owned account lookups are also cached in JSON files under `server/src/db/`.
- **Development artifacts:** Selected decoded transactions are written as Markdown files in `server/dev-tx/` for inspection.
- **Market analysis direction:** The decoded activity is groundwork for tracking potentially price-relevant transactions. The repository does not yet implement a complete price feed, impact calculation, alerting system, or connected dashboard.

## Requirements

- Node.js and npm
- An Alchemy API key for Ethereum mainnet
- An Etherscan API key for contract ABI lookups

Create `server/.env` with the following values:

```dotenv
ALCHEMY_API_KEY=your_alchemy_api_key
ETHERSCAN_API_KEY=your_etherscan_api_key
```

Keep API keys private and do not commit `.env` files.

## Setup and Development

From the repository root, install all workspace dependencies:

```sh
npm run install-all
```

Start the client and server together:

```sh
npm run dev
```

Or start either process separately:

```sh
npm run dev:client
npm run dev:server
```

The client is served by Vite (by default at `http://localhost:5173`). The server connects to Ethereum mainnet and processes new blocks while running. The server's `npm test` script runs the transaction-log parsing example; it is a parser smoke test, not a full automated test suite.

## Repository Layout

```text
client/       React and Vite application
server/       Ethereum listener, decoders, metadata caches, and development transaction files
server/src/   TypeScript server implementation
server/dev-tx/Decoded transaction examples
```