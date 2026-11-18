/**
 * Configuration object for customizing steem-sdk library behavior.
 * Modify these values to change the default node endpoints, timeout, and other settings.
 */
interface SteemConfig {
  nodes: string[]
  restNodes: string[]
  chain_id: string
  address_prefix: string
  timeout: number
  retry: number
  axiosAdapter?: any
  node: string[] | string
}

export const config: SteemConfig = {
  /**
   * Array of Steem API node endpoints for load balancing and failover.
   * @default Array of multiple Steem API endpoints
   */
  nodes: [
    'https://api.steemit.com',
    'https://api.steemitdev.com',
    'https://api.steem.fans',
    'https://api.moecki.online'
  ],

  /**
   * Array of Steem API node endpoints that support REST or mirror APIs
   */
  restNodes: [
    'https://api.steemit.com',
    'https://api.steemitdev.com',
    'https://api.steem.fans',
    'https://api.moecki.online'
  ],

  /**
   * The Steem blockchain chain ID for transaction signing and verification.
   * @default Steem Mainnet chain ID (32 zero bytes)
   */
  chain_id: '0000000000000000000000000000000000000000000000000000000000000000',

  /**
   * Address prefix used for public key formatting (STM for mainnet).
   * @default 'STM'
   */
  address_prefix: 'STM',

  /**
   * Timeout in milliseconds for individual API calls.
   * @default 10000
   */
  timeout: 10_000,

  /**
   * Number of retry attempts for failed API calls before throwing an error.
   * @default 5
   */
  retry: 5,

  /**
   * Optional axiosAdapter placeholder for backwards compatibility
   */
  axiosAdapter: null,

  /**
   * Backwards-compatible getter and setter for config.node
   */
  get node(): string[] | string {
    return this.nodes
  },
  set node(val: string[] | string) {
    if (Array.isArray(val)) {
      this.nodes = val
    } else if (typeof val === 'string') {
      this.nodes = [val]
    }
  }
}
