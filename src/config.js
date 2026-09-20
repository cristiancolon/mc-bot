import 'dotenv/config'

const num = (v, d) => (v === undefined || v === '' ? d : Number(v))
const bool = (v, d) => (v === undefined || v === '' ? d : /^(1|true|yes|on)$/i.test(v))

export const config = {
  // ---- connection ----
  host: process.env.MC_HOST || 'localhost',
  port: num(process.env.MC_PORT, 25565),
  username: process.env.MC_USERNAME || 'Survivor',
  // 'offline' for a local server with online-mode=false, 'microsoft' for a real account
  auth: process.env.MC_AUTH || 'offline',
  // Pin this when the server is newer than mineflayer supports; false = auto-detect
  version: process.env.MC_VERSION || false,
  // Player the bot obeys and follows. Empty = obey anyone.
  owner: process.env.MC_OWNER || '',

  // ---- Realms ----
  // Set either of these to join a Minecraft Realm instead of host/port.
  // Realms require auth: 'microsoft'; host, port and version are ignored.
  realmId: process.env.MC_REALM_ID || '',
  realmName: process.env.MC_REALM_NAME || '',
  // Where the Microsoft login token is cached, so the device-code flow only
  // has to be completed once.
  profilesFolder: process.env.MC_PROFILES_FOLDER || './.minecraft-auth',

  // ---- brain ----
  tickMs: num(process.env.TICK_MS, 200),
  // A state must run this long before a lower-priority state may replace it.
  // Escalation to `flee` always bypasses this.
  minDwellMs: num(process.env.MIN_DWELL_MS, 1500),

  // ---- threat detection ----
  detectRange: num(process.env.DETECT_RANGE, 16), // scan radius for hostiles
  safeRadius: num(process.env.SAFE_RADIUS, 14), // must be clear of threats to stop fleeing
  engageRange: num(process.env.ENGAGE_RANGE, 10), // start a fight inside this
  fleeClearTicks: num(process.env.FLEE_CLEAR_TICKS, 6), // consecutive calm ticks before leaving flee

  // ---- health arbitration (the hysteresis band) ----
  // Health is 0-20. fleeHealth < fightHealth creates a dead zone that stops
  // the bot oscillating between attacking and running at a single threshold.
  fleeHealth: num(process.env.FLEE_HEALTH, 8), // drop below this mid-fight -> disengage
  fightHealth: num(process.env.FIGHT_HEALTH, 12), // must be above this to start/resume a fight
  criticalHealth: num(process.env.CRITICAL_HEALTH, 5), // always run, no matter what

  // A single mob is manageable; a pack is not. Above this, retreat.
  maxEngageTargets: num(process.env.MAX_ENGAGE_TARGETS, 2),
  // Creepers are a losing melee trade without careful timing. Off = keep away.
  engageCreepers: bool(process.env.ENGAGE_CREEPERS, false),
  creeperSafeDistance: num(process.env.CREEPER_SAFE_DISTANCE, 6),
  requireWeaponToFight: bool(process.env.REQUIRE_WEAPON, false),

  // ---- hunger (food is 0-20) ----
  eatAt: num(process.env.EAT_AT, 16), // eat when food drops to/below this
  forageAt: num(process.env.FORAGE_AT, 14), // go find food when below this and inventory is empty
  // Below this, eat even while fighting -- starvation is the bigger threat.
  desperateFood: num(process.env.DESPERATE_FOOD, 4),

  // ---- foraging ----
  forageRange: num(process.env.FORAGE_RANGE, 48),
  huntAnimals: bool(process.env.HUNT_ANIMALS, true),

  // ---- idle ----
  // Bot returns here when there is nothing to do. Set via `home` chat command.
  wanderRadius: num(process.env.WANDER_RADIUS, 24),
  homeRadius: num(process.env.HOME_RADIUS, 32), // never drift further than this from home

  // ---- misc ----
  viewer: bool(process.env.VIEWER, false),
  viewerPort: num(process.env.VIEWER_PORT, 3007),
  logLevel: process.env.LOG_LEVEL || 'info',
  reconnect: bool(process.env.RECONNECT, true),
  reconnectDelayMs: num(process.env.RECONNECT_DELAY_MS, 5000),
  maxReconnectDelayMs: num(process.env.MAX_RECONNECT_DELAY_MS, 60000)
}
