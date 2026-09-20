/**
 * Arbitration tests.
 *
 * These drive Brain.decide() against a mock bot, so the fight/flee/eat priority
 * rules -- the part that is actually hard to get right -- can be verified
 * without a live server.
 *
 *   npm test
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { Vec3 } from 'vec3'
import mcDataLoader from 'minecraft-data'

import { Brain } from '../src/brain.js'
import { config } from '../src/config.js'
import { scanThreats } from '../src/lib/mobs.js'

const registry = mcDataLoader('1.21.4')

let nextId = 100
const mob = (name, distance, id = nextId++) => ({
  id,
  name,
  type: registry.entitiesByName[name]?.type ?? 'hostile',
  isValid: true,
  position: new Vec3(distance, 64, 0)
})

const makeBot = ({ health = 20, food = 20, entities = [], inventory = [] } = {}) => ({
  health,
  food,
  username: 'TestBot',
  registry,
  entity: { position: new Vec3(0, 64, 0), id: 1 },
  entities: Object.fromEntries(entities.map((e) => [e.id, e])),
  inventory: { items: () => inventory },
  players: {},
  pvp: { target: null, stop() {} },
  pathfinder: { setGoal() {}, setMovements() {}, isMoving: () => false },
  on() {},
  blockAt: () => null
})

/** Build a brain, seed its snapshot the way #tick would, and ask for a decision. */
const decide = (bot, { current = 'idle', cornered = false, clearTicks = 99, aggressors = [] } = {}) => {
  const brain = new Brain(bot, {})
  brain.current = current ? { name: current } : null
  brain.state.cornered = cornered
  brain.clearTicks = clearTicks
  for (const id of aggressors) brain.aggressors.set(id, Date.now() + 10000)
  brain.snapshot = scanThreats(bot, brain.aggressors)
  return brain.decide()
}

const bread = { name: 'bread', count: 3 }
const goldenApple = { name: 'golden_apple', count: 1 }

test('idles when healthy, fed and alone', () => {
  assert.equal(decide(makeBot({ inventory: [bread] })), 'idle')
})

test('fights a single close zombie at full health', () => {
  assert.equal(decide(makeBot({ entities: [mob('zombie', 4)] })), 'fight')
})

test('flees when a pack outnumbers maxEngageTargets', () => {
  const entities = [mob('zombie', 4), mob('zombie', 5), mob('skeleton', 6)]
  assert.ok(entities.length > config.maxEngageTargets)
  assert.equal(decide(makeBot({ entities })), 'flee')
})

test('flees from a close creeper instead of trading hits', () => {
  assert.equal(decide(makeBot({ entities: [mob('creeper', 3)] })), 'flee')
})

test('will not start a fight below fightHealth', () => {
  const bot = makeBot({ health: config.fightHealth - 1, entities: [mob('zombie', 4)] })
  assert.equal(decide(bot), 'flee')
})

test('hysteresis: commits to a fight already in progress, but will not start one', () => {
  // Health sits inside the dead zone between fleeHealth and fightHealth.
  // This is the rule that stops fight/flee oscillation on a threshold boundary.
  const health = (config.fleeHealth + config.fightHealth) / 2

  assert.equal(decide(makeBot({ health, entities: [mob('zombie', 4)] }), { current: 'fight' }), 'fight')
  assert.equal(decide(makeBot({ health, entities: [mob('zombie', 4)] }), { current: 'idle' }), 'flee')
})

test('flees at critical health even against one weak mob', () => {
  const bot = makeBot({ health: config.criticalHealth - 1, entities: [mob('zombie', 4)] })
  assert.equal(decide(bot), 'flee')
})

test('cornered bot fights rather than running nowhere', () => {
  const bot = makeBot({ health: 3, entities: [mob('zombie', 2)] })
  assert.equal(decide(bot, { cornered: true }), 'fight')
})

test('stays in flee until the clear-tick counter is satisfied', () => {
  const bot = () => makeBot({ inventory: [bread] })
  assert.equal(decide(bot(), { current: 'flee', clearTicks: 0 }), 'flee')
  assert.equal(decide(bot(), { current: 'flee', clearTicks: config.fleeClearTicks }), 'idle')
})

test('eats when hungry and safe', () => {
  assert.equal(decide(makeBot({ food: config.eatAt - 1, inventory: [bread] })), 'eat')
})

test('does not stop to eat with a mob on top of us', () => {
  const bot = makeBot({ food: config.eatAt - 1, inventory: [bread], entities: [mob('zombie', 3)] })
  assert.equal(decide(bot), 'fight')
})

test('hunger is ignored while any threat is inside the no-eat bubble', () => {
  // A skeleton hanging back at 8m is too far to fight but too close to stand
  // still and eat in front of.
  const bot = makeBot({
    food: config.eatAt - 1,
    inventory: [bread],
    entities: [mob('skeleton', 5)]
  })
  const result = decide(bot)
  assert.notEqual(result, 'eat')
})

test('forages when hungry with an empty inventory', () => {
  assert.equal(decide(makeBot({ food: config.forageAt - 1, inventory: [] })), 'forage')
})

test('saves golden apples for emergencies', () => {
  const routine = makeBot({ food: config.forageAt - 1, inventory: [goldenApple] })
  assert.equal(decide(routine), 'forage', 'should not burn a golden apple on routine hunger')

  const desperate = makeBot({ food: config.desperateFood - 1, inventory: [goldenApple] })
  assert.equal(decide(desperate), 'eat', 'should eat it when starving')
})

test('neutral mobs are ignored until they attack', () => {
  const enderman = mob('enderman', 4)
  assert.equal(decide(makeBot({ entities: [enderman] })), 'idle')
  assert.equal(
    decide(makeBot({ entities: [enderman] }), { aggressors: [enderman.id] }),
    'fight',
    'once it hits us it becomes a target'
  )
})

test('an in-progress meal is not interrupted by low-priority states', () => {
  const brain = new Brain(makeBot({ food: 20, inventory: [bread] }), {})
  brain.current = { name: 'eat' }
  brain.snapshot = { threats: [], score: 0, nearest: null, creeperClose: false }
  brain.state.eating = true
  assert.equal(brain.decide(), 'eat')
})

test('threat score rises as mobs close in', () => {
  const far = scanThreats(makeBot({ entities: [mob('zombie', 15)] }), new Map())
  const near = scanThreats(makeBot({ entities: [mob('zombie', 3)] }), new Map())
  assert.ok(near.score > far.score, 'a closer mob must score as more dangerous')
})
