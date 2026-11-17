/**
 * Class representing a Steem asset,
 * e.g. `1.000 STEEM`, `5.000 SBD` or `12.112233 VESTS`.
 */
export class Asset {
  amount: number
  symbol: string

  constructor(amount: number, symbol: string) {
    this.amount = amount
    this.symbol = symbol
  }

  /** Create a new Asset instance from a string, e.g. `42.000 STEEM`. */
  static fromString(string: string, expectedSymbol: string | null = null): Asset {
    const [amountString, symbol] = string.split(' ')
    if (['STEEM', 'VESTS', 'SBD', 'TESTS', 'TBD'].indexOf(symbol) === -1) {
      throw new Error(`Invalid asset symbol: ${symbol}`)
    }
    if (expectedSymbol && symbol !== expectedSymbol) {
      throw new Error(`Invalid asset, expected symbol: ${expectedSymbol} got: ${symbol}`)
    }
    const amount = Number.parseFloat(amountString)
    if (!Number.isFinite(amount)) {
      throw new Error(`Invalid asset amount: ${amountString}`)
    }
    return new Asset(amount, symbol)
  }

  /**
   * Convenience to create new Asset.
   * @param symbol Symbol to use when created from number. Will also be used to validate
   *               the asset, throws if the passed value has a different symbol than this.
   */
  static from(value: number | string | Asset, symbol?: string | null): Asset {
    const targetSymbol = symbol || null
    if (value instanceof Asset) {
      if (targetSymbol && value.symbol !== targetSymbol) {
        throw new Error(`Invalid asset, expected symbol: ${targetSymbol} got: ${value.symbol}`)
      }
      return value
    } else if (typeof value === 'number' && Number.isFinite(value)) {
      return new Asset(value, targetSymbol || 'STEEM')
    } else if (typeof value === 'string') {
      return Asset.fromString(value, targetSymbol)
    } else {
      throw new Error(`Invalid asset '${String(value)}'`)
    }
  }

  /** Return asset precision. */
  getPrecision() {
    switch (this.symbol) {
      case 'TESTS':
      case 'TBD':
      case 'STEEM':
      case 'SBD':
        return 3
      case 'VESTS':
        return 6
      default:
        return 3
    }
  }

  /** Return a string representation of this asset, e.g. `42.000 STEEM`. */
  toString() {
    return `${this.amount.toFixed(this.getPrecision())} ${this.symbol}`
  }

  toJSON() {
    return this.toString()
  }
}
