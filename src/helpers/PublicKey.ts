import { ripemd160 } from '@noble/hashes/legacy.js'
import { equalBytes } from './utils.js'
import { decode as decodeBase58, encode as encodeBase58 } from './base58.js'
import { config } from '../config.js'
import { secp256k1 } from '@noble/curves/secp256k1.js'
import { Signature } from './Signature.js'

const DEFAULT_ADDRESS_PREFIX = config.address_prefix

export class PublicKey {
  key: Uint8Array
  prefix: string

  /**
   * Creates a new PublicKey instance from raw bytes.
   * Validates that the key is a valid point on the secp256k1 curve.
   * @param key Raw public key bytes (33 bytes, compressed format)
   * @param prefix Optional address prefix (defaults to config.address_prefix)
   */
  constructor(key: Uint8Array, prefix?: string) {
    if (!(key instanceof Uint8Array) || key.length !== 33) {
      throw new Error('Public key must be a 33-byte compressed Uint8Array')
    }
    try {
      secp256k1.Point.fromBytes(key)
    } catch {
      throw new Error('Invalid public key: point is not on secp256k1 curve')
    }
    this.key = key
    this.prefix = prefix ?? DEFAULT_ADDRESS_PREFIX
  }

  /**
   * Creates a PublicKey from a string representation.
   * Validates checksum, prefix, and secp256k1 point validity.
   * @param wif Public key string (e.g., "STM8m5UgaFAAYQRuaNejYdS8FVLVp9Ss3K1qAVk5de6F8s3HnVbvA")
   * @returns New PublicKey instance
   * @throws Error if the key format or checksum is invalid
   */
  static fromString(wif: string): PublicKey {
    const { key, prefix } = decodePublic(wif)
    return new PublicKey(key, prefix)
  }

  /**
   * Creates a PublicKey from a string or returns the instance if already a PublicKey.
   * @param value Public key string or PublicKey instance
   * @returns New or existing PublicKey instance
   */
  static from(value: string | PublicKey): PublicKey {
    if (value instanceof PublicKey) {
      return value
    } else {
      return PublicKey.fromString(value as string)
    }
  }

  /**
   * Verifies a signature against a message hash.
   * @param message 32-byte message hash to verify
   * @param signature Signature to verify
   * @returns True if signature is valid, false otherwise
   */
  verify(message: Uint8Array, signature: Signature | string): boolean {
    if (typeof signature === 'string') {
      signature = Signature.from(signature)
    }
    return secp256k1.verify(signature.data, message, this.key, {
      prehash: false,
      format: 'compact'
    })
  }

  /**
   * Returns the public key as a string for storage or transmission.
   * @returns Public key string with prefix (e.g., "STM8m5UgaFAAYQRuaNejYdS8FVLVp9Ss3K1qAVk5de6F8s3HnVbvA")
   */
  toString(): string {
    return encodePublic(this.key, this.prefix)
  }

  /**
   * Returns JSON representation (same as toString()).
   * @returns Public key string
   */
  toJSON(): string {
    return this.toString()
  }

  /**
   * Returns a string representation for debugging.
   * @returns Formatted public key string
   */
  inspect(): string {
    return `PublicKey: ${this.toString()}`
  }
}

const encodePublic = (key: Uint8Array, prefix: string): string => {
  const checksum = ripemd160(key)
  return prefix + encodeBase58(new Uint8Array([...key, ...checksum.subarray(0, 4)]))
}

/** Decode bs58+ripemd160-checksum encoded public key with strict validation. */
const decodePublic = (encodedKey: string) => {
  if (typeof encodedKey !== 'string') {
    throw new Error('Public key must be a string')
  }
  const prefix = encodedKey.slice(0, 3)
  const base58Key = encodedKey.slice(3)
  const buffer = decodeBase58(base58Key)
  if (buffer.length < 5) {
    throw new Error('Public key data too short')
  }
  const key = buffer.subarray(0, buffer.length - 4)
  const checksum = buffer.subarray(buffer.length - 4)
  const checksumVerify = ripemd160(key).subarray(0, 4)
  if (!equalBytes(checksum, checksumVerify)) {
    throw new Error('Public key checksum mismatch')
  }
  return { key, prefix }
}
