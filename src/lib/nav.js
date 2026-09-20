import pathfinderPkg from 'mineflayer-pathfinder'

const { goals } = pathfinderPkg

/**
 * pathfinder rejects the in-flight goto() whenever the goal is replaced, which
 * is routine here -- the brain retargets constantly. Swallow those so a normal
 * change of mind never surfaces as an unhandled rejection.
 */
export const gotoSafely = async (bot, goal) => {
  try {
    await bot.pathfinder.goto(goal)
    return true
  } catch (err) {
    const message = err?.message ?? ''
    if (/GoalChanged|PathStopped|goal.*changed|Took to long|No path/i.test(message)) return false
    throw err
  }
}

export const goalNear = (pos, range = 1) => new goals.GoalNear(pos.x, pos.y, pos.z, range)
export const goalFollow = (entity, range = 2) => new goals.GoalFollow(entity, range)
export const goalXZ = (x, z) => new goals.GoalXZ(x, z)
export { goals }
