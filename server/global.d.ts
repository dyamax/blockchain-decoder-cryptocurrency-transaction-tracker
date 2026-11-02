interface NewHeadsMessage {
    jsonrpc: "2.0";
    method: "eth_subscription";
    params: {
        subscription: string;
        result: BlockHeader;
    };
}

interface BlockHeader {
    hash: string;
    parentHash: string;
    sha3Uncles: string;
    miner: string;
    stateRoot: string;
    transactionsRoot: string;
    receiptsRoot: string;
    logsBloom: string;
    difficulty: string;
    number: string;
    gasLimit: string;
    gasUsed: string;
    timestamp: string;
    extraData: string;
    mixHash: string;
    nonce: string;
    baseFeePerGas: string;
    withdrawalsRoot: string;
    blobGasUsed: string;
    excessBlobGas: string;
    parentBeaconBlockRoot: string;
    requestsHash: string;
    size: string;
    withdrawals: Withdrawal[];
}

interface RPCHTTPBaseRes {
    jsonrpc: '2.0',
    id: 1,
}

interface FullBlockRes extends RPCHTTPBaseRes {
    result: FullBlock
}

interface FullBlock extends BlockHeader {
    totalDifficulty: string;
    transactions: Txns[];
    uncles: string[];
}

interface Transaction {
    type: string;
    chainId: string;
    nonce: string;
    hash: string;
    blockHash: string;
    blockNumber: string;
    blockTimestamp?: string;
    transactionIndex: string;
    from: string;
    to: string | null;
    value: string;
    gas: string;
    gasPrice: string;
    maxFeePerGas?: string;
    maxPriorityFeePerGas?: string;
    input: string;
    accessList: unknown[];
    r: string;
    s: string;
    yParity: string;
    v: string;
    receipt: TxnReceipt
}

interface TxnsReceiptsRes extends RPCHTTPBaseRes {
    result: TxnReceipt[]
}

interface TxnReceipt {
    type: string;
    status: string;
    transactionHash: string;
    transactionIndex: string;
    blockHash: string;
    blockNumber: string;
    from: string;
    to: string | null;
    contractAddress: string | null;
    cumulativeGasUsed: string;
    gasUsed: string;
    effectiveGasPrice: string;
    logsBloom: string;
    logs: Log[];
}

interface Log {
    address: string;
    topics: string[];
    data: string;
    blockHash: string;
    blockNumber: string;
    blockTimestamp?: string;
    transactionHash: string;
    transactionIndex: string;
    logIndex: string;
    removed: boolean;
}

interface Withdrawal {
    index: string;
    validatorIndex: string;
    address: string;
    amount: string;
}

interface DecodedTransaction {
    call: DecodedFunction | null;      // txn.input
    events: DecodedEvent[];            // every log
    action: TransactionAction;         // inferred summary
}

interface FilterMessage {
    method: 'set_filter'
    filter: Filter
}

interface StateChange {
    subject: string;
    asset?: string;
    property: string;
    before?: unknown;
    after?: unknown;
    delta?: unknown;
};