// Best-to-worst melee weapons. Netherite axe out-damages a netherite sword per
// swing, but the sword's faster cooldown wins over a fight, so swords rank first.
const WEAPON_RANK = [
  'netherite_sword',
  'diamond_sword',
  'netherite_axe',
  'diamond_axe',
  'iron_sword',
  'iron_axe',
  'stone_sword',
  'golden_sword',
  'stone_axe',
  'wooden_sword',
  'golden_axe',
  'wooden_axe'
]

export const bestWeapon = (bot) => {
  const items = bot.inventory.items()
  for (const name of WEAPON_RANK) {
    const found = items.find((item) => item.name === name)
    if (found) return found
  }
  return null
}

export const hasWeapon = (bot) => bestWeapon(bot) !== null

export const equipWeapon = async (bot) => {
  const weapon = bestWeapon(bot)
  if (!weapon) return false
  if (bot.heldItem?.name === weapon.name) return true
  try {
    await bot.equip(weapon, 'hand')
    return true
  } catch {
    return false
  }
}
