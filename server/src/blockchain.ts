import { BLOCKCHAINS } from "./config/chains.js";
import { writeFile } from "node:fs/promises";
import { classifier, converter, decoder, filter, requester, contractsMap, EOAMap, purifier } from "./workers.js";

const chainId = BLOCKCHAINS.ethereum.chainId;
let filters = filter;

const stringify = (value: unknown) => JSON.stringify(value, (_, value) => typeof value === "bigint" ? value.toString() : value, 4);

////// DEV PARAMS ///////
const DEV_CONSOLE_ON = false;
const separator = '  ✦  ';
const C = {
    end: "\x1b[0m",
    bold: "\x1b[1m",
    gray: "\x1b[90m",
    darkGray: "\x1b[90;2m",
    red: "\x1b[91m",
    green: "\x1b[92m",
    blue: "\x1b[94m",
    magenta: "\x1b[95m",
};
const consoleList: string[] = Array(50).fill('');
const clTxKinds: Record<string, number> = {};
let txProcessed = 0;

declare global {
    interface String {
        clip(length?: number): string
    }
}

String.prototype.clip = function (length = 10): string {
    return this.length <= length ? this.toString() : `${this.slice(0, length - 3)}...`;
};
/////////////////////////

async function main(): Promise<void> {
    const ws = new WebSocket(BLOCKCHAINS.ethereum.ws);
    const q: BlockHeader[] = [];
    let qprocessing = false;

    async function processBlock(blockHeader: BlockHeader) {
        const blockNumber = converter.hexToInt(blockHeader.number);
        const blockHash = blockHeader.hash;

        const _fullBlock = (await requester.rpc('eth_getBlockByHash', [blockHash, true]) as FullBlockRes).result as FullBlock;
        const _receipts = (await requester.rpc('eth_getBlockReceipts', [blockHash]) as TxnsReceiptsRes).result as TxnReceipt[];

        const transactionList = _fullBlock.transactions.map((txn, i) => ({...txn, receipt: _receipts[i]})) as Transaction[];

        consoleList.push('');
        consoleList.push(`${C.bold+C.green}New Block${C.end}`);

        for (const txn of transactionList) {
            if (purifier.matches('recepient', txn.to)) {
                // Contract creation case
                if (txn.to == null) {
                    consoleList.push(
                        `${C.gray}${`(${converter.hexToInt(txn.transactionIndex)+1})`.padStart(5)}${C.end}` + 
                        (txn.receipt.status == '0x0' ? ` ${C.green}${'Success'.padEnd(7)}${C.end}` : ` ${C.red}${'Decline'.padEnd(7)}${C.end}`) + separator +
                        decoder.lookupAddress(chainId, txn.from)?.clip().padEnd(10) + `${C.green}Contract creation! 🎉${C.end}`
                    );
                    continue;
                } 

                const data = {
                    meta: {
                        kind: classifier.kinds._default,
                    },
                    call: await decoder.parseCall(txn),
                    logs: []
                }; // transaction meta + call + logs

                // Smart Contract case
                if (txn.input !== '0x') {
                    data.logs = await decoder.parseLogs(txn.receipt);
                    data.meta.kind = classifier.classifyTransaction(data.logs);
                }

                // Currently filter compares EVENTS to KIND, that wrong! Make it check the logs
                // if (purifier.matches('events', data.logs.map((log: any) => log.name))) {
                if (purifier.matches('kind', data.meta.kind.name)) {
                    // >>> Actual return thats sent to client
                    // const DnT = (new Date(parseInt(blockHeader.timestamp, 16) * 1000)).toISOString().split('T') as string[]
                    // const feeValue = Number(txn.receipt.gasUsed) * Number(txn.receipt.effectiveGasPrice) / 1e18;
                        
                    // const parsedTransaction = {
                    //     index: converter.hexToInt(txn.transactionIndex),
                    //     status: converter.hexToInt(txn.receipt.status), // status == 1 ? Success : Decline
                    //     type: TRANSACTION_TYPES[txn.type] ?? 'Undetected',
                    //     from: decoder.lookupAddress(chainId, txn.from),
                    //     to: decoder.lookupAddress(chainId, txn.to),
                    //     action: (txn.input != '0x'
                    //         ? {
                    //             type: "contract_call",
                    //             selector: txn.input.slice(0, 10),
                    //         }
                    //         : {
                    //             type: "native_transfer",
                    //             amountETH: converter.weiToEth(txn.value),
                    //         }
                    //     ),
                    //     gas_paid_eth: feeValue,
                    //     date: DnT[0]?.split('-').reverse().join('/'),
                    //     time: DnT[1]?.slice(0, DnT[1].length-5)
                    // }
                    // <<< Actual return...

                    console.log(data.logs.filter((log: any) => log.name.toLowerCase().includes('swap')).map((log: any) => log.args));

                    if (DEV_CONSOLE_ON) {
                        consoleList.push(
                            `${C.gray}${`(${converter.hexToInt(txn.transactionIndex)+1})`.padStart(5)}${C.end}` + 
                            (converter.hexToInt(txn.receipt.status) == 1 ? ` ${C.green}${'Success'.padEnd(7)}${C.end}` : ` ${C.red}${'Decline'.padEnd(7)}${C.end}`) + separator +
                            decoder.lookupAddress(chainId, txn.from)?.clip().padEnd(10) + '  ->  ' +
                            decoder.lookupAddress(chainId, txn.to)?.clip().padStart(10) + separator +
                            `${C.gray}${data.meta.kind.name.padEnd(15)}${C.end}` +
                            ` ${C.magenta}${(data.call?.signature ?? '-').replace('(', ' (')}${C.end}`.padEnd(30) +
                            ` ${C.blue}${data.logs.length ?
                                (data.logs.length > 3 ? data.logs.slice(0,3).map((log: any) => log.name).join(', ')+` +${data.logs.length-3}` : data.logs.map((log: any) => log.name).join(', ')) :
                                'None'
                            }${C.end}`.padEnd(70)
                        )
                    }
                }

                if (DEV_CONSOLE_ON) {
                    if (clTxKinds[data.meta.kind.name] === undefined) clTxKinds[data.meta.kind.name] = 0;
                    clTxKinds[data.meta.kind.name]!++;
                    txProcessed++;

                    console.clear();
                    console.log(`${C.bold+C.blue}Ethereum MAINNET${C.end} ${C.green}•${C.end}`);
                    console.log(
                        'Txn n',
                        'Status'.padEnd(11),
                        'From'.padEnd(13),
                        'To'.padEnd(14),
                        'Kind' .padEnd(24)
                    )
                    console.log();
                    console.log(consoleList.slice(-40).join('\n'));
                    console.log();
                    console.log('Total Processed', txProcessed);
                    console.log();

                    Object.keys(clTxKinds).forEach(key => console.log(key.padEnd(15) + ` ${clTxKinds[key]}`))
                }

                if (data.call && data.logs.length) await writeFile(`./dev-tx/T${converter.hexToInt(txn.transactionIndex) + 1}B${blockNumber}.md`, `# Meta\nKind: ${data.meta.kind.name}\n\n# Call\n${stringify(data.call ?? {})}\n\n# Logs\n${stringify(data.logs)}`);
                // return // Only process ONE txn a block
            }
        }
    }

    async function manageQ() {
        if (qprocessing) return;

        qprocessing = true;

        while (q.length) {
            const block = q.shift();
            if (!block) return;

            const initialContractsMap = JSON.stringify(contractsMap);
            const initialEOAMap = JSON.stringify(EOAMap);
            
            await processBlock(block);

            JSON.stringify(contractsMap) != initialContractsMap && await writeFile('./src/db/contract-records.json', JSON.stringify(contractsMap, null, 2));
            JSON.stringify(EOAMap) != initialEOAMap && await writeFile('./src/db/eoa.json', JSON.stringify(EOAMap, null, 2));
        }

        qprocessing = false;
    }

    ws.addEventListener("open", () => {
        const subscription = {
            jsonrpc: "2.0",
            id: 1,
            method: "eth_subscribe",
            params: ["newHeads"]
        };

        ws.send(JSON.stringify(subscription));
    });

    ws.addEventListener("message", async (event) => {
        const newHeads: NewHeadsMessage | FilterMessage = JSON.parse(event.data);

        if ('method' in newHeads) {
            if (newHeads.method === 'eth_subscription') {
                q.push(newHeads.params.result);
                manageQ();
            } else if (newHeads.method === 'set_filter') {
                filters = newHeads.filter;
            }
        }
    });
    
    ws.addEventListener("error", (err) => {
        console.error('[ERROR]', err);
    });

    ws.addEventListener("close", (event) => {
        console.log('[CONNECTION CLOSED]', event.code, event.reason || 'Unknown');
    });
}

main();
