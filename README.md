# mc-bot

A Minecraft Java survival bot. It joins your world as a **genuine second player** over the
network protocol — not a mod, not a macro driving your own character — and tries to stay
alive: avoiding or killing hostile mobs, and feeding itself.

Built on [Mineflayer](https://github.com/PrismarineJS/mineflayer).

---

## Quick start

```bash
npm install
cp .env.example .env      # edit host/port/username
npm start
```

Then in-game, type `status` in chat and the bot will answer.

---

## Getting it into your world

A single-player world isn't reachable over the network, so the bot needs a server to join.

### Option A — Open to LAN (fastest, needs a second account)

1. Pause your game → **Open to LAN** → note the port it prints.
2. Set `MC_PORT` to that port and `MC_AUTH=microsoft`.
3. `npm start`, then complete the device-code login once.

LAN worlds always run in online mode, so the bot needs its own separately-paid Microsoft
account. It cannot share yours — you'd be kicked.

### Option B — Local dedicated server (recommended)

1. Copy your world folder into a Paper or vanilla server directory.
2. In `server.properties`, set `online-mode=false`.
3. Leave `MC_AUTH=offline`. Both you and the bot connect to `localhost:25565`.

No second account needed, and the bot can stay logged in keeping chunks ticking while
you're offline.

> **Only do this on a machine that isn't exposed to the internet.** `online-mode=false`
> means anyone who can reach the port can log in as any username, including yours.

> **Heads up:** modern Minecraft servers need **Java 21+**. Check yours with `java -version`,
> and install a newer JDK if needed (`brew install openjdk@21` on macOS) before Option B works.

---

## Version compatibility

Verified against the installed packages — `mineflayer@4.39.0` supports up to and including
**26.1**.

Re-check at any time:

```bash
node -e "console.log(require('minecraft-protocol').supportedVersions.join(', '))"
```

If your client is newer than the highest supported version, either run the server at a
supported version, or run Paper with **ViaVersion/ViaBackwards** so the bot can join on an
older protocol while you play on the current client. Pin the bot's protocol with
`MC_VERSION=` when auto-detection guesses wrong.

---

## Chat commands

Say these in public chat or whisper them. Set `MC_OWNER` to restrict who's obeyed.

| Command | Effect |
|---|---|
| `help` | List commands |
| `status` | Health, hunger, current state, nearest threat |
| `come` | Walk to you |
| `follow` / `stop follow` | Trail you at 3 blocks |
| `stop` | Drop everything and stand down |
| `home set` / `home` | Set home to current spot / walk back to it |
| `inv` | List inventory |
| `say <msg>` | Repeat a message |

---

## How it decides what to do

The actions are the easy part; plugins provide them. The hard part is **arbitration** —
not flip-flopping between fight and flee, not pathing into lava while retreating, and
handling "no food in inventory" without spinning.

`src/brain.js` runs a priority ladder every 200 ms:

```
flee (4)  >  fight (3)  >  eat (2)  >  forage (1)  >  idle (0)
```

Four rules keep it stable:

**1. A hysteresis band on health.** The bot commits to a fight at `FIGHT_HEALTH` (12) but
only bails at `FLEE_HEALTH` (8). That 4-point dead zone means a single hit can't flip the
decision. Without it, a bot sitting at exactly the threshold oscillates every tick and
does neither thing.

**2. Escalation bypasses the dwell timer, de-escalation doesn't.** Moving *up* the ladder
is immediate — a creeper appearing mid-meal interrupts instantly. Moving *down* has to
wait out `MIN_DWELL_MS`, so the bot can't twitch back to `idle` the moment a zombie steps
one block out of range.

**3. Fleeing ends on a counter, not a single clean tick.** The bot leaves `flee` only after
`FLEE_CLEAR_TICKS` consecutive ticks with nothing inside `SAFE_RADIUS`.

**4. Retreat targets are sampled, not computed.** Sprinting along the reverse threat vector
is how bots end up in lava or off a cliff. `src/lib/safety.js` instead samples a ring of
candidate positions, discards any that aren't safe to stand in (checking the block below,
at, and above, plus a hazard shell), and scores the survivors on distance gained from the
threat centroid. If nothing is safe, the bot sets `cornered` and turns to fight rather than
standing still — checked *before* the low-health bail-out, since running nowhere is worse
than swinging back.

Other deliberate choices:

- **autoEat's own timer is switched off.** Eating locks you still for ~1.6 s, so the brain
  decides when that's safe rather than letting a timer do it mid-creeper. It won't eat with
  anything inside 6 blocks.
- **Neutral mobs are left alone** until they actually hit you. Endermen, wolves, and
  daylight spiders are flagged hostile in the game data but only retaliate; attacking on
  sight starts fights you didn't need. A health drop attributes the hit to the nearest
  capable mob for 30 s.
- **Creepers are avoided, not fought** (`ENGAGE_CREEPERS=false`). Trading melee hits with a
  creeper loses that trade.
- **Golden apples are saved** for `DESPERATE_FOOD` and below, never spent on routine hunger.
- **Three movement profiles.** Escaping never stops to mine and caps drops at 3 blocks;
  foraging is allowed to dig. All three treat lava, fire, cactus, magma, and powder snow as
  blocks to avoid.

Foraging works cheapest-source-first: food already on the ground → ripe crops and berry
bushes → hunting an animal → wandering to explore.

---

## Tuning

Everything lives in `.env` (see `.env.example`). Health and food are both 0–20.

| Variable | Default | Meaning |
|---|---|---|
| `FIGHT_HEALTH` | 12 | Must be above this to *start* a fight |
| `FLEE_HEALTH` | 8 | Drop below this mid-fight to disengage |
| `CRITICAL_HEALTH` | 5 | Always run |
| `MAX_ENGAGE_TARGETS` | 2 | More threats than this → retreat |
| `ENGAGE_CREEPERS` | false | Melee creepers |
| `EAT_AT` | 16 | Eat at or below this hunger |
| `FORAGE_AT` | 14 | Go find food if inventory is empty |
| `DESPERATE_FOOD` | 4 | Unlock golden apples |
| `DETECT_RANGE` | 16 | Threat scan radius |
| `MIN_DWELL_MS` | 1500 | Minimum time before de-escalating |

---

## Tests

```bash
npm test              # arbitration logic against a mock bot -- fast, no server
npm run test:integration   # boots a JS Minecraft server and connects for real
```

The unit tests cover the priority rules directly: the hysteresis band, creeper avoidance,
the cornered-fallback, golden-apple rationing, and neutral-mob aggro. The integration test
starts [flying-squid](https://github.com/PrismarineJS/flying-squid) — a Minecraft server
written in JavaScript, so **no Java is required** — connects the bot over a real protocol
connection, and injects hostile entities to confirm the state transitions fire.

---

## Watching it

```bash
npm i prismarine-viewer
npm run viewer        # then open http://localhost:3007
```

---

## Project layout

```
src/
  index.js        entry: connect, load plugins, reconnect with backoff
  brain.js        priority arbitration -- the decision logic
  movements.js    escape / combat / work pathfinding profiles
  commands.js     chat commands
  behaviors/      flee, fight, eat, forage, idle
  lib/            mob classification, food choice, retreat scoring, nav helpers
test/
  brain.test.js   arbitration unit tests
  integration.mjs live server end-to-end
```

---

## Extending

Add a behavior by dropping a `{ name, enter, tick, exit }` object in `src/behaviors/`,
registering it in `BEHAVIORS`, and giving it a rank in `PRIORITY` in `src/brain.js`.
Natural next steps: sleeping through the night in a bed, seeking shelter at dusk, mining
for gear, or farming a renewable food supply.

If you'd rather automate *your own* player than add a second one, that's a different
stack — [Baritone](https://github.com/cabaletta/baritone) for pathfinding and
[Altoclef](https://github.com/gaucho-matrero/altoclef) built on top of it.
