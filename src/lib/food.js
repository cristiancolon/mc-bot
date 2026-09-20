// Food items the bot should never eat voluntarily.
export const HARMFUL_FOOD = new Set([
  'rotten_flesh', // hunger effect
  'spider_eye', // poison
  'poisonous_potato',
  'pufferfish', // poison + nausea
  'chicken', // raw: 30% food poisoning
  'suspicious_stew',
  'chorus_fruit' // random teleport, ruins pathing
])

// Saved for emergencies rather than spent on routine hunger.
export const EMERGENCY_FOOD = new Set(['golden_apple', 'enchanted_golden_apple', 'golden_carrot'])

/** All edible, non-harmful stacks currently in the inventory. */
export const edibleItems = (bot, { allowEmergency = false, allowHarmful = false } = {}) => {
  const foods = bot.registry.foodsByName
  return bot.inventory.items().filter((item) => {
    const food = foods[item.name]
    if (!food) return false
    if (!allowHarmful && HARMFUL_FOOD.has(item.name)) return false
    if (!allowEmergency && EMERGENCY_FOOD.has(item.name)) return false
    return true
  })
}

/**
 * Pick the best stack to eat right now.
 *
 * Prefers the food that most nearly fills the missing hunger without wasting
 * points -- eating a steak at 18/20 throws most of it away. Ties break toward
 * higher saturation, which is what actually delays the next meal.
 */
export const bestFood = (bot, opts = {}) => {
  const items = edibleItems(bot, opts)
  if (items.length === 0) return null

  const foods = bot.registry.foodsByName
  const missing = 20 - bot.food

  return items
    .map((item) => {
      const food = foods[item.name]
      const waste = Math.max(0, food.foodPoints - missing)
      return { item, waste, saturation: food.saturation, points: food.foodPoints }
    })
    .sort((a, b) => a.waste - b.waste || b.saturation - a.saturation || b.points - a.points)[0].item
}

export const hasFood = (bot, opts = {}) => edibleItems(bot, opts).length > 0

/** Dropped food items lying on the ground within range. */
export const nearbyFoodDrops = (bot, range) => {
  const foods = bot.registry.foodsByName
  const origin = bot.entity.position
  return Object.values(bot.entities)
    .filter((entity) => {
      if (entity.name !== 'item' && entity.objectType !== 'Item') return false
      const stack = entity.metadata?.find?.((m) => m && typeof m === 'object' && 'itemId' in m)
      const id = stack?.itemId ?? entity.metadata?.[8]?.itemId
      if (id === undefined) return false
      const item = bot.registry.items[id]
      return item && foods[item.name] && !HARMFUL_FOOD.has(item.name)
    })
    .map((entity) => ({ entity, distance: entity.position.distanceTo(origin) }))
    .filter((d) => d.distance <= range)
    .sort((a, b) => a.distance - b.distance)
}
