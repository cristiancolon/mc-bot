/**
 * Retreat-safety tests.
 *
 * isStandable() decides where `flee` is allowed to run to. Getting it wrong is
 * how a bot drowns or paths into lava, so the cases here are the ones that
 * actually went wrong rather than a survey of block types.
 *
 *   npm test
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { Vec3 } from 'vec3'

import { isStandable, DANGER_BLOCKS, WATER_BLOCKS } from '../src/lib/safety.js'

const STONE = { name: 'stone', boundingBox: 'block' }
const AIR = { name: 'air', boundingBox: 'empty' }
// Water is 'empty', not 'block' -- this is precisely why it used to pass.
const WATER = { name: 'water', boundingBox: 'empty' }
const LAVA = { name: 'lava', boundingBox: 'empty' }

/**
 * A bot whose world is described bottom-up from y=63: [ground, feet, head].
 * isStandable probes exactly those three, relative to the position asked for.
 */
const botWith = ([ground, feet, head]) => ({
  blockAt: (pos) => ({ 63: ground, 64: feet, 65: head })[pos.y] ?? AIR
})

const POS = new Vec3(0, 64, 0)

test('solid ground with clear air is standable', () => {
  assert.equal(isStandable(botWith([STONE, AIR, AIR]), POS), true)
})

test('water at head height is rejected: standing there drowns the bot', () => {
  // The case that killed it on a real server -- it fled into water and was
  // finished off by a Drowned. Water reports boundingBox 'empty', so every
  // passability check said yes.
  assert.equal(isStandable(botWith([STONE, WATER, WATER]), POS), false)
})

test('water at feet is rejected even with air above', () => {
  // Survivable, but still wrong to retreat into: swimming is slower than the
  // mobs doing the chasing, and Drowned live there.
  assert.equal(isStandable(botWith([STONE, WATER, AIR]), POS), false)
})

test('waterlogged blocks are caught despite not being named water', () => {
  // A waterlogged ladder or sign is passable and submerged, but reports its
  // own name, so the name check alone would miss it.
  const ladder = {
    name: 'ladder',
    boundingBox: 'empty',
    getProperties: () => ({ waterlogged: true })
  }
  assert.equal(isStandable(botWith([STONE, ladder, AIR]), POS), false)
})

test('a dry waterlogged-capable block is still standable', () => {
  const ladder = {
    name: 'ladder',
    boundingBox: 'empty',
    getProperties: () => ({ waterlogged: false })
  }
  assert.equal(isStandable(botWith([STONE, ladder, AIR]), POS), true)
})

test('lava is still rejected', () => {
  assert.equal(isStandable(botWith([STONE, LAVA, AIR]), POS), false)
  assert.equal(isStandable(botWith([LAVA, AIR, AIR]), POS), false)
})

test('a hole with no floor is rejected', () => {
  assert.equal(isStandable(botWith([AIR, AIR, AIR]), POS), false)
})

test('water stays out of DANGER_BLOCKS', () => {
  // DANGER_BLOCKS feeds movements.blocksToAvoid. Adding water there would stop
  // the pathfinder crossing any water at all, which is a different and worse
  // problem than stopping in it.
  for (const name of WATER_BLOCKS) {
    assert.equal(DANGER_BLOCKS.has(name), false, `${name} must not be a DANGER_BLOCK`)
  }
})
