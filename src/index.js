import mineflayer from 'mineflayer'
import pathfinderPkg from 'mineflayer-pathfinder'
import pvpPkg from 'mineflayer-pvp'
import collectBlockPkg from 'mineflayer-collectblock'
import armorManager from 'mineflayer-armor-manager'
import { loader as autoEat } from 'mineflayer-auto-eat'

import { config } from './config.js'
import { log } from './lib/logger.js'
import { buildMovements } from './movements.js'
import { registerCommands } from './commands.js'
import { Brain } from './brain.js'

// These plugins are CommonJS; ESM can only take their default export.
const { pathfinder } = pathfinderPkg
const pvp = pvpPkg.plugin ?? pvpPkg
const collectBlock = collectBlockPkg.plugin ?? collectBlockPkg

let reconnectDelay = config.reconnectDelayMs
let shuttingDown = false

/**
 * Realms are joined by id/name through the Realms API rather than host:port,
 * and only with a Microsoft account that owns or was invited to the Realm.
 */
const realmsOption = () => {
  if (config.realmId) return { realmId: config.realmId }
  if (!config.realmName) return null

  const wanted = config.realmName.toLowerCase()
  return {
    pickRealm: (realms) => {
      const match = realms.find((r) => (r.name ?? '').toLowerCase().includes(wanted))
      if (!match) {
        const available = realms.map((r) => `"${r.name}" (id ${r.id})`).join(', ') || 'none'
        throw new Error(`No Realm matching "${config.realmName}". Available: ${available}`)
      }
      log.info('boot', `selected Realm "${match.name}" (id ${match.id})`)
      return match
    }
  }
}

const createBot = () => {
  const realms = realmsOption()

  if (realms && config.auth !== 'microsoft') {
    log.error('boot', 'Realms require MC_AUTH=microsoft. Set it in .env and restart.')
    process.exit(1)
  }

  if (realms) {
    log.info('boot', `joining Realm ${config.realmId || `"${config.realmName}"`} as ${config.username}`)
  } else {
    log.info('boot', `connecting to ${config.host}:${config.port} as ${config.username} (auth: ${config.auth})`)
  }

  const bot = mineflayer.createBot({
    username: config.username,
    auth: config.auth,
    profilesFolder: config.profilesFolder,
    // Printed once on first login; the token is cached afterwards.
    onMsaCode: (data) => {
      log.warn('auth', `Sign in at ${data.verification_uri} with code ${data.user_code}`)
    },
    ...(realms
      ? { realms }
      : {
          host: config.host,
          port: config.port,
          // Realms pick their own version; only pin it for a normal server.
          ...(config.version ? { version: config.version } : {})
        })
  })

  bot.loadPlugin(pathfinder)
  bot.loadPlugin(pvp)
  bot.loadPlugin(collectBlock)
  bot.loadPlugin(armorManager)
  bot.loadPlugin(autoEat)

  let brain = null

  bot.once('spawn', async () => {
    log.info('boot', `spawned as ${bot.username} on ${bot.version}`)
    reconnectDelay = config.reconnectDelayMs // successful join resets backoff

    // autoEat's own timer is switched off on purpose. The brain decides when it
    // is safe to stand still and chew; otherwise the bot eats mid-creeper.
    bot.autoEat.disableAuto()
    bot.autoEat.setOpts({ bannedFood: ['rotten_flesh', 'pufferfish', 'chorus_fruit', 'poisonous_potato', 'spider_eye', 'suspicious_stew'] })

    const movements = buildMovements(bot)
    bot.pathfinder.setMovements(movements.work)

    brain = new Brain(bot, movements)
    brain.state.home = bot.entity.position.clone()
    brain.start()

    registerCommands(bot, brain)

    if (config.viewer) {
      try {
        const { mineflayer: viewer } = await import('prismarine-viewer')
        viewer(bot, { port: config.viewerPort, firstPerson: true })
        log.info('boot', `viewer at http://localhost:${config.viewerPort}`)
      } catch (err) {
        log.warn('boot', `viewer unavailable (npm i prismarine-viewer): ${err.message}`)
      }
    }

    bot.on('death', () => {
      log.warn('bot', 'died -- respawning')
      brain?.stop()
    })

    bot.on('respawn', () => {
      if (!brain?.running) {
        setTimeout(() => {
          bot.pathfinder.setMovements(movements.work)
          brain.start()
        }, 1000)
      }
    })
  })

  bot.on('kicked', (reason) => log.warn('bot', `kicked: ${typeof reason === 'string' ? reason : JSON.stringify(reason)}`))
  bot.on('error', (err) => log.error('bot', err.message))

  bot.on('end', (reason) => {
    brain?.stop()
    if (shuttingDown || !config.reconnect) return
    log.warn('bot', `disconnected (${reason}). Reconnecting in ${reconnectDelay / 1000}s`)
    setTimeout(createBot, reconnectDelay)
    // Exponential backoff so a down server is not hammered.
    reconnectDelay = Math.min(reconnectDelay * 2, config.maxReconnectDelayMs)
  })

  const shutdown = () => {
    shuttingDown = true
    log.info('boot', 'shutting down')
    brain?.stop()
    bot.quit('shutting down')
    setTimeout(() => process.exit(0), 500)
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)

  return bot
}

createBot()
