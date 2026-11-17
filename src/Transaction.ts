import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js'
import { PrivateKey } from './helpers/PrivateKey.js'
import {
  OperationName,
  OperationBody,
  TransactionType,
  TransactionStatus,
  BroadcastResult
} from './types.js'
import { ByteBuffer } from './helpers/ByteBuffer.js'
import { Serializer } from './helpers/serializer.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { config } from './config.js'
import { callRPC, RPCError } from './helpers/call.js'
import { DigestData } from './types.js'
import { cachedRPC } from './helpers/cachedRPC.js'

export interface TransactionOptions {
  transaction?: TransactionType | Transaction
  /**
   * Transaction expiration in milliseconds (ms) - max 86400000 (24 hours)
   * @default 60_000
   */
  expiration?: number
}

export class Transaction {
  transaction?: TransactionType

  expiration: number = 60_000

  private txId?: string

  constructor(options?: TransactionOptions | TransactionType | Transaction | any) {
    if (!options) return
    if (options instanceof Transaction) {
      this.transaction = options.transaction ? { ...options.transaction } : undefined
      this.expiration = options.expiration
      if (this.transaction) {
        this.txId = this.digest().txId
      }
    } else if (
      typeof options === 'object' &&
      ('operations' in options || 'ref_block_num' in options)
    ) {
      // Direct raw transaction passed in
      this.transaction = { ...(options as TransactionType) }
      if (!this.transaction.signatures) {
        this.transaction.signatures = []
      }
      this.txId = this.digest().txId
    } else if (typeof options === 'object' && 'transaction' in options && options.transaction) {
      const tx = options.transaction
      if (tx instanceof Transaction) {
        this.transaction = tx.transaction ? { ...tx.transaction } : undefined
        this.expiration = tx.expiration
      } else {
        this.transaction = { ...tx }
      }
      if (options.expiration) {
        this.expiration = options.expiration
      }
      if (this.transaction) {
        this.txId = this.digest().txId
      }
    } else if (
      typeof options === 'object' &&
      'expiration' in options &&
      typeof options.expiration === 'number'
    ) {
      this.expiration = options.expiration
    }
  }

  /**
   * Backwards-compatible getter for the transaction object
   */
  get signedTransaction(): TransactionType | undefined {
    return this.transaction
  }

  /**
   * Creates a transaction structure with operations and expiration time.
   * @param operations Array of operations to include in the transaction
   * @param exp Expiration time in seconds (default: 60)
   * @returns Promise resolving to the created transaction structure
   */
  async create(operations: any[] = [], exp = 60): Promise<TransactionType> {
    const expireTime = exp > 86400 ? exp : exp * 1000
    this.expiration = expireTime
    await this.createTransaction(this.expiration)
    this.transaction!.operations = operations
    return this.transaction!
  }

  /**
   * Adds an operation to the transaction. If no transaction exists, creates one first.
   * @template O Operation name type for type safety
   * @param operationName The name/type of the operation to add (e.g., 'transfer', 'vote', 'comment')
   * @param operationBody The operation data/body for the specified operation type
   * @returns Promise that resolves when the operation is added
   * @throws Error if transaction creation fails or global properties cannot be retrieved
   */
  async addOperation<O extends OperationName>(
    operationName: O,
    operationBody: OperationBody<O>
  ): Promise<void> {
    if (!this.transaction) {
      await this.createTransaction(this.expiration)
    }
    this.transaction!.operations.push([operationName, operationBody])
  }

  /**
   * Signs the transaction with the provided key(s), supporting both single and multi-signature transactions.
   * For multi-signature, you can sign with all keys at once or sign individually by calling this method multiple times.
   * @param keys Single PrivateKey or array of PrivateKeys to sign the transaction with
   * @returns The signed transaction
   * @throws Error if no transaction exists to sign
   */
  sign(keys: PrivateKey | PrivateKey[]): TransactionType {
    if (!this.transaction) {
      throw new Error('First create a transaction by .create(operations) or .addOperation()')
    }
    const { digest, txId } = this.digest()
    if (!Array.isArray(keys)) {
      keys = [keys]
    }
    for (const key of keys) {
      const signature = key.sign(digest)
      this.transaction.signatures.push(signature.customToString())
    }
    this.txId = txId
    return this.transaction
  }

  /**
   * Broadcasts the signed transaction to the Steem network.
   * Automatically handles retries and duplicate transaction detection.
   * By default uses synchronous broadcast (`condenser_api.broadcast_transaction_synchronous`)
   * which confirms block inclusion.
   *
   * @param optionsOrSync If boolean, specifies whether to broadcast synchronously (default: true).
   *                      If number, specifies custom timeout in seconds.
   * @param retry Number of retry attempts.
   * @returns Promise resolving to broadcast result
   */
  async broadcast(
    optionsOrSync: boolean | number = true,
    retry = config.retry
  ): Promise<BroadcastResult | any> {
    if (!this.transaction) {
      throw new Error('Attempted to broadcast an empty transaction. Add operations first.')
    }
    if (this.transaction.signatures.length === 0) {
      throw new Error(
        'Attempted to broadcast a transaction with no signatures. Sign using .sign(keys)'
      )
    }

    if (!this.txId) {
      this.txId = this.digest().txId
    }

    const synchronous = typeof optionsOrSync === 'boolean' ? optionsOrSync : true
    const timeout = typeof optionsOrSync === 'number' ? optionsOrSync * 1000 : config.timeout
    const method = synchronous
      ? 'condenser_api.broadcast_transaction_synchronous'
      : 'condenser_api.broadcast_transaction'

    let res: any
    try {
      res = await callRPC(method, [this.transaction], timeout, retry)
    } catch (e: any) {
      if (
        e instanceof RPCError &&
        e.message &&
        e.message.includes('Duplicate transaction check failed')
      ) {
        // ignore duplicate transaction error as this can happen when we retry
      } else if (
        e instanceof RPCError ||
        (e && typeof e === 'object' && ('code' in e || 'data' in e))
      ) {
        // Return structured error object compatible with Keychain's ErrorUtils.parse(response.error)
        return {
          id: 1,
          jsonrpc: '2.0',
          error: e.data || { code: e.code || -32000, message: e.message }
        }
      } else {
        throw e
      }
    }

    const txId = res?.id || this.txId
    const resultObj: BroadcastResult = {
      id: txId,
      tx_id: txId,
      status: 'confirmed',
      block_num: res?.block_num,
      trx_num: res?.trx_num,
      expired: res?.expired ?? false,
      result: {
        id: txId,
        tx_id: txId,
        status: 'confirmed',
        block_num: res?.block_num,
        trx_num: res?.trx_num,
        expired: res?.expired ?? false
      }
    }
    return resultObj
  }

  /**
   * Returns the transaction digest containing the transaction ID and hash.
   * The digest can be used to verify signatures and for transaction identification.
   * @returns DigestData containing transaction ID and hash
   * @throws Error if no transaction exists
   */
  digest(): DigestData {
    if (!this.transaction) {
      throw new Error('First create a transaction by .create(operations) or .addOperation()')
    }
    const buffer = new ByteBuffer(ByteBuffer.DEFAULT_CAPACITY, ByteBuffer.LITTLE_ENDIAN)
    const temp = { ...this.transaction }
    try {
      Serializer.Transaction(buffer, temp)
    } catch (cause) {
      throw new Error('Unable to serialize transaction: ' + cause)
    }
    buffer.flip()
    const transactionData = new Uint8Array(buffer.toBuffer())
    const txId = bytesToHex(sha256(transactionData)).slice(0, 40)
    const digest = sha256(new Uint8Array([...hexToBytes(config.chain_id), ...transactionData]))
    return { digest, txId }
  }

  /**
   * Adds a signature to an already created transaction. Useful when signing with external tools.
   * Multiple signatures can be added one at a time for multi-signature transactions.
   * @param signature The signature string in hex format (must be exactly 130 characters)
   * @returns The transaction with the added signature
   * @throws Error if no transaction exists or signature format is invalid
   */
  addSignature(signature: string): TransactionType {
    if (!this.transaction) {
      throw new Error('First create a transaction by .create(operations)')
    }
    if (typeof signature !== 'string') {
      throw new Error('Signature must be string')
    }
    if (signature.length !== 130) {
      throw new Error('Signature must be 130 characters long')
    }
    this.transaction.signatures.push(signature)
    return this.transaction
  }

  /** Get status of this transaction. */
  async checkStatus(): Promise<TransactionStatus> {
    if (!this.txId) {
      this.txId = this.digest().txId
    }
    try {
      return await callRPC('transaction_status_api.find_transaction', {
        transaction_id: this.txId,
        expiration: this.transaction?.expiration
      })
    } catch {
      return { status: 'unknown' }
    }
  }

  /**
   * Creates the transaction structure and initializes it with blockchain data.
   * Retrieves current head block information and sets up reference block data.
   * @private
   * @param expiration Transaction expiration in milliseconds
   */
  private createTransaction = async (expiration: number) => {
    const props = await cachedRPC('condenser_api.get_dynamic_global_properties')
    const bytes = hexToBytes(props.head_block_id)
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const refBlockPrefix = view.getUint32(4, true)
    const expirationIso = new Date(Date.now() + expiration).toISOString().slice(0, -5)
    this.transaction = {
      expiration: expirationIso,
      extensions: [],
      operations: [],
      ref_block_num: props.head_block_number & 0xffff,
      ref_block_prefix: refBlockPrefix,
      signatures: []
    }
  }
}
