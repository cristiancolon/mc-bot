import pathfinderPkg from 'mineflayer-pathfinder'
import { DANGER_BLOCKS } from './lib/safety.js'

const { Movements } = pathfinderPkg

const avoidDangerBlocks = (bot, movements) => {
  for (const name of DANGER_BLOCKS) {
    const block = bot.registry.blocksByName[name]
    if (block) movements.blocksToAvoid.add(block.id)
  }
}

/**
 * Three movement profiles, because "how should I walk" depends entirely on why
 * we are walking. Escaping should never stop to mine; foraging should.
 */
export const buildMovements = (bot) => {
  const escape = new Movements(bot)
  escape.canDig = false // never stop to mine with something chasing us
  escape.allow1by1towers = false
  escape.allowParkour = true
  escape.allowSprinting = true
  escape.liquidCost = 8 // swimming is slow and we cannot fight in water
  escape.maxDropDown = 3 // a 4-block drop plus a mob hit is a death
  escape.dontCreateFlow = true
  avoidDangerBlocks(bot, escape)

  const combat = new Movements(bot)
  combat.canDig = false
  combat.allow1by1towers = false
  combat.allowSprinting = true
  combat.liquidCost = 12
  combat.maxDropDown = 2
  avoidDangerBlocks(bot, combat)

  const work = new Movements(bot)
  work.canDig = true
  work.allowParkour = true
  work.allowSprinting = true
  work.maxDropDown = 3
  avoidDangerBlocks(bot, work)

  return { escape, combat, work }
}
