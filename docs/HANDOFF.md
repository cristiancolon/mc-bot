# Handoff

State of this project as of **2026-09-20**, written for whoever picks it up next.

---

## What we're building

A Minecraft **Java Edition** survival bot that joins a world as a genuine second player over
the network protocol — not a mod, not a macro driving the owner's character. Its job is to
stay alive on its own: avoid or kill hostile mobs, and feed itself.

The owner's goal is to **play alongside it with friends** on a shared server.

Built on [Mineflayer](https://github.com/PrismarineJS/mineflayer). Repo:
<https://github.com/cristiancolon/mc-bot> (public, MIT, default branch `main`).

---

## Status: working and tested

The bot runs. It connects, spawns, responds to chat commands, and transitions correctly
between survival states. Nothing is half-finished.

- **17 unit tests** (`npm test`) — arbitration logic against a mock bot, no server needed
- **5 integration checks** (`npm run test:integration`) — boots a real server and verifies
  state transitions over a live protocol connection

Both suites passed at time of writing. Run them before and after any change.

### The one important gap

**The bot has never connected to a real Minecraft server.** All live testing used
[flying-squid](https://github.com/PrismarineJS/flying-squid), a Minecraft server written in
JavaScript, because the owner's machine has **Java 14** and a real server needs **Java 21+**.

flying-squid speaks the real 1.21.4 protocol, so this is meaningful verification — but it is
not a vanilla/Paper server. Expect small surprises on first contact with the real thing.

The **Realms path is code-verified but never executed live** — it needs a real Realm and a
second paid Minecraft account, neither of which we had.

---

## The part worth understanding: arbitration

The actions (pathfinding, melee, eating, block collection) all come from plugins. They were
never the hard part. The hard part is **deciding which to do**, and that logic is ours, in
`src/brain.js`.

A priority ladder runs every 200 ms:

```
flee (4)  >  fight (3)  >  eat (2)  >  forage (1)  >  idle (0)
```

Four rules keep it from oscillating. **Please don't "simplify" these away** — each exists
because the naive version misbehaves:

1. **Hysteresis band on health.** Commit to a fight at `FIGHT_HEALTH` (12), disengage at
   `FLEE_HEALTH` (8). The 4-point dead zone means one hit can't flip the decision. A single
   threshold makes the bot oscillate every tick and do neither thing.

2. **Escalation bypasses the dwell timer; de-escalation doesn't.** Moving *up* the ladder is
   immediate (a creeper interrupts a meal). Moving *down* waits out `MIN_DWELL_MS`, so the
   bot can't twitch back to idle the instant a mob steps out of range.

3. **Fleeing ends on a counter.** The bot leaves `flee` only after `FLEE_CLEAR_TICKS`
   consecutive ticks with nothing inside `SAFE_RADIUS` — not on one clean frame.

4. **Retreat targets are sampled, not computed.** Running along the reverse threat vector is
   how bots path into lava. `src/lib/safety.js` samples a ring of candidates, rejects any
   that aren't safe to stand in, and scores survivors on distance gained.

### Load-bearing detail that looks like a bug

In `Brain.decide()`, the `cornered` check comes **before** the `criticalHealth` check. This
is deliberate and a test enforces it.

A unit test caught the original ordering as a real deadlock: when `findRetreat()` finds
nowhere safe, it sets `cornered`, but the critical-health branch kept returning `flee` — so
the bot stood still and died while "fleeing" nowhere. Fighting back is strictly better.
If you reorder these, `cornered bot fights rather than running nowhere` will fail.

### Other deliberate choices

- **autoEat's own timer is disabled** (`bot.autoEat.disableAuto()`). Eating locks the bot
  still for ~1.6 s, so the brain decides when that's safe. It won't eat with anything inside
  6 blocks. If you re-enable auto, the bot will eat mid-creeper.
- **Neutral mobs are ignored until they attack.** Endermen, wolves, daylight spiders are
  flagged `hostile` in the game data but only retaliate. A health drop attributes the hit to
  the nearest capable mob for 30 s (`aggressors` map in `brain.js`).
- **Creepers are avoided, not fought** (`ENGAGE_CREEPERS=false`). Melee trades with creepers
  lose.
- **Golden apples are rationed** — only unlocked at or below `DESPERATE_FOOD`.
- **Three movement profiles** (`src/movements.js`). Escape never digs and caps drops at 3;
  work may dig. All avoid lava, fire, cactus, magma, powder snow.

---

## Traps that will cost you an hour

**This project is ESM (`"type": "module"`) and must stay that way.**
`mineflayer-auto-eat@5` is **ESM-only**. But `mineflayer-pathfinder`, `mineflayer-pvp` and
`mineflayer-collectblock` are CommonJS **without named-export detection**, so this crashes:

```js
import { pathfinder, goals } from 'mineflayer-pathfinder'  // SyntaxError
```

Use the default import and destructure — see the top of `src/index.js`:

```js
import pathfinderPkg from 'mineflayer-pathfinder'
const { pathfinder, Movements, goals } = pathfinderPkg
```

Most tutorials online show the broken form.

**`MC_USERNAME` is an email, not a gamertag, when `MC_AUTH=microsoft`.** It's only a cache
key for the login token; the in-game name comes from the account.

**Only re-issue `bot.pvp.attack()` when the target changes.** Calling it every tick resets
pvp's swing timing and the bot stops actually hitting. `src/behaviors/fight.js` guards this.

**`npm run test:integration` creates a stray `null/` directory** (flying-squid's
`worldFolder: null`). It's gitignored; delete it freely.

---

## Environment as we left it

| | |
|---|---|
| Node | v24.16.0 |
| npm | 11.13.0 |
| Java | **14.0.2 — too old.** Needs 21+ (`brew install openjdk@21`) |
| Platform | macOS (darwin 25.3.0) |
| `gh` | authenticated as `cristiancolon` |
| Mineflayer protocol ceiling | **26.1** (verified from the installed package) |

Re-check the ceiling any time:

```bash
node -e "console.log(require('minecraft-protocol').supportedVersions.join(', '))"
```

---

## Decisions already made (don't relitigate)

**Hosting: the owner's gaming PC** — 32 GB RAM, Ryzen 7 7800X3D, RTX 4070 Ti Super.
The 7800X3D's 3D V-Cache makes it close to the best consumer CPU for Minecraft server tick
rate, and better than any budget VPS. The GPU is irrelevant (servers are headless).

Agreed configuration:
- **Paper**, not vanilla — better tick performance, and it takes plugins
- **ViaVersion/ViaBackwards** — this is how the bot's 26.1 ceiling gets solved when the
  server runs newer. *Not available on a Realm*, which is the main argument against Realms.
- **`-Xms4G -Xmx6G` with Aikar's flags.** Do not allocate 24 GB; bigger heaps mean longer GC
  pauses, which show up as lag spikes.
- Bot process measured at **~150 MB**, so it can run anywhere — same PC or the Mac over LAN.

**Ruled out:**
- **Aternos and similar free hosts.** They support offline mode but explicitly prohibit bots
  used to keep a server online, enforced with shutdowns and account suspension. A survival
  bot that stays connected is exactly the banned pattern.
- **A VPS**, for now. Worse single-thread performance than the 7800X3D. Only revisit if the
  owner wants uptime while the PC is off — that's an uptime purchase, not a performance one.
  (Note: leaving the gaming PC on 24/7 likely costs more in electricity than a cheap VPS.)

**Realms:** supported in code (`MC_REALM_ID` / `MC_REALM_NAME`, `npm run realms` lists ids),
but a Realm always runs the newest version, can't be pinned, and accepts no plugins — so once
it updates past mineflayer's ceiling the bot simply can't join, with no workaround.

---

## Open question: authentication and security

Not yet resolved, and it needs a decision before the server is exposed to friends.

The bot needs its own paid Minecraft account **unless** the server runs `online-mode=false`.
But offline mode plus a whitelist is **not** safe on an internet-reachable server: usernames
are unverified in offline mode and the whitelist matches on username, so anyone who learns a
whitelisted name can join as them — including the owner, with their permissions.

Three viable paths:

1. **Buy the bot an account** (~$30 once), run `online-mode=true`. Simplest and properly
   secure.
2. **Velocity proxy in online mode + backend in offline mode bound to localhost.** Friends
   authenticate at the proxy; the bot connects directly to the backend and skips auth. Free
   and secure, but real setup work.
3. **Keep it LAN-only** and accept that friends can't join remotely.

---

## Suggested next steps

1. `brew install openjdk@21` — nothing involving a real server works until this is done.
2. Stand up Paper on the gaming PC, run the bot against it, and confirm behaviour matches
   what flying-squid showed. **This is the highest-value next action**, since it closes the
   one real gap in testing.
3. Pick an auth path from the section above before opening it to friends.
4. Only then consider new behaviours.

### Natural extensions

Add a behaviour as a `{ name, enter, tick, exit }` object in `src/behaviors/`, register it in
`BEHAVIORS`, and give it a rank in `PRIORITY` (both in `src/brain.js`). Ideas, roughly in
order of usefulness: sleeping through the night in a bed, seeking shelter at dusk, mining for
armour and weapons, farming a renewable food supply.

---

## Orientation

```
src/
  index.js        entry: connect (server or Realm), load plugins, reconnect backoff
  brain.js        priority arbitration -- read this first
  movements.js    escape / combat / work pathfinding profiles
  commands.js     chat commands (help, status, come, follow, stop, home, inv, say)
  behaviors/      flee, fight, eat, forage, idle
  lib/            mob classification, food choice, retreat scoring, combat, nav
scripts/
  realms.mjs      list Realms the bot account can join
test/
  brain.test.js   arbitration unit tests -- the spec for the rules above
  integration.mjs live server end-to-end
docs/
  HANDOFF.md      this file
```

Read `src/brain.js` and `test/brain.test.js` together. The tests are the clearest statement
of what the arbitration is supposed to do.
