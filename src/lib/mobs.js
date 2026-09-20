import { config } from '../config.js'

// Mobs that are flagged `hostile` in minecraft-data but only retaliate.
// Attacking one on sight turns a safe walk into a fight the bot did not need.
export const NEUTRAL = new Set([
  'enderman',
  'zombified_piglin',
  'piglin',
  'piglin_brute',
  'wolf',
  'polar_bear',
  'llama',
  'trader_llama',
  'panda',
  'bee',
  'goat',
  'iron_golem',
  'dolphin',
  'spider', // hostile only in the dark; treated as neutral until it aggros
  'cave_spider'
])

// Mobs that are dangerous to melee regardless of health.
export const AVOID_MELEE = new Set(['creeper', 'ghast', 'blaze', 'warden', 'elder_guardian'])

// Relative danger, used to decide flee vs fight. Higher = scarier.
const THREAT_WEIGHT = {
  creeper: 6,
  warden: 20,
  witch: 4,
  ravager: 8,
  vindicator: 5,
  evoker: 6,
  pillager: 4,
  skeleton: 3,
  stray: 3,
  blaze: 5,
  enderman: 5,
  zombie: 2,
  husk: 2,
  drowned: 3,
  spider: 2,
  cave_spider: 3,
  slime: 2,
  phantom: 3,
  zoglin: 5,
  hoglin: 4,
  piglin_brute: 6
}

// Animals worth killing for food.
export const FOOD_ANIMALS = new Set(['cow', 'pig', 'sheep', 'chicken', 'rabbit', 'mooshroom'])

export const isHostileType = (entity) => {
  if (!entity || entity.type === 'player' || entity.type === 'object') return false
  return entity.type === 'hostile' || entity.kind === 'Hostile mobs'
}

export const mobName = (entity) => entity?.name || entity?.displayName || 'unknown'

/**
 * A mob counts as a threat if it is hostile-by-default, or it is a neutral mob
 * that has recently damaged us (tracked in `aggressors`).
 */
export const isThreat = (entity, aggressors) => {
  if (!isHostileType(entity)) return false
  const name = mobName(entity)
  if (NEUTRAL.has(name)) return aggressors.has(entity.id)
  return true
}

export const threatWeight = (entity) => THREAT_WEIGHT[mobName(entity)] ?? 2

/**
 * Scan for threats once per tick. Everything downstream reads this snapshot so
 * every behavior in a tick sees the same world.
 */
export const scanThreats = (bot, aggressors) => {
  const origin = bot.entity.position
  const threats = []

  for (const entity of Object.values(bot.entities)) {
    if (entity === bot.entity) continue
    if (!isThreat(entity, aggressors)) continue
    const distance = entity.position.distanceTo(origin)
    if (distance > config.detectRange) continue
    threats.push({ entity, distance, weight: threatWeight(entity), name: mobName(entity) })
  }

  threats.sort((a, b) => a.distance - b.distance)

  // Danger scales with proximity: a skeleton at 15 blocks is noise, at 3 it is a problem.
  const score = threats.reduce((sum, t) => sum + t.weight / Math.max(2, t.distance), 0)
  const creeperClose = threats.some(
    (t) => t.name === 'creeper' && t.distance <= config.creeperSafeDistance
  )

  return { threats, score, nearest: threats[0] ?? null, creeperClose }
}
