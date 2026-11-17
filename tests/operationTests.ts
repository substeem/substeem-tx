import { bytesToHex } from '@noble/hashes/utils.js'
import { Transaction, utils } from '../src/index.js'
import { getTransactionHex } from './getTransactionHex.js'

// Test public key
const testKey = 'STM8AGkwKrzgrAHcdGr2yyfyQHyjziJgjw2Yuy3352HBkUjQDRrAG'

// Minimal authority for test operations
const testAuthority = {
  weight_threshold: 1,
  account_auths: [],
  key_auths: [[testKey, 1]]
}

// Sample data for each operation type
const operationSamples: { [key: string]: any } = {
  vote: {
    voter: 'testuser',
    author: 'alice',
    permlink: 'test-post',
    weight: 10000
  },
  comment: {
    parent_author: '',
    parent_permlink: 'test-category',
    author: 'testuser',
    permlink: 'test-post-123',
    title: 'Test Post Title',
    body: 'This is a test post body for signing verification.',
    json_metadata: '{"tags":["test","signing"]}'
  },
  transfer: {
    from: 'testuser',
    to: 'alice',
    amount: '1.000 STEEM',
    memo: 'test memo'
  },
  transfer_to_vesting: {
    from: 'testuser',
    to: 'alice',
    amount: '1.000 STEEM'
  },
  withdraw_vesting: {
    account: 'testuser',
    vesting_shares: '1000.000000 VESTS'
  },
  account_create: {
    fee: '3.000 STEEM',
    creator: 'testuser',
    new_account_name: 'newtestuser',
    owner: testAuthority,
    active: testAuthority,
    posting: testAuthority,
    memo_key: testKey,
    json_metadata: '{"profile":{"name":"Test User"}}'
  },
  account_create_with_delegation: {
    fee: '0.001 STEEM',
    delegation: '1000.000000 VESTS',
    creator: 'testuser',
    new_account_name: 'newtestuser2',
    owner: testAuthority,
    active: testAuthority,
    posting: testAuthority,
    memo_key: testKey,
    json_metadata: '{}',
    extensions: []
  },
  account_update: {
    account: 'testuser',
    owner: testAuthority,
    active: testAuthority,
    posting: testAuthority,
    memo_key: testKey,
    json_metadata: '{"updated": true}'
  },
  account_update2: {
    account: 'testuser',
    owner: testAuthority,
    active: testAuthority,
    posting: testAuthority,
    memo_key: testKey,
    json_metadata: '{"updated2": true}',
    posting_json_metadata: '{"posting": true}',
    extensions: []
  },
  account_witness_vote: {
    account: 'testuser',
    witness: 'alice',
    approve: true
  },
  account_witness_proxy: {
    account: 'testuser',
    proxy: 'alice'
  },
  convert: {
    owner: 'testuser',
    requestid: 123456,
    amount: '1.000 SBD'
  },
  custom: {
    required_auths: ['testuser'],
    id: 1000,
    data: '123456'
  },
  custom_json: {
    required_auths: [],
    required_posting_auths: ['testuser'],
    id: 'test_operation',
    json: '{"value": "test"}'
  },
  claim_account: {
    creator: 'testuser',
    fee: '1.000 STEEM',
    extensions: []
  },
  create_claimed_account: {
    creator: 'testuser',
    new_account_name: 'claimedtestuser',
    owner: testAuthority,
    active: testAuthority,
    posting: testAuthority,
    memo_key: testKey,
    json_metadata: '{}',
    extensions: []
  },
  claim_reward_balance: {
    account: 'testuser',
    reward_steem: '0.001 STEEM',
    reward_sbd: '0.001 SBD',
    reward_vests: '0.001000 VESTS'
  },
  delegate_vesting_shares: {
    delegator: 'testuser',
    delegatee: 'alice',
    vesting_shares: '1000.000000 VESTS'
  },
  delete_comment: {
    author: 'testuser',
    permlink: 'test-post-to-delete'
  },
  comment_options: {
    author: 'testuser',
    permlink: 'test-post',
    max_accepted_payout: '1000.000 SBD',
    percent_steem_dollars: 5000,
    allow_votes: true,
    allow_curation_rewards: true,
    extensions: [[0, { beneficiaries: [{ account: 'alice', weight: 500 }] }]]
  },
  set_withdraw_vesting_route: {
    from_account: 'testuser',
    to_account: 'alice',
    percent: 5000,
    auto_vest: false
  },
  witness_update: {
    owner: 'testuser',
    url: 'https://example.com',
    block_signing_key: testKey,
    props: {
      account_creation_fee: '3.000 STEEM',
      maximum_block_size: 65536,
      sbd_interest_rate: 1000
    },
    fee: '0.001 STEEM'
  },
  witness_set_properties: utils.buildWitnessSetProperties('testuser', {
    key: testKey,
    account_creation_fee: '0.000 STEEM',
    account_subsidy_budget: 10000,
    account_subsidy_decay: 330782,
    maximum_block_size: 65536,
    sbd_interest_rate: 0,
    sbd_exchange_rate: { base: '0.250 SBD', quote: '1.000 STEEM' },
    url: 'https://testurl',
    new_signing_key: testKey
  })[1],
  decline_voting_rights: {
    account: 'testuser',
    decline: false
  },
  reset_account: {
    reset_account: 'alice',
    account_to_reset: 'testuser',
    new_owner_authority: testAuthority
  },
  set_reset_account: {
    account: 'testuser',
    current_reset_account: 'alice',
    reset_account: 'bob'
  },
  transfer_to_savings: {
    from: 'testuser',
    to: 'alice',
    amount: '1.000 STEEM',
    memo: 'to savings'
  },
  transfer_from_savings: {
    from: 'testuser',
    request_id: 123,
    to: 'alice',
    amount: '0.500 STEEM',
    memo: 'from savings'
  },
  cancel_transfer_from_savings: {
    from: 'testuser',
    request_id: 123
  },
  limit_order_create: {
    owner: 'testuser',
    orderid: 1,
    amount_to_sell: '10.000 STEEM',
    min_to_receive: '1.000 SBD',
    fill_or_kill: false,
    expiration: new Date(Date.now() + 86400000).toISOString().slice(0, -5)
  },
  limit_order_create2: {
    owner: 'testuser',
    orderid: 2,
    amount_to_sell: '5.000 SBD',
    fill_or_kill: false,
    exchange_rate: {
      base: '1.000 SBD',
      quote: '10.000 STEEM'
    },
    expiration: new Date(Date.now() + 86400000).toISOString().slice(0, -5)
  },
  limit_order_cancel: {
    owner: 'testuser',
    orderid: 1
  },
  feed_publish: {
    publisher: 'testuser',
    exchange_rate: {
      base: '1.000 SBD',
      quote: '10.000 STEEM'
    }
  },
  escrow_transfer: {
    from: 'testuser',
    to: 'alice',
    sbd_amount: '1.000 SBD',
    steem_amount: '10.000 STEEM',
    escrow_id: 1,
    agent: 'bob',
    fee: '0.100 STEEM',
    json_meta: '{}',
    ratification_deadline: new Date(Date.now() + 86400000).toISOString().slice(0, -5),
    escrow_expiration: new Date(Date.now() + 172800000).toISOString().slice(0, -5)
  },
  escrow_dispute: {
    from: 'testuser',
    to: 'alice',
    agent: 'bob',
    who: 'testuser',
    escrow_id: 1
  },
  escrow_release: {
    from: 'testuser',
    to: 'alice',
    agent: 'bob',
    who: 'testuser',
    receiver: 'alice',
    escrow_id: 1,
    sbd_amount: '0.500 SBD',
    steem_amount: '5.000 STEEM'
  },
  escrow_approve: {
    from: 'testuser',
    to: 'alice',
    agent: 'bob',
    who: 'testuser',
    escrow_id: 1,
    approve: true
  },
  recover_account: {
    account_to_recover: 'testuser',
    new_owner_authority: testAuthority,
    recent_owner_authority: testAuthority,
    extensions: []
  },
  request_account_recovery: {
    recovery_account: 'alice',
    account_to_recover: 'testuser',
    new_owner_authority: testAuthority,
    extensions: []
  },
  change_recovery_account: {
    account_to_recover: 'testuser',
    new_recovery_account: 'alice',
    extensions: []
  },
  create_proposal: {
    creator: 'testuser',
    receiver: 'alice',
    start_date: new Date(Date.now() + 3600000).toISOString().slice(0, -5),
    end_date: new Date(Date.now() + 604800000).toISOString().slice(0, -5),
    daily_pay: '1.000 SBD',
    subject: 'Test Proposal',
    permlink: 'test-proposal-123',
    extensions: []
  },
  update_proposal_votes: {
    voter: 'bob',
    proposal_ids: [1, 2, 3],
    approve: true,
    extensions: []
  },
  remove_proposal: {
    proposal_owner: 'testuser',
    proposal_ids: [1, 2],
    extensions: []
  }
}

// Operations to skip
const skipOperations = [
  'pow',
  'pow2',
  'report_over_production',
  'custom_binary',
  'witness_block_approve'
]

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const testOperation = async (opType: any, opData: any, index: number) => {
  console.log(`Testing operation ${index + 1}: ${opType}`)
  let passed = true
  try {
    const trx = new Transaction()
    await trx.addOperation(opType, opData)

    // Get transaction hex from API node
    const { digest: apiDigest, txId: apiTxId } = await getTransactionHex(trx.transaction!)

    // Compare results
    const localDigest = trx.digest()

    if (bytesToHex(localDigest.digest) === bytesToHex(apiDigest)) {
      console.log(`  ✅ Digest match for ${opType}`)
    } else {
      passed = false
      console.log(`  ❌ Digest mismatch for ${opType}`)
      console.log(`    Local:  ${bytesToHex(localDigest.digest)}`)
      console.log(`    API:    ${bytesToHex(apiDigest)}`)
    }

    if (localDigest.txId === apiTxId) {
      console.log(`  ✅ TxId match for ${opType}`)
    } else {
      passed = false
      console.log(`  ❌ TxId mismatch for ${opType}`)
      console.log(`    Local:  ${localDigest.txId}`)
      console.log(`    API:    ${apiTxId}`)
    }
  } catch (error) {
    passed = false
    console.log(`  ❌ Error testing ${opType}:`, error)
  } finally {
    return passed
  }
}

export const operationTests = async () => {
  const opTypes = Object.keys(operationSamples)

  console.log(`Testing ${opTypes.length} operations...\n`)

  const allOperationTypes = Object.keys(utils.operations)

  let passedCount = 0

  for (let i = 0; i < opTypes.length; i++) {
    const opType = opTypes[i]
    const opData = operationSamples[opType]
    const passed = await testOperation(opType, opData, i)
    if (passed) {
      passedCount++
    }
    // Rate limiting sleep
    await sleep(100)
  }
  console.log('\nAll operation tests completed!')
  console.log(`✅ Passed tests:${passedCount}`)
  console.log(`❌ Failed tests:${opTypes.length - passedCount}`)

  for (const opType of allOperationTypes) {
    if (!opTypes.includes(opType) && !skipOperations.includes(opType)) {
      console.log(`  ❌ Not implemented: ${opType}`)
    }
  }
  if (passedCount !== opTypes.length) {
    throw new Error(`${opTypes.length - passedCount} operation test(s) failed`)
  }
}
