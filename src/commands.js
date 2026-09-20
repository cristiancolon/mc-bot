import { config } from './config.js'
import { gotoSafely, goalNear } from './lib/nav.js'
import { log } from './lib/logger.js'

const HELP = [
  'come - walk to you',
  'follow / stop follow - trail you',
  'stop - drop what I am doing',
  'status - health, hunger, threats',
  'home [set] - go home / set home here',
  'inv - list inventory',
  'say <msg> - repeat a message'
].join(' | ')

/**
 * Chat control. Wired to whispers and public chat; if MC_OWNER is set, only
 * that player is obeyed.
 */
export const registerCommands = (bot, brain) => {
  const reply = (to, message) => {
    if (to) bot.whisper(to, message)
    else bot.chat(message)
  }

  const handle = async (username, message, whisper) => {
    if (username === bot.username) return
    if (config.owner && username !== config.owner) return

    const [command, ...rest] = message.trim().toLowerCase().split(/\s+/)
    const arg = rest.join(' ')
    const to = whisper ? username : null

    switch (command) {
      case 'help':
        reply(to, HELP)
        break

      case 'status':
        reply(to, brain.status())
        break

      case 'come': {
        const player = bot.players[username]?.entity
        if (!player) return reply(to, 'I cannot see you.')
        reply(to, 'On my way.')
        await gotoSafely(bot, goalNear(player.position, 2))
        break
      }

      case 'follow':
        brain.state.followName = username
        reply(to, `Following ${username}.`)
        break

      case 'stop':
        if (arg === 'follow') {
          brain.state.followName = null
          reply(to, 'Stopped following.')
        } else {
          brain.state.followName = null
          bot.pathfinder.setGoal(null)
          bot.pvp.stop()
          reply(to, 'Stopped.')
        }
        break

      case 'home': {
        if (arg === 'set') {
          brain.state.home = bot.entity.position.clone()
          const p = brain.state.home
          return reply(to, `Home set to ${p.x.toFixed(0)}, ${p.y.toFixed(0)}, ${p.z.toFixed(0)}.`)
        }
        if (!brain.state.home) return reply(to, 'No home set. Say "home set".')
        reply(to, 'Heading home.')
        await gotoSafely(bot, goalNear(brain.state.home, 2))
        break
      }

      case 'inv': {
        const items = bot.inventory.items()
        reply(to, items.length ? items.map((i) => `${i.name} x${i.count}`).join(', ') : 'Empty.')
        break
      }

      case 'say':
        if (arg) bot.chat(arg)
        break

      default:
        break
    }
  }

  bot.on('chat', (username, message) => {
    handle(username, message, false).catch((err) => log.warn('cmd', err.message))
  })
  bot.on('whisper', (username, message) => {
    handle(username, message, true).catch((err) => log.warn('cmd', err.message))
  })
}
