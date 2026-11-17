import { cachedRPC } from './cachedRPC.js'

/**
 * Stake, mana, vote, and reputation math. Account helpers take a name, or an account object
 * you already have (condenser_api or database_api format) to skip the request.
 * Chain data is fetched internally and cached for 2 seconds.
 * Results are JavaScript numbers: exact enough for display and estimates, not for consensus.
 */

/** Asset as returned by condenser_api (`"1.000 STEEM"`) or by database_api (NAI object) */
export type AssetInput = string | { amount: string; precision: number; nai: string }

/** Manabar fields as returned by the API */
export interface ManabarInput {
  current_mana: number | string
  last_update_time: number
}

/** Account fields used for stake and mana, from `get_accounts` or `find_accounts` */
export interface StakeAccount {
  vesting_shares: AssetInput
  delegated_vesting_shares: AssetInput
  received_vesting_shares: AssetInput
  vesting_withdraw_rate: AssetInput
  to_withdraw: number | string
  withdrawn: number | string
  voting_manabar: ManabarInput
  downvote_manabar: ManabarInput
}

/** Account fields from `rc_api.find_rc_accounts` */
export interface RCAccount {
  max_rc: number | string
  rc_manabar: ManabarInput
}

/** Account fields used for its value, from `get_accounts` */
export interface WalletAccount extends StakeAccount {
  name: string
  balance: AssetInput
  savings_balance: AssetInput
  sbd_balance?: AssetInput
  savings_sbd_balance?: AssetInput
}

/** Account name, or an account object from `get_accounts` / `find_accounts` */
export type AccountInput = string | StakeAccount

/** Account name, or an object from `rc_api.find_rc_accounts` */
export type RCAccountInput = string | RCAccount

export interface Manabar {
  /** Current mana, regenerated to now */
  current: number
  max: number
  /** 0 to 100 */
  percentage: number
  /** When the mana will be full; already passed if it is full */
  fullAt: Date
}

const fetchAccount = async <T extends StakeAccount>(account: string | T): Promise<T> => {
  if (typeof account !== 'string') return account
  const [found] = await cachedRPC<T[]>('condenser_api.get_accounts', [[account]])
  if (!found) throw new Error(`Account not found: ${account}`)
  return found
}

const fetchRCAccount = async (account: RCAccountInput): Promise<RCAccount> => {
  if (typeof account !== 'string') return account
  const { rc_accounts } = await cachedRPC('rc_api.find_rc_accounts', { accounts: [account] })
  if (!rc_accounts[0]) throw new Error(`Account not found: ${account}`)
  return rc_accounts[0]
}

/** Mana regenerates from 0 to full in 5 days */
const MANA_REGEN_SECONDS = 432_000
/** Downvote mana is 25% of voting mana */
const DOWNVOTE_POOL = 0.25
/** A 100% vote uses 2% of max mana */
const VOTE_POWER_RESERVE_RATE = 10
/** Votes below this many rshares count as 0 */
const VOTE_DUST_THRESHOLD = 50_000_000

const NAI_SYMBOLS: Record<string, string> = {
  '@@000000021': 'STEEM',
  '@@000000013': 'SBD',
  '@@000000037': 'VESTS'
}

/** Parses `"1.000 STEEM"` or `{ amount: "1000", precision: 3, nai: "@@000000021" }` */
export const parseAsset = (asset: AssetInput): { amount: number; symbol: string } => {
  const parsed =
    typeof asset === 'string'
      ? { amount: Number(asset.split(' ')[0]), symbol: asset.split(' ')[1] }
      : { amount: Number(asset.amount) / 10 ** asset.precision, symbol: NAI_SYMBOLS[asset.nai] }
  if (!Number.isFinite(parsed.amount) || !parsed.symbol) {
    throw new Error(`Invalid asset: ${JSON.stringify(asset)}`)
  }
  return parsed
}

const amountOf = (value: number | AssetInput) =>
  typeof value === 'number' ? value : parseAsset(value).amount

/** SBD per STEEM from the witnesses' median price feed */
const medianPrice = async (): Promise<number> => {
  const price = await cachedRPC('condenser_api.get_current_median_history_price')
  return amountOf(price.base) / amountOf(price.quote)
}

/** Converts STEEM to SBD at the median price feed */
export const steemToSbd = async (steem: number | AssetInput): Promise<number> =>
  amountOf(steem) * (await medianPrice())

/** Converts SBD to STEEM at the median price feed */
export const sbdToSteem = async (sbd: number | AssetInput): Promise<number> =>
  amountOf(sbd) / (await medianPrice())

/** Converts VESTS to STEEM Power at the current rate */
export const vestsToSP = async (vests: number | AssetInput): Promise<number> => {
  const props = await cachedRPC('condenser_api.get_dynamic_global_properties')
  const totalFund = props.total_vesting_fund_steem
  return (amountOf(vests) * amountOf(totalFund)) / amountOf(props.total_vesting_shares)
}

/** Converts STEEM Power to VESTS at the current rate */
export const spToVests = async (sp: number | AssetInput): Promise<number> => {
  const props = await cachedRPC('condenser_api.get_dynamic_global_properties')
  const totalFund = props.total_vesting_fund_steem
  return (amountOf(sp) * amountOf(props.total_vesting_shares)) / amountOf(totalFund)
}

const effectiveVests = (account: StakeAccount): number => {
  // to_withdraw and withdrawn are in micro-VESTS
  const remainingPowerDown = (Number(account.to_withdraw) - Number(account.withdrawn)) / 1e6
  return (
    amountOf(account.vesting_shares) -
    amountOf(account.delegated_vesting_shares) +
    amountOf(account.received_vesting_shares) -
    Math.min(amountOf(account.vesting_withdraw_rate), remainingPowerDown)
  )
}

/**
 * VESTS that give voting power: own + received - delegated - this week's power down.
 * This is also the maximum voting mana, in VESTS.
 */
export const getEffectiveVests = async (account: AccountInput): Promise<number> =>
  effectiveVests(await fetchAccount(account))

const regenerate = (bar: ManabarInput, max: number, now: number): Manabar => {
  const elapsed = Math.max(0, now / 1000 - bar.last_update_time)
  const current = Math.min(
    max,
    Number(bar.current_mana) + Math.floor((max * elapsed) / MANA_REGEN_SECONDS)
  )
  const secondsToFull = max > 0 ? ((max - current) * MANA_REGEN_SECONDS) / max : 0
  return {
    current,
    max,
    percentage: max > 0 ? (current / max) * 100 : 0,
    fullAt: new Date(now + secondsToFull * 1000)
  }
}

/** Mana is counted in micro-VESTS */
const maxVotingMana = (account: StakeAccount) => Math.round(effectiveVests(account) * 1e6)

/** Upvote mana ("voting power") of an account at `now` (ms) */
export const getVotingMana = async (account: AccountInput, now = Date.now()): Promise<Manabar> => {
  const acc = await fetchAccount(account)
  return regenerate(acc.voting_manabar, maxVotingMana(acc), now)
}

/** Downvote mana of an account at `now` (ms) */
export const getDownvoteMana = async (
  account: AccountInput,
  now = Date.now()
): Promise<Manabar> => {
  const acc = await fetchAccount(account)
  return regenerate(acc.downvote_manabar, Math.floor(maxVotingMana(acc) * DOWNVOTE_POOL), now)
}

/** Resource credits of an account at `now` (ms) */
export const getRCMana = async (account: RCAccountInput, now = Date.now()): Promise<Manabar> => {
  const acc = await fetchRCAccount(account)
  return regenerate(acc.rc_manabar, Number(acc.max_rc), now)
}

/**
 * rshares a vote adds to a post. `weight` is -10000 to 10000 (-100% to 100%).
 */
export const getVoteRShares = async (account: AccountInput, weight = 10000): Promise<number> => {
  const usedMana = Math.ceil(
    (maxVotingMana(await fetchAccount(account)) * Math.abs(weight) * 86400) /
      10000 /
      (VOTE_POWER_RESERVE_RATE * MANA_REGEN_SECONDS)
  )
  return Math.sign(weight) * Math.max(0, usedMana - VOTE_DUST_THRESHOLD)
}

/** SBD value of rshares at the current reward pool and median price */
export const rsharesToSBD = async (rshares: number): Promise<number> => {
  const [fund, price] = await Promise.all([
    cachedRPC('condenser_api.get_reward_fund', ['post']),
    medianPrice()
  ])
  return ((rshares * amountOf(fund.reward_balance)) / Number(fund.recent_claims)) * price
}

/** Estimated SBD value of a vote, author and curation rewards combined */
export const getVoteValue = async (account: AccountInput, weight = 10000): Promise<number> =>
  rsharesToSBD(await getVoteRShares(account, weight))

/** Yearly STEEM Power interest in percent */
export const getSpApr = async (): Promise<number> => {
  const [props, price] = await Promise.all([
    cachedRPC('condenser_api.get_dynamic_global_properties'),
    medianPrice()
  ])
  const inflation = Math.max(978 - Math.floor(props.head_block_number / 250_000), 95) / 10000
  const sbdSupply = props.current_sbd_supply
  const supply = amountOf(props.current_supply) + amountOf(sbdSupply) / price
  const yearlyVestingReward = (supply * inflation * (props.vesting_reward_percent || 1500)) / 10000
  const totalFund = props.total_vesting_fund_steem
  return (yearlyVestingReward / amountOf(totalFund)) * 100
}

/** Yearly interest on SBD in savings, in percent */
export const getSbdApr = async (): Promise<number> => {
  const props = await cachedRPC('condenser_api.get_dynamic_global_properties')
  const rate = props.sbd_interest_rate || 0
  return rate / 100
}

/**
 * Estimated account value in SBD at the median price: liquid, savings, STEEM Power
 * (own, including delegated out), and funds in open market orders.
 */
export const estimateAccountValue = async (account: string | WalletAccount): Promise<number> => {
  const acc = await fetchAccount(account)
  const [orders, sp, price] = await Promise.all([
    cachedRPC<{ for_sale: number; sell_price: { base: AssetInput } }[]>(
      'condenser_api.get_open_orders',
      [acc.name]
    ),
    vestsToSP(acc.vesting_shares),
    medianPrice()
  ])
  let steem = amountOf(acc.balance) + amountOf(acc.savings_balance) + sp
  const sbdBal = acc.sbd_balance || 0
  const savingsSbd = acc.savings_sbd_balance || 0
  let sbd = amountOf(sbdBal) + amountOf(savingsSbd)
  for (const order of orders) {
    const sym = parseAsset(order.sell_price.base).symbol
    if (sym === 'STEEM') steem += order.for_sale / 1000
    else sbd += order.for_sale / 1000
  }
  return sbd + steem * price
}

/** Converts raw reputation (e.g. `"79470587263453"`) to the familiar score (e.g. `66.2`) */
export const formatReputation = (raw: number | string): number => {
  const rep = Number(raw)
  return Math.max(Math.log10(Math.abs(rep)) - 9, 0) * Math.sign(rep) * 9 + 25
}
