import { BLOCKCHAINS } from "./config/chains.js"
import { Interface } from "ethers";
import { tokensURL, walletsURL } from "./config/data.js";
import { readFile, writeFile } from "node:fs/promises";
import type { LogDescription } from "ethers";
import type { TransactionDescription } from "ethers";

const chainId: number = BLOCKCHAINS.ethereum.chainId;
const DBRefreshRate = 1000*60*60*24*7;

interface WalletIndexed {
    address: string
    chainId: number
    label: string
    nameTag: string
}
interface TokenIndexed{
    chainId: number
    address: string
    name: string
    symbol: string
    decimals: number
    logoURI: string
    extensions: Record<string, object>
}
const _walletList = await fetch(walletsURL).then(res => res.json()) as WalletIndexed[]
const _tokenList = (await fetch(tokensURL).then(res => res.json()) as any).tokens as TokenIndexed[]

const chainTokenRecords = JSON.parse(await readFile('./src/db/tokens.json', 'utf-8')) as Record<number, { tokens: Record<string, TokenIndexed>, date: number }>;
const chainWalletRecords = JSON.parse(await readFile('./src/db/wallets.json', 'utf-8')) as Record<number, { wallets: Record<string, WalletIndexed>, date: number }>;

if (!chainTokenRecords[chainId] || Date.now() - chainTokenRecords[chainId].date >= DBRefreshRate) {
    chainTokenRecords[chainId] = {
        tokens: Object.fromEntries(_tokenList.map(token => [token.address.toLowerCase(), token])),
        date: Date.now()
    }
    await writeFile('./src/db/tokens.json', JSON.stringify(chainTokenRecords, null, 2));
}

if (!chainWalletRecords[chainId] || Date.now() - chainWalletRecords[chainId].date >= DBRefreshRate) {
    chainWalletRecords[chainId] = {
        wallets: Object.fromEntries(_walletList.map(wallet => [wallet.address.toLowerCase(), wallet])),
        date: Date.now()
    }
    await writeFile('./src/db/wallets.json', JSON.stringify(chainWalletRecords, null, 2));
}
    
interface ContractRecord {
    abi: object[] | null
    proxyRoot: {
        address: string | null
        abi: object[] | null
    }
    date: number
}
type ContractsMap = Record<string, Record<string, ContractRecord>>
const contractsMap: ContractsMap = JSON.parse(await readFile('./src/db/contract-records.json', 'utf8'));

const EOAMap: Record<string, Record<string, boolean>> = JSON.parse(await readFile('./src/db/eoa.json', 'utf8'));

type TStringField = { value: string, strict?: boolean }
interface TFilter {
    sender?: TStringField
    recepient?: TStringField
    kind?: TStringField
    events?: string[]
}
const DEFAULT_FILTER = {
    // recepient: 'USD',
    kind: { value: 'swap', strict: false },
    events: ['stake', 'unstake', 'liquidity'] // DevOnly feature because "EVENTS" as filter applies to DECODED LOGS, its deploy version will be "KIND"
} as TFilter;
let filter: TFilter = DEFAULT_FILTER;

export interface Kind {
    name: string;
    priority: number;
}

interface KindMap {
    _default: Kind;
    _tokentransfer: Kind;
    _contractcall: Kind;
    flashloan: Kind;
    swap: Kind;
    mint: Kind;
    burn: Kind;
    deposit: Kind;
    withdraw: Kind;
    stake: Kind;
    unstake: Kind;
    claim: Kind;
    approval: Kind;
};

class Requester {
    async rpc(method: string, params: unknown[]) {
        while (true) {
            try {
                const response = await fetch(BLOCKCHAINS.ethereum.https, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        jsonrpc: "2.0",
                        id: 1,
                        method: method,
                        params: params
                    })
                });
                
                return await response.json();
            } catch (e: any) {
                if (e instanceof TypeError && (e.cause as any).code === 'UND_ERR_CONNECT_TIMEOUT') {
                    console.warn('bruh')
                    continue;
                }
            }
        }
    }
    
    async batchRPC(method: string, params: unknown[]) {
        const response = await fetch(BLOCKCHAINS.ethereum.https, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(params.map((param, i) => ({
                jsonrpc: "2.0",
                id: i+1,
                method: method,
                params: [param],
            })))
        });

        return await response.json();
    }

    async getABI(chainId: number, address: string | null) {
        if (!address) return null;
        while (true) {
            try {
                const response = await fetch(`https://api.etherscan.io/v2/api?chainid=${chainId}&module=contract&action=getabi&address=${address}&apikey=${process.env.ETHERSCAN_API_KEY}`);
                const data = await response.json();
                return data.status == '1' ? JSON.parse(data.result) : null;
            } catch (err: any) {
                await new Promise(resolve => setTimeout(resolve, 10000));
            }
        }
    }
}

class Converter {
    hexToInt(value: string): number {
        return parseInt(value, 16);
    }

    weiToEth(wei: string | bigint | number): string {
        const weiBigInt = typeof wei === 'bigint' ? wei : BigInt(wei);
        const etherStr = weiBigInt.toString().padStart(19, '0');
        const integerPart = etherStr.slice(0, -18);
        const fractionalPart = etherStr.slice(-18).replace(/0+$/, '');
        
        return fractionalPart ? `${integerPart}.${fractionalPart}` : integerPart;
    }
}

class Decoder {
    lookupAddress(chainId: number, address: string | null): string | null {
        if (!address) return address;
        address = address.toLowerCase();
        return chainTokenRecords[chainId]?.tokens[address]?.symbol ?? chainWalletRecords[chainId]?.wallets[address]?.nameTag ?? address;
    }

    private isRecordExpired(date: number) { return Date.now() - date >= DBRefreshRate; }

    async findContract(addr: string): Promise<ContractRecord> {
        const address = addr.toLowerCase();
        let isEOA = (EOAMap[chainId] ??= {})[address];
        
        if (isEOA === undefined) {
            isEOA = (await requester.rpc('eth_getCode', [address, 'latest'])).result === '0x';
            if (isEOA) EOAMap[chainId][address] = true;
        }

        if (isEOA) return {
            abi: null,
            proxyRoot: {
                address: null,
                abi: null
            },
            date: Date.now()
        }

        const chainCache = contractsMap[chainId] ??= {};
        let contract = chainCache[address];

        if (contract === undefined || (contract && this.isRecordExpired(contract.date))) {
            const implementation = await this.getProxyRoot(address);
            contract = chainCache[address] = {
                abi: await requester.getABI(chainId, address),
                proxyRoot: {
                    address: implementation[0],
                    abi: implementation[1],
                },
                date: Date.now()
            };
        }

        return contract;
    }

    private async getProxyRoot(addr: string): Promise<[string | null, object[] | null]> {
        // >>> Limited to EIP-1967 proxy only.
        //     Next add:
        //      1. Minimal proxy (through bytecode)
        //      2. Transparent proxy (through admin slot '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103')
        //      3. Check further...
        const response = await requester.rpc('eth_getStorageAt', [addr, '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc', 'latest']);
        if (!response.result || /^0x0+$/.test(response.result)) return [null, null];
        const address = '0x' + response.result.slice(-40);
        const abi = await requester.getABI(chainId, address);
        return [address, abi];
    }

    async parseCall(txn: Transaction): Promise<TransactionDescription | null> {
        const contract = await this.findContract(txn.to!);
        
        if (contract.abi || contract.proxyRoot.abi) {
            const templator = new Interface((contract.proxyRoot.abi ?? contract.abi)!);
            return templator.parseTransaction({ data: txn.input });
        }

        return null;
    }

    async parseLogs(receipt: TxnReceipt): Promise<any> {
        // SUBJECT: "Should I use role as a filter param?"
        //      Using something like:
        //      EVENT_META = {
        //          Transfer: { role: "movement" },
        //          Swap:     { role: "action" },
        //          Sync:     { role: "state" },
        //          Approval: { role: "admin" },
        //      }
        //      or Record<'knownEventName' | string, Record<'role', 'genericRoleName'>>
        // 
        // THOUGHTS: "Yes"
        //      Probably not because parsed logs may contain unknown kinds (look:classasserter.kinds) that actually shape transaction just as "swap" event does,
        //      but get discarded because they are not indexed (locally).
        //      HOWEVER, now I think YES because take even classasserter.kinds, it only lists indexed (locally) kinds, meaning even there it omits potential kinds.
        //      So indexing roles would do the SAME job, index known events and => simplify classification, and omit unknown events (even if potentially txn-shaping).

        if (!receipt.logs.length) return [];

        return (await Promise.all(receipt.logs.map(async log => {
            if (log.topics.length) {
                const contract = await this.findContract(log.address);
    
                if (contract.abi || contract.proxyRoot.abi) {
                    const templator = new Interface((contract.proxyRoot.abi ?? contract.abi)!);
                    const event: LogDescription | null = templator.parseLog({ topics: log.topics, data: log.data })
        
                    if (event && event.name == 'Transfer') {
                        if (converter.hexToInt(event.args[0]) == 0) return {...event, name: 'Mint'};
                        if (converter.hexToInt(event.args[1]) == 0) return {...event, name: 'Burn'};
                    }

                    return event;
                }
            }

            return null;
        }))).filter((dlog: any): dlog is NonNullable<typeof dlog> => dlog !== null);
    }
}

class Classifier {
    private assignBy(eventName: string): Kind {
        const name = eventName.toLowerCase();
        for (const [key, kind] of Object.entries(this.kinds)) if (!key.startsWith('_') && name.includes(key)) return kind;
        return this.kinds._contractcall;
    }

    classifyTransaction(parsedLogs: any[]): Kind {
        let topPriority = -1;
        let topClass = this.kinds._contractcall;
        
        if (parsedLogs.length) {
            // Could be optimized by merging into the loop?
            if (parsedLogs.every(log => log.name == "Transfer")) return this.kinds._tokentransfer;

            parsedLogs.forEach((log: any) => {
                const kind = this.assignBy(log.name);

                // Selection occurs by the highest priority.
                // Issue: If multiple events of the same priority exist on the same transaction, the first one will be determinant!
                // Thoughts: This however is unlikely as those kinds indexed (look:this.kinds) are distinct and have low chance of occuring within the same transaction.
                if (kind.priority > topPriority) {
                    topClass = kind;
                    topPriority = kind.priority;
                }
            })
        }

        return topClass;
    }

    kinds: KindMap = {
        _default: { name: "Native Transfer", priority: 0 },
        _tokentransfer: { name: "Token Transfer", priority: 0 },
        _contractcall: { name: "Contract Call", priority: 0 },

        // Highest priority event will determine transaction type
        flashloan: { name: "Flash Loan", priority: 100 },
        swap: { name: "Swap", priority: 90 },
        mint: { name: "Mint", priority: 80 },
        burn: { name: "Burn", priority: 80 },
        deposit: { name: "Deposit", priority: 70 },
        withdraw: { name: "Withdrawal", priority: 70 },
        stake: { name: "Stake", priority: 60 },
        unstake: { name: "Unstake", priority: 60 },
        claim: { name: "Claim", priority: 60 },
        approval: { name: "Approval", priority: 20 },
    }
}

class Purifier {
    private isTokenOrWallet(input: string, checkValue: string): boolean {
        const token = chainTokenRecords[chainId]?.tokens[input];
        const wallet = chainWalletRecords[chainId]?.wallets[input];
        if (token && token.symbol.includes(checkValue) || wallet && wallet.nameTag.includes(checkValue)) return true;
        return false;
    }

    private passes(input: string, value: string) {
        return input.includes(value) || this.isTokenOrWallet(input, value);
    }

    // "INPUT" type of string[] is DevOnly because in production there will be no filter that requires input type array
    // Used only for to find non-indexed transaction kinds using decoded logs
    matches(
        field: 'sender' | 'recepient' | 'kind' | 'events',
        input: string | string[] | null
    ): boolean {
        if (!input) return false;

        const constraint = filter[field];

        if (!constraint || (Array.isArray(constraint) && constraint.length === 0)) return true;
        if (Array.isArray(input)) input = input.map(value => value.toLowerCase()); else input = input.toLowerCase();
        if (Array.isArray(constraint)) {
            if (Array.isArray(input)) return constraint.some(option => input.some(fragment => this.passes(fragment, option.toLowerCase())));
            return constraint.some(option => this.passes(input, option.toLowerCase()));
        }

        const value = constraint.value.toLowerCase();
        return constraint.strict ? input === value : this.passes((input as string), value);
    }

    matchesAll(params: [field: keyof TFilter, input: string | null][]): boolean {
        for (const param of params) {
            const pass = this.matches(param[0], param[1]);
            if (!pass) return false;
        }
        return true;
    }
}

const requester = new Requester();
const converter = new Converter();
const decoder = new Decoder();
const classifier = new Classifier();
const purifier = new Purifier();

export {
    chainTokenRecords,
    chainWalletRecords,
    contractsMap,
    EOAMap,
    filter,
    requester,
    converter,
    decoder,
    classifier,
    purifier,
};
