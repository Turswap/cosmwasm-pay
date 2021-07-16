import { LcdClient, Secp256k1HdWallet } from '@cosmjs/launchpad';


import express = require('express');
import { bech32prefix, httpUrl } from './config';
import { get_account, get_cw_balance, get_hash, get_mnemonic, get_transaction, sign, wasmTransfer } from './services';

import { buildWallet, getAsyncSigningCosmWasmClient, getSigningCosmWasmClient } from './utils';
const app: express.Application = express();
const port = 3000;
const hostname = '127.0.0.1';

app.use(express.json()); // for parsing application/json

app.get('/', (req: any, res: any) => res.send('Hello World!'));

app.post('/new-address', async function (req: any, res: any) {
  const key_name = req.body['key_name'];
  const index = req.body['index'];
  try {

    const mnemonic = await get_mnemonic(key_name);
    const signer = await buildWallet(mnemonic, index);
    const [{ address }] = await signer.getAccounts();
    res.send(JSON.stringify({ result: address }));

  } catch (err) {
    res.send(JSON.stringify({ error: err }));
  }

});


app.get('/account/:address', (req: any, res: any) =>  async function (req: any, res: any) {
  const address = req.params.address;
  const result = await get_account(address);
  return res.send(JSON.stringify({ result: result }));
});


app.post('/sign/:key_name', async function (req: any, res: any) {
  const msgs = req.body['msg'];
  const memo = req.body['memo'];
  const account_number = req.body['account_number'];
  const sequence = req.body['sequence'];

  const key_name = req.params.key_name;
  const mnemonic = await get_mnemonic(key_name);

  const signer = await buildWallet(mnemonic, 0);
  const result = await sign(signer, msgs, memo, account_number, sequence);

  res.send(JSON.stringify({ result: result }));
});

app.post('/sign', async function (req: any, res: any) {
  const msgs = req.body['msg'];
  const memo = req.body['memo'];
  if (memo === undefined) {
    res.send(JSON.stringify({ error: { msg: 'memo必须输入' } }));
  }

  if (msgs === undefined) {
    res.send(JSON.stringify({ error: { msg: 'msgs必须输入' } }));
  }

  const account_number = req.body['account_number'];
  const sequence = req.body['sequence'];
  const mnemonic = req.body['mnemonic'];
  const signer = await buildWallet(mnemonic, 0);
  const result = await sign(signer, msgs, memo, account_number, sequence);

  const hash = await get_hash(result);
  res.send(JSON.stringify({ result: result, hash: hash }));
});

app.post('/get_hash', async function name(req: any, res: any) {
  const tx = req.body['tx'];
  const hash = await get_hash(tx);
  res.send(JSON.stringify({ result: hash }));
});


app.post('/wasm-transfer/:key_name/:index', async function (req: any, res: any) {

  const msgs = req.body['msg'];
  const memo = req.body['memo'];
  const fromAddress = req.body['fromAddress'];
  const key_name = req.params.key_name;
  const index = req.params.index;

  const mnemonic = await get_mnemonic(key_name);

  const { client, address: sender } = await getAsyncSigningCosmWasmClient(mnemonic, Number(index));
  if (fromAddress !== sender) {
    res.send(JSON.stringify({ error: { msg: `发送地址不正确，助记词的index(${index})的地址是${sender}，提交的fromAddress是${fromAddress}` } }));
  }
  const result = await wasmTransfer(msgs, memo, client, sender);
  res.send(JSON.stringify(result));
});

app.get('/wasm-balance/:contract/:address', async function (req: any, res: any) {

  const address = req.params.address;
  const contract = req.params.contract;
  const result = await get_cw_balance(contract, address);
  res.send(JSON.stringify(result));
});

app.get('/txs/:transactionHash', async function (req: any, res: any) {

  const transaction = req.params.transactionHash;

  const result = await get_transaction(transaction);

  res.send(JSON.stringify(result));
});


app.get('/blocks/:height', async function(req: any, res: any) {
  const client = new LcdClient(httpUrl);
  const height = req.params.height;
  const blockResponse = client.blocks(height);
  const txs = (await blockResponse).block.data.txs;
  res.send(JSON.stringify(txs));

});


app.get('/wasm-transfer-event', async function (req: any, res: any) {
  const contractAddress = req.query.contract_address;
  const fromAddress = req.query.from_address;
  const toAddress = req.query.to_address;
  const minHeight = req.query.min_height;
  const maxHeight = req.query.max_height;
  const page = req.query.page ? req.query.page : 1;
  const limit = req.query.limit ? req.query.limit : 10;
  const client = new LcdClient(httpUrl);
  let query = `message.action=execute&wasm.action=transfer&wasm.contract_address=${contractAddress}&page=${page}&limit=${limit}`;
  if (fromAddress !== undefined) {
    query = `${query}&wasm.from=${fromAddress}`;
  }
  if (toAddress !== undefined) {
    query = `${query}&wasm.to=${toAddress}`;
  }
  if (minHeight !== undefined) {
    query = `${query}&tx.minheight=${minHeight}`;
  }

  if (maxHeight !== undefined) {
    query = `${query}&tx.maxheight=${maxHeight}`;
  }

  console.log(query);
  const queryResponse = await client.txsQuery(query);

  const items = [];
  const length = queryResponse.txs.length;
  for (let i = 0; i < length; i++) {
    const tx = queryResponse.txs[i];
    if (tx.code === undefined) {   // 成功状态
      for (let j = 0; j < tx.tx.value.msg.length; j++) {
        const msg = tx.tx.value.msg[j];
        const cata = msg.value;
        const contract = cata?.contract;
        const fromAddress = cata?.sender;
        const toAddress = cata?.msg?.transfer?.recipient;
        const amount = cata?.msg?.transfer?.amount;
        items.push({ height: tx.height, txHash: tx.txhash, index: j, contract: contract, fromAddress: fromAddress, toAddress: toAddress, amount: amount, timestamp: tx.timestamp });
      }

    }

  }
  res.send(JSON.stringify({ result: { count: queryResponse.count, limit: queryResponse.limit, page_number: queryResponse.page_number, page_total: queryResponse.page_total, total_count: queryResponse.total_count, items: items } }));
});

app.listen(port, hostname, () => console.log(`Example app listening on port ${port}!`));
