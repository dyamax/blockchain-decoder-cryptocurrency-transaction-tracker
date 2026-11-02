import asyncio
import json
import websockets

import ssl
import certifi

link = 'wss://eth-mainnet.g.alchemy.com/v2/alch_9z1FeuOylOxtGz4iyaQ0q'

def rethv(value: str) -> int:
    return int(value, 16)

async def main():
    ssl_context = ssl.create_default_context(cafile=certifi.where())

    async with websockets.connect(
        link,
        ssl=ssl_context
    ) as ws:
        subs = {
            'jsonrpc': '2.0',
            'id': 1,
            'method': 'eth_subscribe',
            'params': ['newHeads']
        }

        await ws.send(json.dumps(subs))

        print('[OPEN]\n')

        while True:
            mes = await ws.recv()
            data = json.loads(mes)

            if 'params' in data:
                block = data['params']['result']

asyncio.run(main())

# BLOCK HEADER
block = {
    'hash': '0x4ff...',                         # HEX -> STR (keep as is)
    'parentHash': '0xc26...',                   # HEX -> STR (keep as is)
    'sha3Uncles': '0x1dc...',                   # HEX -> STR (keep as is)
    'miner': '0x396...',                        # HEX -> STR (Ethereum address)
    'stateRoot': '0x7a2...',                    # HEX -> STR (keep as is)
    'transactionsRoot': '0x110...',             # HEX -> STR (keep as is)
    'receiptsRoot': '0x40c...',                 # HEX -> STR (keep as is)
    'logsBloom': '0xdff...',                    # HEX -> STR (Bloom filter)
    'difficulty': '0x0',                        # HEX -> INT (0)
    'number': '0x186...',                       # Integer (hex → int)
    'gasLimit': '0x393...',                     # Integer (hex → int)
    'gasUsed': '0x1f1...',                      # Integer (hex → int)
    'timestamp': '0x6a6...',                    # Integer (hex → int → datetime)
    'extraData': '0xe2c.8',                     # HEX -> BYTES as str
    'mixHash': '0x371...',                      # HEX -> STR (keep as is)
    'nonce': '0x000...',                        # HEX -> STR (legacy field)
    'baseFeePerGas': '0x6cc...',                # Integer (hex → int)
    'withdrawalsRoot': '0xc6d...',              # HEX -> STR (keep as is)
    'blobGasUsed': '0x60000',                        # Integer (hex → int)
    'excessBlobGas': '0xaf4...',                # Integer (hex → int)
    'parentBeaconBlockRoot': '0xc66...',        # HEX -> STR (keep as is)
    'requestsHash': '0xe3b...',                 # HEX -> STR (keep as is)
    'size': '0x2a5...',                         # Integer (hex → int)
    'withdrawals': [
        {
            'index': '0x831...',                # Integer (hex → int)
            'validatorIndex': '0x20a...',       # Integer (hex → int)
            'address': '0xf84...',              # HEX -> STR (Ethereum address)
            'amount': '0xd9d...'                # Integer (hex → int)
        }
    ]
}
block_header = {
  "jsonrpc": "2.0",
  "method": "eth_subscription",
  "params": {
    "subscription": "0xae6b1f5a7647c44fdf28a7fc28ca58a6",
    "result": block
  }
}
