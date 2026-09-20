import { config } from './config.js'
import { scanThreats, isHostileType, mobName, NEUTRAL } from './lib/mobs.js'
import { hasFood } from './lib/food.js'
import { log } from './lib/logger.js'

import { flee } from './behaviors/flee.js'
import { fight, canFight } from './behaviors/fight.js'
import { eat } from './behaviors/eat.js'
import { forage } from './behaviors/forage.js'
import { idle } from './behaviors/idle.js'

const BEHAVIORS = { flee, fight, eat, forage, idle }

// Higher wins. A jump *up* this ladder is an escalation and may interrupt the
// current state immediately; a step down has to wait out the dwell timer.
const PRIORITY = { idle: 0, forage: 1, eat: 2, fight: 3, flee: 4 }

const AGGRO_TTL_MS = 30000

export class Brain {
  constructor(bot, movements) {
    this.bot = bot
    this.movements = movements
    this.current = null
    this.enteredAt = 0
    this.running = false
    this.timer = null
    this.clearTicks = 0
    this.aggressors = new Map() // entityId -> expiry, for neutral mobs that hit us
    this.state = { home: null, followName: null }
    this.snapshot = { threats: [], score: 0, nearest: null, creeperClose: false }
    this.lastHealth = bot.health ?? 20
  }

  get ctx() {
    return {
      bot: this.bot,
      config,
      state: this.state,
      snapshot: this.snapshot,
      movements: this.movements
    }
  }

  start() {
    if (this.running) return
    this.running = true
    this.bot.on('health', () => this.#noteDamage())
    this.timer = setInterval(() => this.#tick(), config.tickMs)
    log.info('brain', 'started')
  }

  stop() {
    this.running = false
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  /**
   * Neutral mobs (endermen, wolves, spiders in daylight) only become threats
   * once they actually hit us. There is no clean "is angry at me" flag, so
   * attribute each hit to the nearest capable mob and remember it for a while.
   */
  #noteDamage() {
    const health = this.bot.health ?? 20
    if (health >= this.lastHealth) {
      this.lastHealth = health
      return
    }
    this.lastHealth = health

    const origin = this.bot.entity.position
    const culprit = Object.values(this.bot.entities)
      .filter((e) => isHostileType(e) && NEUTRAL.has(mobName(e)))
      .map((e) => ({ e, d: e.position.distanceTo(origin) }))
      .filter((x) => x.d <= 6)
      .sort((a, b) => a.d - b.d)[0]

    if (culprit) {
      log.info('brain', `${mobName(culprit.e)} turned hostile`)
      this.aggressors.set(culprit.e.id, Date.now() + AGGRO_TTL_MS)
    }
  }

  #pruneAggressors() {
    const now = Date.now()
    for (const [id, expiry] of this.aggressors) {
      if (expiry < now || !this.bot.entities[id]) this.aggressors.delete(id)
    }
  }

  /**
   * Choose the state the bot *should* be in, ignoring transition rules.
   * Survival first, then hunger, then busywork.
   */
  decide() {
    const { bot, snapshot } = this
    const health = bot.health ?? 20
    const food = bot.food ?? 20
    const inFight = this.current?.name === 'fight'
    const inFlee = this.current?.name === 'flee'
    const threatened = snapshot.threats.length > 0

    // --- survival ---
    if (threatened) {
      // Checked before the critical-health bail-out on purpose: if findRetreat
      // came back empty there is nowhere to run, and fleeing would mean standing
      // still while being hit. Fighting back is strictly better than a deadlock.
      if (this.state.cornered) return 'fight'

      if (health <= config.criticalHealth) return 'flee'

      const outmatched =
        snapshot.threats.length > config.maxEngageTargets ||
        (snapshot.creeperClose && !config.engageCreepers)

      // The hysteresis band. Committing to a fight at 12 HP but only bailing at
      // 8 leaves a 4-point dead zone, so a single hit cannot flip the decision.
      const tooHurt = inFight ? health < config.fleeHealth : health < config.fightHealth

      if (outmatched || tooHurt) return 'flee'
      if (canFight(bot, snapshot)) return 'fight'
      if (inFlee) return 'flee' // threats still around: finish disengaging
    }

    if (inFlee && this.clearTicks < config.fleeClearTicks) return 'flee'

    // --- an eat already in progress finishes before anything else ---
    if (this.state.eating) return 'eat'

    // --- hunger ---
    // Standing still to eat is only safe with nothing breathing down our neck.
    const safeToEat = !snapshot.nearest || snapshot.nearest.distance > 6
    if (food <= config.eatAt && safeToEat) {
      const desperate = food <= config.desperateFood
      if (hasFood(bot, { allowEmergency: desperate })) return 'eat'
    }
    if (food <= config.forageAt && !hasFood(bot)) return 'forage'

    return 'idle'
  }

  async #tick() {
    const bot = this.bot
    if (!this.running || !bot.entity) return

    try {
      this.#pruneAggressors()
      this.snapshot = scanThreats(bot, this.aggressors)

      // Count consecutive ticks with nothing dangerous inside safeRadius.
      const clear = !this.snapshot.threats.some((t) => t.distance <= config.safeRadius)
      this.clearTicks = clear ? this.clearTicks + 1 : 0

      const desired = this.decide()
      await this.#applyTransition(desired)
      await this.current?.tick?.(this.ctx)
    } catch (err) {
      log.error('brain', `tick failed: ${err.stack ?? err.message}`)
    }
  }

  async #applyTransition(desiredName) {
    if (this.current?.name === desiredName) return

    const next = BEHAVIORS[desiredName]
    if (!next) return

    const currentPriority = PRIORITY[this.current?.name] ?? -1
    const nextPriority = PRIORITY[desiredName]
    const escalating = nextPriority > currentPriority
    const dwelled = Date.now() - this.enteredAt >= config.minDwellMs

    // Dropping to a calmer state has to wait out the dwell timer. This is what
    // stops fight/flee oscillation when a mob hovers on a threshold boundary.
    if (!escalating && !dwelled) return

    const previous = this.current
    if (previous) {
      try {
        await previous.exit?.(this.ctx)
      } catch (err) {
        log.warn('brain', `exit(${previous.name}) failed: ${err.message}`)
      }
    }

    this.current = next
    this.enteredAt = Date.now()
    log.info('brain', `${previous?.name ?? 'none'} -> ${desiredName}`)

    // enter() is deliberately not awaited: some behaviors (eat, forage) run long
    // actions there, and the brain must stay responsive enough to escalate.
    Promise.resolve(next.enter?.(this.ctx)).catch((err) =>
      log.warn('brain', `enter(${desiredName}) failed: ${err.message}`)
    )
  }

  status() {
    const bot = this.bot
    const pos = bot.entity?.position
    return [
      `state=${this.current?.name ?? 'none'}`,
      `hp=${(bot.health ?? 0).toFixed(1)}/20`,
      `food=${bot.food ?? 0}/20`,
      `threats=${this.snapshot.threats.length}${this.snapshot.nearest ? ` (${this.snapshot.nearest.name} ${this.snapshot.nearest.distance.toFixed(1)}m)` : ''}`,
      `food_items=${hasFood(bot) ? 'yes' : 'no'}`,
      pos ? `pos=${pos.x.toFixed(0)},${pos.y.toFixed(0)},${pos.z.toFixed(0)}` : ''
    ]
      .filter(Boolean)
      .join(' | ')
  }
}
