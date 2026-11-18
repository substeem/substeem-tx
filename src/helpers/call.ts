import { config } from '../config.js'
import { CallResponse } from '../types.js'
import { randomBytes } from '@noble/hashes/utils.js'

let rpcIndex = 0
let restIndex = 0
let callIdCounter = 1

export class RPCError extends Error {
  name = 'RPCError'
  data?: any
  code: number
  stack: undefined = undefined
  constructor(rpcError: { message: string; code: number; data?: any }) {
    super(rpcError.message)
    this.code = rpcError.code
    if ('data' in rpcError) {
      this.data = rpcError.data
    }
  }
}

const validateNodeUrl = (url: string): string => {
  if (typeof url !== 'string' || !url.trim()) {
    throw new Error('Node URL must be a non-empty string')
  }
  const trimmed = url.trim()
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error(`Invalid node URL '${url}': protocol must be http or https`)
  }
  return trimmed
}

const post = async (url: string, body: unknown, timeout: number): Promise<unknown> => {
  const targetUrl = validateNodeUrl(url)
  const res = await fetch(targetUrl, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(timeout)
  })
  return res.json()
}

/** Returns the result of a JSON-RPC response, or throws its error */
const readResult = (response: CallResponse | undefined, id: number) => {
  if (!response || response.id !== id || response.jsonrpc !== '2.0') {
    throw new Error('JSONRPC id mismatch')
  }
  if ('result' in response) {
    return response.result
  }
  if ('error' in response) {
    const e = response.error
    if (
      'message' in e &&
      'code' in e &&
      !e.message.toLowerCase().includes('Unable to send request to endpoint'.toLowerCase())
    ) {
      throw new RPCError(e)
    }
    throw response.error
  }
  // No result and no error?
  throw response
}

/** shoudRetry is false by default - i.e. no retry
 * on true, retry one more time
 */
const jsonRPCCall = async (
  url: string,
  method: string,
  params: any,
  timeout = config.timeout,
  shouldRetry = false
) => {
  const id = ++callIdCounter
  try {
    const response = await post(url, { jsonrpc: '2.0', method, params, id }, timeout)
    return readResult(response as CallResponse, id)
  } catch (e) {
    if (e instanceof RPCError) {
      throw e
    }
    if (shouldRetry) {
      return jsonRPCCall(url, method, params, timeout, false)
    }
    throw e
  }
}

/** Calls `method` once per entry of `paramsList` in one HTTP request; results keep that order */
const jsonRPCBatch = async (
  url: string,
  method: string,
  paramsList: unknown[],
  timeout: number
) => {
  const body = paramsList.map((params, id) => ({ jsonrpc: '2.0', method, params, id }))
  const responses = await post(url, body, timeout)
  if (!Array.isArray(responses)) {
    throw new Error('JSONRPC batch request not supported')
  }
  return body.map(({ id }) =>
    readResult(
      responses.find((r) => r?.id === id),
      id
    )
  )
}

/** Sends `request` to the current node, moving to the next node on network or node failure */
const withRPCFailover = async <T>(request: (node: string) => Promise<T>, retry: number) => {
  if (!Array.isArray(config.nodes) || config.nodes.length === 0) {
    throw new Error('config.nodes must be a non-empty array of node URLs')
  }
  for (let tries = 0; ; tries++) {
    if (rpcIndex >= config.nodes.length) {
      rpcIndex = 0
    }
    try {
      return await request(config.nodes[rpcIndex])
    } catch (e) {
      // RPC errors come from the chain; another node would give the same answer
      if (e instanceof RPCError || tries >= retry) {
        throw e
      }
      changeRPCNode()
    }
  }
}

/**
 * Makes API calls to Steem blockchain nodes with automatic retry and failover support.
 * Automatically switches between multiple nodes.
 *
 * The method supports JSON-RPC 2.0 protocol used by Steem API nodes.
 * If the current node fails, it will automatically try the next node in the list.
 *
 * @param method - The API method name (e.g., 'condenser_api.get_accounts')
 * @param params - Parameters for the API method as array or object
 * @param timeout - Request timeout in milliseconds (default: config.timeout)
 * @param retry - Number of retry attempts before throwing an error (default: config.retry)
 * @returns Promise resolving to the API response
 * @throws Error if all retry attempts fail or on RPCError
 *
 * @example
 * ```typescript
 * import { callRPC } from '@substeem/steem-sdk'
 *
 * // Get account information
 * const accounts = await callRPC('condenser_api.get_accounts', [['alice']])
 *
 * // Custom timeout and retry settings
 * const data = await callRPC('condenser_api.get_content', ['alice', 'test-post'], 10_000, 8)
 * ```
 */
export const callRPC = async <T = any>(
  method: string,
  params: any[] | object = [],
  timeout = config.timeout,
  retry = config.retry
): Promise<T> => {
  return withRPCFailover((node) => jsonRPCCall(node, method, params, timeout), retry)
}

/**
 * Backwards-compatible alias for callRPC
 */
export const call = callRPC

/**
 * Like `callRPC`, but calls `method` once per entry of `paramsList` in a single JSON-RPC batch request.
 * Results keep the order of `paramsList`. Throws `RPCError` if any call in the batch fails.
 *
 * @example
 * ```typescript
 * import { callRPCBatch } from '@substeem/steem-sdk'
 *
 * const [first, second] = await callRPCBatch('condenser_api.get_block', [[1], [2]])
 * ```
 */
export const callRPCBatch = async <T = any>(
  method: string,
  paramsList: unknown[],
  timeout = config.timeout,
  retry = config.retry
): Promise<T[]> => {
  return withRPCFailover((node) => jsonRPCBatch(node, method, paramsList, timeout), retry)
}

/**
 * Generic REST API caller with automatic retry, URL validation, and failover support.
 *
 * @param endpoint - Endpoint path (e.g., '/api/v1/resource') or full URL
 * @param params - Optional parameters for path substitution ({key}) and query parameters
 * @param timeout - Request timeout in milliseconds (default: config.timeout)
 * @param retry - Number of retry attempts before throwing an error (default: config.retry)
 */
export async function callREST<T = any>(
  endpoint: string,
  params?: Record<string, unknown>,
  timeout = config.timeout,
  retry = config.retry
): Promise<T> {
  if (!Array.isArray(config.restNodes) || config.restNodes.length === 0) {
    throw new Error('config.restNodes must be a non-empty array of node URLs')
  }
  let path = endpoint
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params || {})) {
    if (path.includes(`{${key}}`)) {
      path = path.replace(`{${key}}`, encodeURIComponent(String(value)))
    } else if (Array.isArray(value)) {
      value.forEach((v) => query.append(key, String(v)))
    } else if (value !== undefined && value !== null) {
      query.set(key, String(value))
    }
  }
  const search = query.size ? `?${query}` : ''
  for (let tries = 0; ; tries++) {
    if (restIndex >= config.restNodes.length) {
      restIndex = 0
    }
    const base = validateNodeUrl(config.restNodes[restIndex]).replace(/\/+$/, '')
    const url =
      path.startsWith('http://') || path.startsWith('https://')
        ? path + search
        : `${base}${path.startsWith('/') ? '' : '/'}${path}${search}`
    let status = 0
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(timeout) })
      status = response.status
      if (status === 404) {
        throw new Error(`HTTP 404 - Not Found: ${url}`)
      }
      if (status >= 500) {
        throw new Error(`HTTP ${status} from ${url}`)
      }
      return (await response.json()) as T
    } catch (e) {
      if (status === 404 || tries >= retry) {
        throw e
      }
      changeRESTNode()
    }
  }
}

/**
 * Make a JSONRPC call with quorum. The method will cross-check the result
 * with `quorum` number of nodes before returning the result.
 * @param method - The API method name (e.g., 'condenser_api.get_accounts')
 * @param params - Parameters for the API method as array or object
 * @param quorum - Default: 2 (recommended)
 */
export const callWithQuorum = async <T = any>(
  method: string,
  params: any[] | object = [],
  quorum = 2
): Promise<T> => {
  if (!Array.isArray(config.nodes) || config.nodes.length === 0) {
    throw new Error('config.nodes must be a non-empty array')
  }
  if (quorum > config.nodes.length) {
    throw new Error('quorum > config.nodes.length')
  }
  // Uniform Fisher-Yates shuffle using cryptographically secure random values
  const shuffleNodes = (arr: string[]): string[] => {
    const result = [...arr]
    const entropy = randomBytes(result.length)
    for (let i = result.length - 1; i > 0; i--) {
      const j = entropy[i] % (i + 1)
      const temp = result[i]
      result[i] = result[j]
      result[j] = temp
    }
    return result
  }
  let allNodes = shuffleNodes(config.nodes)
  let currentBatchSize = Math.min(quorum, allNodes.length)
  let allResults: any[] = []
  while (currentBatchSize > 0 && allNodes.length > 0) {
    // Take next batch of nodes
    const batchNodes = allNodes.splice(0, currentBatchSize)
    const promises: Promise<any>[] = []
    const batchResults: any[] = []
    // Launch batch calls in parallel
    for (let i = 0; i < batchNodes.length; i++) {
      promises.push(
        jsonRPCCall(batchNodes[i], method, params, undefined, true)
          .then((data) => batchResults.push(data))
          .catch(() => {})
      )
    }
    await Promise.all(promises)
    allResults.push(...batchResults)
    // Check for consensus in successful results
    const consensusResult = findConsensus(allResults, quorum)
    if (consensusResult) {
      return consensusResult
    }
    // Prepare next batch
    currentBatchSize = Math.min(quorum, allNodes.length)
    if (currentBatchSize === 0) {
      throw new Error('No more nodes available.')
    }
  }
  throw new Error("Couldn't reach quorum.")
}

function findConsensus(results: any[], quorum: number) {
  const resultGroups = new Map<string, any[]>()
  for (const result of results) {
    const key = JSON.stringify(result)
    if (!resultGroups.has(key)) {
      resultGroups.set(key, [])
    }
    resultGroups.get(key)!.push(result)
  }
  const consensusGroup = Array.from(resultGroups.values()).find((group) => group.length >= quorum)
  return consensusGroup ? consensusGroup[0] : null
}

const changeRPCNode = (newNodeIndex = rpcIndex + 1) => {
  if (newNodeIndex > config.nodes.length - 1) {
    newNodeIndex = 0
  }
  rpcIndex = newNodeIndex
}

const changeRESTNode = (newNodeIndex = restIndex + 1) => {
  if (newNodeIndex > config.restNodes.length - 1) {
    newNodeIndex = 0
  }
  restIndex = newNodeIndex
}
