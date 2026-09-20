import pathfinderPkg from 'mineflayer-pathfinder'
import { findRetreat } from '../lib/safety.js'
import { log } from '../lib/logger.js'

const { goals } = pathfinderPkg

const RETREAT_REFRESH_MS = 1200

/**
 * Run away, and keep running until the coast is genuinely clear.
 *
 * The retreat target is recomputed on a short interval because the threats are
 * moving too -- a destination picked two seconds ago may now be behind a zombie.
 */
export const flee = {
  name: 'flee',

  async enter(ctx) {
    const { bot } = ctx
    bot.pvp?.stop?.()
    bot.pathfinder.setMovements(ctx.movements.escape)
    ctx.state.lastRetreatAt = 0
    const nearest = ctx.snapshot.nearest
    log.warn('flee', `health ${bot.health?.toFixed(1)} | ${ctx.snapshot.threats.length} threat(s)`,
      nearest ? `| nearest ${nearest.name} @ ${nearest.distance.toFixed(1)}m` : '')
  },

  async tick(ctx) {
    const { bot, snapshot, state } = ctx
    const now = Date.now()

    const stale = now - state.lastRetreatAt > RETREAT_REFRESH_MS
    const arrived = !bot.pathfinder.isMoving()
    if (!stale && !arrived) return

    if (snapshot.threats.length === 0) {
      bot.pathfinder.setGoal(null)
      return
    }

    const retreat = findRetreat(bot, snapshot.threats)
    state.lastRetreatAt = now

    if (!retreat) {
      // Cornered: nowhere safe to stand. Face the threat and fight for its life
      // rather than pathing into lava or standing still while it is chewed on.
      log.warn('flee', 'no safe retreat found -- turning to fight')
      state.cornered = true
      return
    }

    state.cornered = false
    bot.pathfinder.setGoal(new goals.GoalNear(retreat.pos.x, retreat.pos.y, retreat.pos.z, 1))
  },

  async exit(ctx) {
    ctx.state.cornered = false
    ctx.bot.pathfinder.setGoal(null)
  }
}
