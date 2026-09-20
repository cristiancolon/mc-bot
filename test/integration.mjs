/**
 * End-to-end check against a real Minecraft server.
 *
 * Boots flying-squid (a JavaScript server -- no Java needed), connects the bot
 * to it, then injects hostile entities to prove the brain actually transitions
 * between states against a live protocol connection.
 *
 *   npm run test:integration
 */
import squid from 'flying-squid'
import mineflayer from 'mineflayer'
import pathfinderPkg from 'mineflayer-pathfinder'
import pvpPkg from 'mineflayer-pvp'
import collectBlockPkg from 'mineflayer-collectblock'
import armorManager from 'mineflayer-armor-manager'
import { loader as autoEat } from 'mineflayer-auto-eat'
import { Vec3 } from 'vec3'

import { buildMovements } from '../src/movements.js'
import { Brain } from '../src/brain.js'

const { pathfinder } = pathfinderPkg
const pvp = pvpPkg.plugin ?? pvpPkg
const collectBlock = collectBlockPkg.plugin ?? collectBlockPkg

const PORT = 25599
const VERSION = '1.21.4'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const results = []
const check = (label, actual, expected) => {
  const ok = actual === expected
  results.push(ok)
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label} (got "${actual}", expected "${expected}")`)
}

console.log(`Starting test server on :${PORT} (${VERSION})...`)
const server = squid.createMCServer({
  motd: 'integration test',
  port: PORT,
  'max-players': 5,
  'online-mode': false,
  gameMode: 0,
  difficulty: 2,
  worldFolder: null,
  generation: { name: 'diamond_square', options: { worldHeight: 80 } },
  kickTimeout: 30000,
  plugins: {},
  modpe: false,
  'view-distance': 4,
  'player-list-text': { header: '', footer: '' },
  'everybody-op': true,
  'max-entities': 100,
  version: VERSION
})

await new Promise((resolve) => server.on('listening', resolve))
console.log('Server ready.\n')

const bot = mineflayer.createBot({
  host: 'localhost',
  port: PORT,
  username: 'BrainTest',
  auth: 'offline',
  version: VERSION
})
for (const plugin of [pathfinder, pvp, collectBlock, armorManager, autoEat]) bot.loadPlugin(plugin)
bot.on('error', (err) => console.log('bot error:', err.message))

await new Promise((resolve) => bot.once('spawn', resolve))
console.log('Bot spawned.\n')

bot.autoEat.disableAuto()
const brain = new Brain(bot, buildMovements(bot))
brain.start()

let fakeId = 9000
const spawnMob = (name, distance) => {
  const id = fakeId++
  bot.entities[id] = {
    id,
    name,
    type: 'hostile',
    isValid: true,
    position: bot.entity.position.plus(new Vec3(distance, 0, 0))
  }
  return id
}
const despawn = (id) => delete bot.entities[id]

await wait(2500)
check('starts idle when alone and healthy', brain.current?.name, 'idle')

const z1 = spawnMob('zombie', 4)
await wait(3000)
check('engages a single zombie', brain.current?.name, 'fight')

const z2 = spawnMob('zombie', 5)
const z3 = spawnMob('skeleton', 6)
await wait(3500)
check('disengages when outnumbered', brain.current?.name, 'flee')

despawn(z1)
despawn(z2)
despawn(z3)
await wait(5000)
check('returns to idle once clear', brain.current?.name, 'idle')

const creeper = spawnMob('creeper', 3)
await wait(3000)
check('avoids a creeper instead of meleeing it', brain.current?.name, 'flee')
despawn(creeper)

const passed = results.filter(Boolean).length
console.log(`\n${passed}/${results.length} integration checks passed.`)
brain.stop()
bot.quit()
process.exit(passed === results.length ? 0 : 1)
