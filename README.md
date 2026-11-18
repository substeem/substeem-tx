# @substeem/steem-sdk

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-6-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D20-green.svg)](https://nodejs.org/)

Lightweight and complete modern TypeScript SDK for the **Steem** blockchain, maintained by [Substeem](https://substeem.org) ([@substeem.app](https://steemit.com/@substeem.app)).
Zero runtime dependencies, ~35 KB gzipped. Works in Node.js, modern browsers, Chrome Manifest V3 extensions, workers, and serverless runtimes.

- **Zero Runtime Dependencies**: Noble cryptography (`@noble/curves`, `@noble/hashes`, `@noble/ciphers`) is compiled and inlined.
- **Native Fetch Transport**: No `axios` overhead or Node polyfills required. Built-in `AbortSignal.timeout` support.
- **Steem Native**: Configured with Steem Chain ID (`0000...`), `STM` address prefix, and live Steem RPC nodes.
- **Synchronous & Asynchronous Broadcast**: Native support for `condenser_api.broadcast_transaction_synchronous`.
- **Steem Keychain Ready**: Drop-in compatible with `steem-keychain-extension`.
- **Chain Math & Helpers**: Full calculations for STEEM Power (`vestsToSP`), mana, voting value, APR, reputation, and social operations.

---

## Installation

```bash
npm install @substeem/steem-sdk
```

---

## Quick Start

### 1. Simple RPC Call
```typescript
import { call } from '@substeem/steem-sdk'

const props = await call('condenser_api.get_dynamic_global_properties')
console.log('Head block:', props.head_block_number)
```

### 2. Create, Sign & Broadcast a Transaction
```typescript
import { Transaction, PrivateKey } from '@substeem/steem-sdk'

const tx = new Transaction()

// Compatible with both Keychain array syntax:
await tx.create([
  [
    'vote',
    {
      voter: 'substeem.app',
      author: 'steemit',
      permlink: 'firstpost',
      weight: 10000
    }
  ]
])

// Or fluent addOperation syntax:
// await tx.addOperation('vote', { ... })

// Sign transaction
const key = PrivateKey.from('5J...')
tx.sign(key)

// Broadcast synchronously to Steem
const result = await tx.broadcast()
console.log('Transaction confirmed! ID:', result.tx_id, 'Block:', result.block_num)
```

### 3. Steem Power and Mana Utilities
```typescript
import { utils } from '@substeem/steem-sdk'

// Convert VESTS to STEEM Power
const sp = await utils.vestsToSP(1_000_000)
console.log('SP:', sp)

// Calculate Voting Mana
const mana = await utils.getVotingMana('substeem.app')
console.log('Voting Power %:', mana.percentage)
```

---

## Building

```bash
npm install
npm run build
```

Build outputs dual ESM (`dist/index.mjs`) and CommonJS (`dist/index.cjs`) along with full TypeScript declarations (`dist/index.d.mts`, `dist/index.d.cts`).

---

## License

MIT
