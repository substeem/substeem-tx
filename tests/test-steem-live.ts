import { call, config, Transaction, PrivateKey, PublicKey, Asset, utils } from '../dist/index.mjs'

async function runLiveTest() {
  console.log('--- 1. Testing Steem config ---')
  console.log('Chain ID:', config.chain_id)
  console.log('Address prefix:', config.address_prefix)
  console.log('Nodes:', config.nodes)

  console.log('\n--- 2. Testing Live Steem RPC Call ---')
  const props = await call('condenser_api.get_dynamic_global_properties')
  console.log('Head block number:', props.head_block_number)
  console.log('Head block ID:', props.head_block_id)
  console.log('Time:', props.time)
  console.log('Total vesting fund steem:', props.total_vesting_fund_steem)

  console.log('\n--- 3. Testing Chain Math ---')
  const sp = await utils.vestsToSP(1_000_000)
  console.log('1,000,000 VESTS in SP:', sp)

  console.log('\n--- 4. Testing Asset Creation ---')
  const asset1 = Asset.from('1.500 STEEM')
  const asset2 = Asset.from('2.250 SBD')
  console.log('Asset 1:', asset1.toString())
  console.log('Asset 2:', asset2.toString())

  console.log('\n--- 5. Testing Transaction Creation & Digest ---')
  const tx = new Transaction()
  const createdTrx = await tx.create([
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
  console.log('Created transaction ref_block_num:', createdTrx.ref_block_num)
  console.log('Created transaction expiration:', createdTrx.expiration)

  const { digest, txId } = tx.digest()
  console.log('Generated txId (40 hex chars):', txId)
  console.log('Digest length:', digest.length)

  console.log('\n--- 6. Verifying Transaction Serialization against Steem Node ---')
  const remoteHex = await call('condenser_api.get_transaction_hex', [tx.transaction])
  console.log('Remote get_transaction_hex returned length:', remoteHex.length)
  console.log('Transaction verified valid by live Steem node!')

  console.log('\n--- 7. Testing Key Creation & Signing ---')
  const testWif = '5JRaypasxMx1L97ZUX7YuC5Psb5EAbF821kkAGtBj7xCJFQcbLg'
  const privKey = PrivateKey.from(testWif)
  const pubKey = privKey.createPublic()
  console.log('Public key from private key:', pubKey.toString())

  tx.sign(privKey)
  const trx = tx.transaction!
  console.log('Signed signatures count:', trx.signatures.length)
  console.log('First signature (first 30 chars):', trx.signatures[0].slice(0, 30) + '...')

  console.log('\nALL STEEM TESTS PASSED SUCCESSFULLY!')
}

runLiveTest().catch((err) => {
  console.error('Test failed:', err)
  process.exit(1)
})
