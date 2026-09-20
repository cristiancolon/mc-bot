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

The bot joins over the network like any other player, so it needs somewhere to connect to.
**Every option except offline-mode requires the bot to have its own paid Minecraft account** —
it cannot share yours, or you'd be kicked.

### Option A — A Minecraft Realm

Supported directly. Invite the bot's account to the Realm, then:

```bash
# .env
MC_AUTH=microsoft
MC_USERNAME=bot-account@example.com   # the EMAIL, not the gamertag
MC_REALM_ID=                          # find it with: npm run realms
```

```bash
npm run realms   # lists Realms the account can join, with their ids
npm start        # first run prints a device code to sign in with, once
```

`MC_REALM_NAME` works too if you'd rather match on name than id. Host and port are ignored.

Two Realm-specific catches:

- **Realms always run the newest Minecraft version and you can't pin it.** If the Realm
  updates past mineflayer's ceiling, the bot simply can't join, and there's no fix on your
  end — Realms don't accept plugins, so ViaVersion isn't an option. This is the single
  biggest reason to prefer a server.
- **The bot occupies one of your 10 player slots.**

### Option B — A server you and your friends share (recommended)

Any Paper/Fabric/vanilla server, self-hosted or rented. This is the better choice because
you control the version, and you can skip buying a second account.

*If the server is online-mode (normal):* the bot needs its own paid account. Set
`MC_AUTH=microsoft` and `MC_USERNAME` to that account's email, plus `MC_HOST`/`MC_PORT`.

*If you run the server yourself:* set `online-mode=false` and leave `MC_AUTH=offline`, and
no second account is needed.

> **Turn on the whitelist if you do this.** `online-mode=false` on an internet-reachable
> server means anyone who finds it can log in as any username, including yours, with your
> permissions. On a LAN-only or localhost server the risk is minimal; on a public address
> it is not.

Hosting it yourself needs **Java 21+** (`java -version` to check; `brew install openjdk@21`
on macOS). A cheap rented host works too and avoids leaving your machine on.

### Option C — Open to LAN (quick test, one session)

Pause → **Open to LAN** → note the port → set `MC_PORT` and `MC_AUTH=microsoft`. LAN worlds
are always online-mode, so the second account is required. Fine for trying things out, but
the port changes every time you reopen the world.

### Not an option — Aternos and similar free hosts

Aternos supports offline mode, but **prohibits bots being used to keep a server online**
and enforces it with shutdowns and account suspension. A survival bot that stays connected
is exactly the pattern they ban.

## Version compatibility

Verified against the installed packages — `mineflayer@4.39.0` supports up to and including
**26.1**.

Re-check at any time:

```bash
node -e "console.log(require('minecraft-protocol').supportedVersions.join(', '))"
```

If your server is newer than the highest supported version, either run it at a supported
version, or run Paper with **ViaVersion/ViaBackwards** so the bot can join on an older
protocol while you and your friends play on the current client. Pin the bot's protocol with
`MC_VERSION=` when auto-detection guesses wrong.

Neither workaround is available on a Realm, since you control neither its version nor its
plugins — so a Realm that has updated past the ceiling simply can't host the bot until
mineflayer catches up.

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
scripts/
  realms.mjs      list Realms the bot account can join
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
