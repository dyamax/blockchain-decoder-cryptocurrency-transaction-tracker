# Version Control

## Server
id:server
Dockstring: CryptoTracker Server.


### SERVERv1
Live Ethereum listener + transaction processor.

Flow:
— Receive new blocks
— Fetch full block + receipts
— Attach receipts to transactions
— Decode logs using ABI
— Classify transactions
— Output user-readable data

Supports:
— Native transfers
— Token transfers
— Contract calls
— Event-based actions (swap, mint, burn, etc.)


## Workers
short:wks
id:workers
Docstring: Workers is a helpful mechanism with a set of subclasses, methods, and relevant data.

### WKSv1
At deployment `workers` already come packed with bunch of functionality.

All Subclasses:
— Requester
— Converter
— Decoder
— Classasserter

All Methods:
— rpc
— batchRPC
— getABI
— hexToInt
— weiToEth
— lookupAddress
— clipAddress
— decodeLog
— decodeLogs
— assignBy
— classifyTxn

Data:
— kinds

### WKSv2
...

### WKSv1.1
v1.1 brings filters (subclass:filter)
Filters allow selective transaction processing for both users and developers.


## TProcess 
short:tp
id:transaction-process
Docstring: TProcess — a process that involes decoding received data, classifying transaction (e.g. "swap," etc.), and producing formatted transaction with relevant to the User information.

### TPv1
v1 deploys surface decoding. The process invloves two workers:
— Decoder
— Classifier

Process SBS (step-by-step):
— Decode transaction input
— Decode receipt logs
— Identify known events
— Assign transaction class

Examples:
1. Transfer → Token Transfer
2. Swap + Transfers → Swap
3. Unknown logs → Contract Call

Limitations:
— Only recognizes "known" blockchain patterns.

[which workers include, that it only identifies transactions based on decoded logs (aka "surface" classification)]