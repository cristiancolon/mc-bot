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

- **19 unit tests** (`npm test`) — arbitration logic against a mock bot, no server needed
- **5 integration checks** (`npm run test:integration`) — boots a real server and verifies
  state transitions over a live protocol connection

Both suites passed at time of writing. Run them before and after any change.

### Verified against a real server on 2026-09-20

The old handoff's "the bot has never connected to a real Minecraft server" gap is
**closed**. A local Paper **26.1.2** server was stood up at `~/code/mc-server` and the bot
connected, played, and survived against it. Confirmed live:

| | |
|---|---|
| Connect + spawn | `spawned as Survivor on 26.1` — version auto-detect resolved `26.1.2` unaided |
| Auto-reconnect | recovered by itself after a server restart, on the 60s backoff |
| `fight` | single zombie engaged and killed in 11s (earned *Monster Hunter*) |
| `flee` (creeper) | fled at **full health 20** — `ENGAGE_CREEPERS=false` honoured |
| `flee` (pack) | `fight -> flee` when a third zombie arrived |
| Server load | TPS 20.0 / 20.0 / 20.0, flat |

`eat` and `forage` are still only exercised by unit tests and flying-squid.

The **Realms path is still code-verified but never executed live** — it needs a real Realm
and a second paid Minecraft account, neither of which we had.

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

5. **Hysteresis band on pack size.** Start a fight at up to `MAX_ENGAGE_TARGETS` (2), but
   once fleeing, the pack must thin to `REENGAGE_TARGETS` (1) before turning around.
   *Added 2026-09-20 after live testing* — with a bare `> maxEngageTargets` check, one
   zombie stepping in and out of `DETECT_RANGE` produced `flee -> fight -> flee -> fight`
   and the bot neither escaped nor committed.

6. **Hysteresis band on distance.** A calm bot only reacts to a threat inside
   `ALARM_RADIUS` (10); once fighting or fleeing it reacts to anything in `DETECT_RANGE`
   (16) and stops only once clear of `SAFE_RADIUS` (14). *Added 2026-09-20, immediately
   after rule 5 exposed it.* With entry and exit sharing a radius, a mob between
   `safeRadius` and `detectRange` was **simultaneously a threat** (so `flee` re-triggered)
   **and "clear"** (so `clearTicks` let `flee` exit) — producing
   `flee -> idle -> flee -> idle`, during which the bot died. `FLEE_CLEAR_TICKS` is a
   *temporal* band and does not cover this.

   The pattern across rules 1, 5 and 6 is the same: **every threshold that gates entry into
   a defensive state needs a different value than the one that gates leaving it.** Health
   had a band from the start; pack size and distance did not, and both produced a fatal
   oscillation. If you add a new threshold, give it a band.

   Note the unit tests are static scenarios and caught none of this. All three were found
   by watching a real server. There are now tests for each, but they were written *after*
   the live observation, not before.

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

**Minecraft 26.1+ needs Java 25, not 21.** The server refuses to boot on anything older:
`Minecraft 26.1 and newer requires running the server with Java 25 or above`. The previous
handoff's "needs 21+ (`brew install openjdk@21`)" was correct for 1.20.5 and is now wrong.
The Java 21.0.4 sitting on the Windows side is *not* sufficient either — an easy false start.

**Mineflayer's 26.1 ceiling is now behind current Paper (26.3).** ViaVersion/ViaBackwards
has stopped being a hypothetical: a shared server running the current version *cannot*
accept this bot without it. Either run Via, or pin the server to 26.1.

**The `physicTick` deprecation warning on startup is not ours.** It comes from
`mineflayer-pvp/lib/PVP.js`, which still listens on the pre-rename event. Nothing in `src/`
references it; don't go looking.

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
| Node | v24.14.0 |
| Java | Temurin **25.0.4.1** at `~/.local/jdk/jdk-25.0.4.1+1` (no sudo needed) |
| Platform | **WSL2 (Ubuntu) on the gaming PC** — Linux 6.18, not macOS |
| WSL limits | 10 GB RAM / 8 processors, set in `.wslconfig` |
| `gh` | authenticated as `cristiancolon` |
| Mineflayer protocol ceiling | **26.1** (verified from the installed package) |
| Latest Paper | **26.3** — i.e. the ceiling is now *behind* current |

Note this is a different machine than the previous handoff described. The macOS/Java 14
entry is gone; work now happens in WSL2 on the 7800X3D box.

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

**Ruled out — free hosts, confirmed against the actual ToS (2026-09-20):**

Aternos §5.2 bans this by name: §5.2 c) prohibits *"Circumventing or prolonging the stop
routine which stops servers without active players especially by … using fake players, e.g.
bots"*; §5.2 a) bans *"Modifying or overwriting the amount of active players"*; §5.2 b) bans
*"faking player activity"* and repeated auto-reconnection — which `RECONNECT=true` does
verbatim. Penalty is deletion of the account and all servers. The "but mine actually plays,
it isn't an AFK bot" argument has **never been officially ruled on by anyone**, and §5.2 c)
carries no idleness qualifier.

Minehut and Falix ban it too; Falix gates its keep-alive behind a CAPTCHA specifically so
bots can't satisfy it, and Minehut authenticates at its proxy so the bot would need a paid
account anyway. This is structural, not incidental: free hosting is only viable *because*
empty servers get stopped, and a persistently-connected bot is precisely what they sell.

Galling detail: everything else about Aternos fit — version pinning works, ViaVersion is in
their addon library, and their "Cracked" toggle gives `online-mode=false`. The bot is the
single disqualifier.

**Hosting, reconsidered (the previous handoff's VPS reasoning was partly wrong):**

The old entry said a VPS has "worse single-thread performance than the 7800X3D" and implied
ARM would be weak. Measured Geekbench 6 single-core says the ARM claim was backwards:

| Instance | GB6 single-core |
|---|---|
| Oracle A1 (free tier) | **1092** |
| Hetzner CAX11 (ARM) | 988 |
| Hetzner CX22 (Intel shared) | 865 |

~1000 is roughly the floor for "a few players on optimized Paper", so Oracle's free tier
sits right at the threshold for 4-5 players — adequate, no headroom. The 7800X3D is still
far better; that part stands.

**The deciding factor is shell access, not price.** With a shell, the bot (~150 MB) runs
next to the server and Velocity can proxy in online mode to a localhost-bound backend — so
the bot needs **no paid account**. A managed Minecraft host gives a container, not a shell,
so the bot must authenticate from outside: budget ~$30 once for an account, or run an auth
plugin. That swamps the $1/mo difference between plans.

Current recommendation: **Oracle Cloud A1 free** (2 OCPU / 12 GB) if capacity is available,
falling back to **RackNerd 4 GB (~$60/yr)**. Measure 4k disk IOPS on Oracle before
committing — one benchmark showed 10 MB/s, 10-14x slower than Hetzner, which would hurt
chunk I/O. Pregenerating with Chunky is **non-optional** on a 2-vCPU box: Paper's
`chunk-system.worker-threads` defaults to half the core count, so 2 cores gets one worker.

**Exposing a home server is the strongest argument against self-hosting.** Port 25565 is
scanned continuously and indexed publicly; a home IP ends up on a known-server list within
days. The likely cost is DDoS taking out the whole household's connection; the unlikely but
severe one is that a compromised server sits inside the LAN, next to everything else. A VPS
compromise costs a rebuild. If self-hosting anyway, use a **playit.gg** reverse tunnel —
outbound only, no port forwarding, home IP never exposed.

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

Four viable paths:

1. **Buy the bot an account** (~$30 once), run `online-mode=true`. Simplest and properly
   secure.
2. **Velocity proxy in online mode + backend in offline mode bound to localhost.** Friends
   authenticate at the proxy; the bot connects directly to the backend and skips auth. Free
   and secure, but real setup work.
3. **`online-mode=false` plus an auth plugin (AuthMe-style).** Friends register a password
   and `/login` each session, which closes the unverified-username hole. Free. Costs a login
   prompt, and breaks skins unless SkinsRestorer is added. *Unverified: nobody has confirmed
   AuthMe supports 26.1 — check before relying on it.*
4. **Keep it LAN-only** and accept that friends can't join remotely.

**This choice is coupled to the hosting choice.** Path 2 needs the bot to reach a
localhost-bound backend, which means the bot process must run on the server box — i.e. a
VPS with a shell. On a managed Minecraft host you get a container, not a shell, so path 2 is
off the table and it's effectively path 1 or 3.

---

## Still open: retreat scoring may treat water as safe

During the bug hunt below, one `flee` picked a retreat containing a Drowned, which killed
the bot. Worth checking whether `src/lib/safety.js` scores water as safe to stand in — it
rejects lava, fire, cactus, magma and powder snow, but water is survivable-but-dangerous
rather than outright lethal, so it may be passing the filter.

Not yet investigated.

---

## Suggested next steps

1. **Check whether `safety.js` scores water as safe** (see the open item above) — a retreat
   into water with a Drowned in it killed the bot once.
2. Exercise `eat` and `forage` against the real server — they are still only covered by unit
   tests and flying-squid. Use `~/code/mc-server/mc-cmd.sh` to drive conditions
   (`effect give Survivor minecraft:hunger`, `time set night`, `kill @e[type=zombie]`).
3. Pick an auth path from the section above before opening it to friends.
4. Pick a host. Oracle A1 free first, RackNerd as fallback — see the hosting notes above.
5. Only then consider new behaviours.

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

### The local test server (outside this repo)

`~/code/mc-server/` — deliberately not in the repo, so it never gets committed.

```
paper.jar       Paper 26.1.2 build 74
start.sh        launches it with Temurin 25 + Aikar's flags, creates the console pipe
mc-cmd.sh       send a console command:  ./mc-cmd.sh time set night
console.in      FIFO feeding the server's stdin (a holder process keeps it open)
README.md       why 26.1.2, why Java 25, and the loopback/bind tradeoff
```

Start it, then `npm start` in this repo. `.env` already points at `localhost:25565`.

`server-ip=0.0.0.0` so the Windows Minecraft client can reach it through WSL2's localhost
forwarding; WSL's NAT keeps it off the LAN. **Do not add a `netsh portproxy` for 25565
while `online-mode=false`** — that exposes an unauthenticated server to the whole network.
