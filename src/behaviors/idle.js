import { config } from '../config.js'
import { gotoSafely, goalNear, goalFollow } from '../lib/nav.js'
import { log } from '../lib/logger.js'

const WANDER_INTERVAL_MS = 15000

/**
 * Nothing is trying to kill us and we are fed. Hold position, follow the owner
 * if asked, and drift back toward home if we have wandered off.
 */
export const idle = {
  name: 'idle',

  async enter(ctx) {
    ctx.bot.pathfinder.setMovements(ctx.movements.work)
    ctx.state.lastWanderAt = Date.now()
  },

  async tick(ctx) {
    const { bot, state } = ctx

    // `follow <player>` from chat wins over everything else in idle.
    if (state.followName) {
      const player = bot.players[state.followName]?.entity
      if (player) {
        const goal = goalFollow(player, 3)
        if (!bot.pathfinder.isMoving()) bot.pathfinder.setGoal(goal, true)
        return
      }
    }

    if (bot.pathfinder.isMoving()) return

    // Drift correction: never stray further than homeRadius from home.
    if (state.home) {
      const distance = bot.entity.position.distanceTo(state.home)
      if (distance > config.homeRadius) {
        log.debug('idle', `returning home (${distance.toFixed(0)}m away)`)
        await gotoSafely(bot, goalNear(state.home, 2))
        return
      }
    }

    // A slow amble keeps chunks loaded and makes the bot look alive.
    const now = Date.now()
    if (now - state.lastWanderAt < WANDER_INTERVAL_MS) return
    state.lastWanderAt = now

    const angle = Math.random() * Math.PI * 2
    const dist = 4 + Math.random() * config.wanderRadius
    const anchor = state.home ?? bot.entity.position
    const target = anchor.offset(Math.cos(angle) * dist, 0, Math.sin(angle) * dist)
    await gotoSafely(bot, goalNear(target, 2))
  },

  async exit(ctx) {
    ctx.bot.pathfinder.setGoal(null)
  }
}
