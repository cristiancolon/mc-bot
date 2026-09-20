import { config } from '../config.js'
import { FOOD_ANIMALS, mobName } from '../lib/mobs.js'
import { nearbyFoodDrops, hasFood } from '../lib/food.js'
import { equipWeapon } from '../lib/combat.js'
import { gotoSafely, goalNear, goalXZ } from '../lib/nav.js'
import { log } from '../lib/logger.js'

// Crop -> the metadata value at which it is fully grown. Harvesting early
// returns a single seed and wastes the trip.
const CROPS = {
  wheat: 7,
  carrots: 7,
  potatoes: 7,
  beetroots: 3,
  sweet_berry_bush: 3
}

const findAnimal = (bot) => {
  const origin = bot.entity.position
  return Object.values(bot.entities)
    .filter((e) => FOOD_ANIMALS.has(mobName(e)) && e.isValid)
    .map((e) => ({ entity: e, distance: e.position.distanceTo(origin) }))
    .filter((d) => d.distance <= config.forageRange)
    .sort((a, b) => a.distance - b.distance)[0] ?? null
}

const findCrop = (bot) => {
  const ids = Object.keys(CROPS)
    .map((name) => bot.registry.blocksByName[name]?.id)
    .filter((id) => id !== undefined)
  if (ids.length === 0) return null

  return bot.findBlock({
    matching: (block) => {
      if (!ids.includes(block.type)) return false
      const ripeAt = CROPS[block.name]
      return ripeAt === undefined || block.metadata >= ripeAt
    },
    maxDistance: config.forageRange
  })
}

const collectDrops = async (bot) => {
  const drops = nearbyFoodDrops(bot, 24)
  if (drops.length === 0) return false
  log.info('forage', `collecting ${drops.length} food drop(s)`)
  for (const drop of drops.slice(0, 6)) {
    if (!drop.entity.isValid) continue
    // Walking within a block of the stack is enough; pickup is automatic.
    await gotoSafely(bot, goalNear(drop.entity.position, 1))
  }
  return true
}

const huntAnimal = async (bot, target) => {
  log.info('forage', `hunting ${mobName(target.entity)} @ ${target.distance.toFixed(1)}m`)
  await equipWeapon(bot)
  bot.pvp.attack(target.entity)

  const deadline = Date.now() + 30000
  while (target.entity.isValid && Date.now() < deadline) {
    await bot.waitForTicks(10)
  }
  bot.pvp.stop()

  // Drops need a moment to spawn and settle before they are findable.
  await bot.waitForTicks(20)
  await collectDrops(bot)
}

const harvestCrop = async (bot, block) => {
  log.info('forage', `harvesting ${block.name}`)
  try {
    await bot.collectBlock.collect(block, { ignoreNoPath: true })
  } catch (err) {
    log.debug('forage', `harvest failed: ${err.message}`)
  }
}

const explore = async (bot) => {
  const angle = Math.random() * Math.PI * 2
  const dist = 16 + Math.random() * 16
  const target = bot.entity.position.offset(Math.cos(angle) * dist, 0, Math.sin(angle) * dist)
  log.debug('forage', 'nothing found -- exploring')
  await gotoSafely(bot, goalXZ(Math.round(target.x), Math.round(target.z)))
}

/**
 * Find something to eat.
 *
 * Cheapest source first: food already on the ground, then crops that cost only
 * a walk, then animals, which cost a fight. Each pass runs as one long-lived
 * task; the brain can still yank control away by switching state.
 */
export const forage = {
  name: 'forage',

  async enter(ctx) {
    ctx.bot.pathfinder.setMovements(ctx.movements.work)
    ctx.state.foraging = false
  },

  async tick(ctx) {
    const { bot, state } = ctx
    if (state.foraging) return // a task is already in flight
    if (hasFood(bot)) return // brain will move us on next tick

    state.foraging = true
    state.forageTask = (async () => {
      try {
        if (await collectDrops(bot)) return

        const crop = findCrop(bot)
        if (crop) {
          await harvestCrop(bot, crop)
          return
        }

        const animal = config.huntAnimals ? findAnimal(bot) : null
        if (animal) {
          await huntAnimal(bot, animal)
          return
        }

        await explore(bot)
      } catch (err) {
        log.warn('forage', `task failed: ${err.message}`)
      } finally {
        state.foraging = false
      }
    })()
  },

  async exit(ctx) {
    const { bot, state } = ctx
    state.foraging = false
    if (bot.pvp.target) bot.pvp.stop()
    bot.pathfinder.setGoal(null)
  }
}
