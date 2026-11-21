[![make.fun bounty](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/axe7/sunset-city-outlaw-run/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/axe7/sunset-city-outlaw-run/reward.svg)](https://make.fun/bounty/gta6-01)

# Sunset City: Outlaw Run

An original open-world crime game for the make.fun **“Make GTA 6”** bounty
(gta6-01). A 2D top-down action game in vanilla JavaScript — no frameworks,
no external assets, no network requests. Every name, place, vehicle and line
of story in Sunset City is invented for this game.

## The game

Six years gone, and Danny Solano is back on the boardwalk. Rosa Delgado kept
his seat at Rosa's Diner — and a list of jobs with his name on them:

1. **Welcome Home** — fetch a borrowed gold Vireo GT from the marina and
   deliver it to Sunset Customs. Pays $300 and earns Danny his pistol.
2. **Pier Pressure** — carry a watched package from the pier to Club Neon
   against a 150-second clock, with the heat pinned at two stars. Pays $600.
3. **Jackals at Dusk** — face down four Neon Jackal rivals on the boardwalk,
   then lose the heat. Pays $1,000.

Around the story: a living 10×9-block city with a beach, pier and boardwalk;
traffic that drives the grid and honks; pedestrians who stroll, flee and
report crimes they actually witness; a five-star wanted system where police
spawn off-screen, pursue, ram and bust (stand near an officer while slow and
the bust meter fills — break line of sight and the heat decays); car theft
with the driver pulled out; a respray shop that clears heat and repairs;
food stands; and 12 golden film reels hidden around the city as a collectible
hunt. Progress (money, story, reels, position) saves to `localStorage`.

### Controls

| Keys | Action |
| --- | --- |
| W A S D / arrows | walk / drive |
| Shift | run |
| F | enter / exit a car (parked, or pull a driver out) |
| Mouse + click | aim, punch, shoot (once armed) |
| Space | handbrake |
| E | eat at a food stand ($25, +50 health) |
| P / Esc | pause · M mute |

Sound is all synthesized WebAudio: engine and siren loops, impacts, gunfire,
and a four-chord Am–F–C–G sunset groove. No audio files exist.

## Running it

```sh
node serve.ts            # serves game/ at http://localhost:8080
# or open game/index.html from any static host — it is fully offline.
```

`node main.ts` (with `MAKEFUN_OUTPUT_DIR` set) copies `game/` and
`screenshots/` to the output directory and writes `dossier.json` via the
kit's `buildDossier`, unchanged.

## Source map — one job per file (`game/src/`)

| File | Job |
| --- | --- |
| `config.js` | World geometry, tuning constants, prices, palette, car models |
| `rng.js` | Seeded RNG (mulberry32) + math helpers — same seed, same city |
| `input.js` | Keyboard/mouse state and one-shot press queue |
| `audio.js` | All synthesized sound effects and the music loop |
| `city.js` | Procedural city generation, surfaces, collision queries |
| `vehicles.js` | Car factory, shared arcade physics, traffic AI, spawning |
| `people.js` | Pedestrian factory, walker/flee/rival AI, line of sight |
| `police.js` | Wanted/heat model, police car factory, pursuit AI |
| `missions.js` | The three-mission story: steps, markers, rewards |
| `game.js` | The simulation: player, combat, crimes, busts, saves |
| `render.js` | Camera and world rendering (buildings, cars, people, sunset grade) |
| `hud.js` | HUD: vitals, stars, objective, dialogue, minimap |
| `shots.js` | Deterministic staged scenes behind `?shot=<name>` for screenshots |
| `main.js` | Boot, DOM overlays, the frame loop |

## Screenshots

`screenshots/` holds four frames of real gameplay, staged deterministically
through `shots.json` (`?shot=drive|foot|chase|mission&seed=1`): driving the
Vireo downtown, on foot outside Rosa's Diner, a four-star pursuit, and the
timed pier delivery under police pressure. HUD and minimap are visible in
each, exactly as a player sees them.
