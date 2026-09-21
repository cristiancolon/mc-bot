import { Vec3 } from 'vec3'

// Blocks that hurt on contact, or that pathing into means death.
export const DANGER_BLOCKS = new Set([
  'lava',
  'flowing_lava',
  'fire',
  'soul_fire',
  'campfire',
  'soul_campfire',
  'magma_block',
  'cactus',
  'sweet_berry_bush',
  'powder_snow',
  'wither_rose',
  'pointed_dripstone',
  'end_portal',
  'nether_portal'
])

/**
 * Water is deliberately NOT in DANGER_BLOCKS. It does no contact damage, and
 * DANGER_BLOCKS also feeds `movements.blocksToAvoid`, so listing it there would
 * stop the pathfinder crossing any water at all.
 *
 * It is still a bad place to *stop*: head-deep water drowns the bot (nothing
 * tracks its breath), swimming is slower than the mobs chasing it, and Drowned
 * live there. `movements.js` already prices this into the path via
 * `liquidCost`, but `findRetreat` picks the destination and had no such rule --
 * so a retreat into water with a Drowned in it killed the bot on a real server.
 */
export const WATER_BLOCKS = new Set([
  'water',
  'bubble_column',
  'kelp',
  'kelp_plant',
  'seagrass',
  'tall_seagrass'
])

const isPassable = (block) => !block || block.boundingBox === 'empty'
const isSolid = (block) => block && block.boundingBox === 'block'

// Note `water` has boundingBox 'empty', so it passes isPassable -- which is
// exactly how it slipped through before. Waterlogged blocks (ladders, signs,
// rails) report their own name rather than 'water', hence the property check.
// Air is by far the most common block here, so it short-circuits first: this
// runs for every candidate position on every flee tick.
const isWater = (block) => {
  if (!block || block.name === 'air') return false
  if (WATER_BLOCKS.has(block.name)) return true
  return block.getProperties?.().waterlogged === true
}

/** True if the bot can stand at `pos` without taking damage or drowning. */
export const isStandable = (bot, pos) => {
  const ground = bot.blockAt(pos.offset(0, -1, 0))
  const feet = bot.blockAt(pos)
  const head = bot.blockAt(pos.offset(0, 1, 0))
  if (!isSolid(ground) || DANGER_BLOCKS.has(ground.name)) return false
  if (!isPassable(feet) || DANGER_BLOCKS.has(feet?.name) || isWater(feet)) return false
  if (!isPassable(head) || DANGER_BLOCKS.has(head?.name) || isWater(head)) return false
  return true
}

/** Scan a 3x3x3 shell around `pos` for anything that does damage. */
export const hasNearbyHazard = (bot, pos, radius = 2) => {
  for (let x = -radius; x <= radius; x++) {
    for (let y = -1; y <= radius; y++) {
      for (let z = -radius; z <= radius; z++) {
        const block = bot.blockAt(pos.offset(x, y, z))
        if (block && DANGER_BLOCKS.has(block.name)) return true
      }
    }
  }
  return false
}

/**
 * Pick somewhere to run to.
 *
 * Naively sprinting along the reverse threat vector is how bots end up in lava
 * or off a cliff. Instead we sample a ring of candidate positions, throw out the
 * ones that are not safe to stand in, and score the rest on distance gained from
 * the threats while penalising deviation from straight-away.
 */
export const findRetreat = (bot, threats, { radius = 14, samples = 24 } = {}) => {
  const origin = bot.entity.position.floored()
  if (threats.length === 0) return null

  // Centroid of the threats, weighted so the scariest mob pulls hardest.
  let cx = 0
  let cz = 0
  let totalWeight = 0
  for (const t of threats) {
    cx += t.entity.position.x * t.weight
    cz += t.entity.position.z * t.weight
    totalWeight += t.weight
  }
  const centroid = new Vec3(cx / totalWeight, origin.y, cz / totalWeight)

  const away = origin.minus(centroid)
  const awayLength = Math.hypot(away.x, away.z) || 1
  const awayAngle = Math.atan2(away.z / awayLength, away.x / awayLength)

  let best = null
  for (let i = 0; i < samples; i++) {
    // Sweep outward from "directly away" so ties favour the natural escape line.
    const spread = (i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2) * ((2 * Math.PI) / samples)
    const angle = awayAngle + spread

    for (const dist of [radius, radius * 0.6]) {
      const candidate = origin.offset(
        Math.round(Math.cos(angle) * dist),
        0,
        Math.round(Math.sin(angle) * dist)
      )

      // Follow the terrain a little rather than demanding a flat world.
      for (const dy of [0, -1, 1, -2, 2, -3]) {
        const pos = candidate.offset(0, dy, 0)
        if (!isStandable(bot, pos)) continue
        if (hasNearbyHazard(bot, pos)) continue

        const minThreatDist = Math.min(
          ...threats.map((t) => t.entity.position.distanceTo(pos))
        )
        // Reward getting away from mobs; lightly penalise sideways detours.
        const score = minThreatDist - Math.abs(spread) * 1.5
        if (!best || score > best.score) best = { pos, score, minThreatDist }
        break
      }
    }
  }

  return best
}
