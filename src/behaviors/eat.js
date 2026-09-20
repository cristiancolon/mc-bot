import { bestFood } from '../lib/food.js'
import { log } from '../lib/logger.js'

/**
 * Eat one item, then hand control back.
 *
 * Eating is driven manually rather than through autoEat's own timer: the brain
 * decides *when* it is safe to stand still for 1.6 seconds, which is the whole
 * point of having arbitration.
 */
export const eat = {
  name: 'eat',

  async enter(ctx) {
    const { bot, state } = ctx
    bot.pathfinder.setGoal(null)
    state.eating = true

    // At critical hunger, the golden apple stash stops being precious.
    const desperate = bot.food <= ctx.config.desperateFood
    const item = bestFood(bot, { allowEmergency: desperate })

    if (!item) {
      state.eating = false
      return
    }

    try {
      log.info('eat', `eating ${item.name} (food ${bot.food}/20)`)
      await bot.autoEat.eat({ food: item, equipOldItem: true })
      log.info('eat', `done (food ${bot.food}/20)`)
    } catch (err) {
      log.warn('eat', `failed: ${err.message}`)
    } finally {
      state.eating = false
    }
  },

  async tick() {
    // enter() owns the whole action; the brain leaves this state once
    // state.eating clears.
  },

  async exit(ctx) {
    ctx.state.eating = false
    ctx.bot.autoEat.cancelEat?.()
  }
}
