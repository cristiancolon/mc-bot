import { config } from '../config.js'
import { AVOID_MELEE } from '../lib/mobs.js'
import { equipWeapon } from '../lib/combat.js'
import { log } from '../lib/logger.js'

/**
 * Pick what to hit.
 *
 * Nearest-first, but creepers and other blast/ranged mobs are skipped unless
 * explicitly enabled -- trading hits with a creeper loses that trade.
 */
const pickTarget = (snapshot) => {
  const meleeable = snapshot.threats.filter((t) => {
    if (!AVOID_MELEE.has(t.name)) return true
    return t.name === 'creeper' && config.engageCreepers
  })
  return (meleeable[0] ?? null)
}

export const fight = {
  name: 'fight',

  async enter(ctx) {
    const { bot } = ctx
    bot.pathfinder.setMovements(ctx.movements.combat)
    await equipWeapon(bot)
    ctx.state.target = null
  },

  async tick(ctx) {
    const { bot, snapshot, state } = ctx
    const chosen = pickTarget(snapshot)

    if (!chosen) {
      if (bot.pvp.target) bot.pvp.stop()
      state.target = null
      return
    }

    const current = bot.pvp.target
    // Only re-issue the attack when the target actually changes; calling
    // attack() every tick resets pvp's swing timing and the bot stops hitting.
    if (current && current.id === chosen.entity.id && current.isValid) return

    state.target = chosen.entity.id
    log.info('fight', `engaging ${chosen.name} @ ${chosen.distance.toFixed(1)}m`)
    await equipWeapon(bot)
    bot.pvp.attack(chosen.entity)
  },

  async exit(ctx) {
    const { bot } = ctx
    if (bot.pvp.target) bot.pvp.stop()
    ctx.state.target = null
    bot.pathfinder.setGoal(null)
  }
}

export const canFight = (bot, snapshot) => {
  if (snapshot.threats.length === 0) return false
  if (snapshot.threats.length > config.maxEngageTargets) return false
  if (snapshot.creeperClose && !config.engageCreepers) return false
  const target = pickTarget(snapshot)
  if (!target) return false
  return target.distance <= config.engageRange
}
