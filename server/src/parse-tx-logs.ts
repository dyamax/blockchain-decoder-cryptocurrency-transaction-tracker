import { readFile } from "node:fs/promises";
import { BLOCKCHAINS } from "./config/chains.js";

type KindLike = string | { name: string; priority: number } | null | undefined;

type EventLog = {
    name?: string;
    signature?: string;
    topic?: string;
    args?: Array<string | number | bigint | boolean | null | undefined>;
    fragment?: { inputs?: Array<{ name: string; type: string; indexed?: boolean }> };
};

type RawTransaction = {
    meta?: { kind?: KindLike };
    call?: unknown | null;
    logs?: EventLog[];
};

type NormalizedAction = {
    kind: string;
    what: string;
    amount: string;
    for: string;
    detail: Record<string, unknown>;
};

function normalizeKind(kind: KindLike): string {
    if (typeof kind === 'string') return kind.toLowerCase();
    if (kind && typeof kind === 'object' && 'name' in kind) return String(kind.name).toLowerCase();
    return 'contractcall';
}

function knownKindFromLogs(logs: EventLog[]): string {
    const names = logs.map(log => log.name ?? '').join(' ').toLowerCase();

    if (names.includes('swap')) return 'swap';
    if (names.includes('mint')) return 'mint';
    if (names.includes('burn')) return 'burn';
    if (names.includes('deposit')) return 'deposit';
    if (names.includes('withdraw')) return 'withdraw';
    if (names.includes('stake')) return 'stake';
    if (names.includes('unstake')) return 'unstake';
    if (names.includes('claim')) return 'claim';
    if (names.includes('approval')) return 'approval';
    if (names.includes('flashloan') || names.includes('flash loan')) return 'flashloan';

    return 'contractcall';
}

function transferDetails(log: EventLog | undefined): { from?: string; to?: string; tokenAmount?: string } {
    if (!log || log.name !== 'Transfer' || !Array.isArray(log.args)) return {};

    const [from, to, value] = log.args;
    return {
        from: String(from ?? ''),
        to: String(to ?? ''),
        tokenAmount: String(value ?? '0'),
    };
}

function decodeSwap(logs: EventLog[]): NormalizedAction {
    const swapLog = logs.find(log => log.name === 'Swap');
    const transferLogs = logs.filter(log => log.name === 'Transfer');

    if (!swapLog?.args || swapLog.args.length < 8) {
        return {
            kind: 'swap',
            what: 'swap',
            amount: 'unknown',
            for: 'unknown',
            detail: { logs },
        };
    }

    const [id, sender, amount0, amount1, sqrtPriceX96, liquidity, tick, fee] = swapLog.args;
    const amount0Text = String(amount0 ?? '0');
    const amount1Text = String(amount1 ?? '0');
    const token0In = BigInt(amount0Text) >= 0n;
    const token1In = BigInt(amount1Text) >= 0n;

    return {
        kind: 'swap',
        what: 'swap',
        amount: `${amount0Text}:${amount1Text}`,
        for: `${token0In ? 'token0_in' : 'token0_out'} / ${token1In ? 'token1_in' : 'token1_out'}`,
        detail: {
            id,
            sender,
            amount0,
            amount1,
            sqrtPriceX96,
            liquidity,
            tick,
            fee,
            transfers: transferLogs.map(log => transferDetails(log)),
        },
    };
}

function decodeMint(logs: EventLog[]): NormalizedAction {
    const mintLog = logs.find(log => log.name === 'Mint') ?? logs.find(log => log.name === 'Transfer');
    return {
        kind: 'mint',
        what: 'mint',
        amount: mintLog?.args?.[2] ? String(mintLog.args[2]) : '0',
        for: mintLog?.name ?? 'mint',
        detail: { log: mintLog ?? null },
    };
}

function decodeBurn(logs: EventLog[]): NormalizedAction {
    const burnLog = logs.find(log => log.name === 'Burn') ?? logs.find(log => log.name === 'Transfer');
    return {
        kind: 'burn',
        what: 'burn',
        amount: burnLog?.args?.[2] ? String(burnLog.args[2]) : '0',
        for: burnLog?.name ?? 'burn',
        detail: { log: burnLog ?? null },
    };
}

function decodeTokenTransfer(logs: EventLog[]): NormalizedAction {
    const transferLog = logs.find(log => log.name === 'Transfer');
    const transferInfo = transferDetails(transferLog);
    return {
        kind: 'tokentransfer',
        what: 'token transfer',
        amount: transferInfo.tokenAmount ?? '0',
        for: `${transferInfo.from ?? ''} -> ${transferInfo.to ?? ''}`,
        detail: { transfer: transferInfo, log: transferLog ?? null },
    };
}

function decodeTransaction(txn: RawTransaction): NormalizedAction {
    const logs = txn.logs ?? [];
    const kind = normalizeKind(txn.meta?.kind ?? knownKindFromLogs(logs));

    const kindToDecoder = {
        swap: () => decodeSwap(logs),
        mint: () => decodeMint(logs),
        burn: () => decodeBurn(logs),
        deposit: () => ({ kind: 'deposit', what: 'deposit', amount: 'unknown', for: 'deposit', detail: { logs } }),
        withdraw: () => ({ kind: 'withdraw', what: 'withdraw', amount: 'unknown', for: 'withdraw', detail: { logs } }),
        stake: () => ({ kind: 'stake', what: 'stake', amount: 'unknown', for: 'stake', detail: { logs } }),
        unstake: () => ({ kind: 'unstake', what: 'unstake', amount: 'unknown', for: 'unstake', detail: { logs } }),
        claim: () => ({ kind: 'claim', what: 'claim', amount: 'unknown', for: 'claim', detail: { logs } }),
        approval: () => ({ kind: 'approval', what: 'approval', amount: 'unknown', for: 'approval', detail: { logs } }),
        flashloan: () => ({ kind: 'flashloan', what: 'flashloan', amount: 'unknown', for: 'flashloan', detail: { logs } }),
        tokentransfer: () => decodeTokenTransfer(logs),
        contractcall: () => ({ kind: 'contractcall', what: 'contract call', amount: 'unknown', for: 'contractcall', detail: { logs } }),
    } as Record<string, (() => NormalizedAction) | undefined>;

    const decoderForKind = kindToDecoder[kind];
    if (decoderForKind) {
        return decoderForKind();
    }

    const fallback = kindToDecoder.contractcall as (() => NormalizedAction);
    return fallback();
}

const data = {
    meta: {
        kind: 'swap',
    },
    call: null,
    logs: [
        {
            "fragment": {
                "type": "event",
                "inputs": [
                    {
                        "name": "from",
                        "type": "address",
                        "baseType": "address",
                        "indexed": true,
                        "components": null,
                        "arrayLength": null,
                        "arrayChildren": null
                    },
                    {
                        "name": "to",
                        "type": "address",
                        "baseType": "address",
                        "indexed": true,
                        "components": null,
                        "arrayLength": null,
                        "arrayChildren": null
                    },
                    {
                        "name": "value",
                        "type": "uint256",
                        "baseType": "uint256",
                        "indexed": false,
                        "components": null,
                        "arrayLength": null,
                        "arrayChildren": null
                    }
                ],
                "name": "Transfer",
                "anonymous": false
            },
            "name": "Transfer",
            "signature": "Transfer(address,address,uint256)",
            "topic": "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
            "args": [
                "0xeF3D4718D80F4Ab52e7D74bA2176a4CFD2E7ec2c",
                "0x07964f135f276412b3182a3B2407b8dd45000000",
                "763000000000000000000"
            ]
        },
        {
            "fragment": {
                "type": "event",
                "inputs": [
                    {
                        "name": "from",
                        "type": "address",
                        "baseType": "address",
                        "indexed": true,
                        "components": null,
                        "arrayLength": null,
                        "arrayChildren": null
                    },
                    {
                        "name": "to",
                        "type": "address",
                        "baseType": "address",
                        "indexed": true,
                        "components": null,
                        "arrayLength": null,
                        "arrayChildren": null
                    },
                    {
                        "name": "value",
                        "type": "uint256",
                        "baseType": "uint256",
                        "indexed": false,
                        "components": null,
                        "arrayLength": null,
                        "arrayChildren": null
                    }
                ],
                "name": "Transfer",
                "anonymous": false
            },
            "name": "Transfer",
            "signature": "Transfer(address,address,uint256)",
            "topic": "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
            "args": [
                "0x07964f135f276412b3182a3B2407b8dd45000000",
                "0x75Cf59A923a2649B84Fa569BB97ea9694B6f26E4",
                "760711000000000000000"
            ]
        },
        {
            "fragment": {
                "type": "event",
                "inputs": [
                    {
                        "name": "id",
                        "type": "bytes32",
                        "baseType": "bytes32",
                        "indexed": true,
                        "components": null,
                        "arrayLength": null,
                        "arrayChildren": null
                    },
                    {
                        "name": "sender",
                        "type": "address",
                        "baseType": "address",
                        "indexed": true,
                        "components": null,
                        "arrayLength": null,
                        "arrayChildren": null
                    },
                    {
                        "name": "amount0",
                        "type": "int128",
                        "baseType": "int128",
                        "indexed": false,
                        "components": null,
                        "arrayLength": null,
                        "arrayChildren": null
                    },
                    {
                        "name": "amount1",
                        "type": "int128",
                        "baseType": "int128",
                        "indexed": false,
                        "components": null,
                        "arrayLength": null,
                        "arrayChildren": null
                    },
                    {
                        "name": "sqrtPriceX96",
                        "type": "uint160",
                        "baseType": "uint160",
                        "indexed": false,
                        "components": null,
                        "arrayLength": null,
                        "arrayChildren": null
                    },
                    {
                        "name": "liquidity",
                        "type": "uint128",
                        "baseType": "uint128",
                        "indexed": false,
                        "components": null,
                        "arrayLength": null,
                        "arrayChildren": null
                    },
                    {
                        "name": "tick",
                        "type": "int24",
                        "baseType": "int24",
                        "indexed": false,
                        "components": null,
                        "arrayLength": null,
                        "arrayChildren": null
                    },
                    {
                        "name": "fee",
                        "type": "uint24",
                        "baseType": "uint24",
                        "indexed": false,
                        "components": null,
                        "arrayLength": null,
                        "arrayChildren": null
                    }
                ],
                "name": "Swap",
                "anonymous": false
            },
            "name": "Swap",
            "signature": "Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)",
            "topic": "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f",
            "args": [
                "0x15d657e5b397f126387281f813af11d4a4f2d49c88b72f9b94d20a1f83381935",
                "0x66a9893cC07D91D95644AEDD05D03f95e1dBA8Af",
                "133075640975332157",
                "-760711000000000000000",
                "5958981488282231605954588373231",
                "16501748947063269524936",
                "86410",
                "10990"
            ]
        },
        {
            "fragment": {
                "type": "event",
                "inputs": [
                    {
                        "name": "from",
                        "type": "address",
                        "baseType": "address",
                        "indexed": true,
                        "components": null,
                        "arrayLength": null,
                        "arrayChildren": null
                    },
                    {
                        "name": "to",
                        "type": "address",
                        "baseType": "address",
                        "indexed": true,
                        "components": null,
                        "arrayLength": null,
                        "arrayChildren": null
                    },
                    {
                        "name": "value",
                        "type": "uint256",
                        "baseType": "uint256",
                        "indexed": false,
                        "components": null,
                        "arrayLength": null,
                        "arrayChildren": null
                    }
                ],
                "name": "Transfer",
                "anonymous": false
            },
            "name": "Transfer",
            "signature": "Transfer(address,address,uint256)",
            "topic": "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
            "args": [
                "0x75Cf59A923a2649B84Fa569BB97ea9694B6f26E4",
                "0x000000000004444c5dc75cB358380D2e3dE08A90",
                "760711000000000000000"
            ]
        }
    ]
};

console.dir(decodeTransaction(data), { depth: null, colors: true });
