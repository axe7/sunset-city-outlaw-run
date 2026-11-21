[![make.fun bounty](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/axe7/sunset-city-outlaw-run/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/axe7/sunset-city-outlaw-run/reward.svg)](https://make.fun/bounty/gta6-01)

# Sunset City: Outlaw Run

An original open-world crime game built for make.fun's **“Make GTA 6”** bounty
(gta6-01). It is a 2D top-down action game written in plain JavaScript — no
framework, no library, no downloaded assets, no network calls at all. The
city, the people, the cars, the story and every sound are invented here.

## Play it

```sh
node serve.ts            # serves game/ at http://localhost:8080
# or drop game/ on any static host and open index.html — it works offline.
```

`node main.ts` (with `MAKEFUN_OUTPUT_DIR` set) assembles the entry: it copies
`game/` and `screenshots/` into the output folder and writes `dossier.json`
through the kit's `buildDossier`.

## The story

Danny Solano is back in Sunset City after six years away. Rosa Delgado kept
his booth at Rosa's Diner — and a list of jobs with his name on it:

- **Welcome Home** — bring a borrowed gold Vireo GT from the marina to Sunset
  Customs. Pays $300, and Danny walks away with a pistol.
- **Pier Pressure** — run a watched package from the pier to Club Neon inside
  150 seconds, with the heat held at two stars. Pays $600.
- **Jackals at Dusk** — settle things with four Neon Jackal rivals on the
  boardwalk, then shake the police. Pays $1,000.

## A living city

The city is procedural and seeded, so the same seed always builds the same
streets: a 10×9-block grid with a beach, a pier and a boardwalk, plus
landmarks like Rosa's Diner, Sunset Customs, the police station and the
hospital. Around the story it offers:

- **Traffic** that drives the grid, turns at intersections, brakes for cars
  ahead, and honks.
- **Pedestrians** who stroll the sidewalks, run from gunfire, and only report
  a crime they can actually see — the witness model checks line of sight and
  distance.
- **A five-star wanted system**: police spawn off-screen, chase, ram and box
  the player in. Linger near an officer while slow and the bust meter fills;
  break line of sight and the heat cools off. Getting busted or going down
  costs a fine and drops Danny at the station or the hospital.
- **Car theft** — take any car with F, parked or occupied (pulling a driver
  out in front of witnesses adds heat).
- **A respray shop** that clears heat and repairs damage, **food stands**
  ($25 for +50 health), and **12 golden film reels** hidden around the city
  to hunt down.
- **Saving** — money, story progress, reels and position persist in
  `localStorage`, so a run can be continued later.

## Controls

| Keys | Action |
| --- | --- |
| W A S D / arrows | walk / drive |
| Shift | run |
| F | get in / out of a car |
| Mouse + click | aim, punch, shoot (once armed) |
| Space | handbrake |
| E | eat at a food stand |
| P / Esc | pause · M mute |

All sound is synthesized live with WebAudio — engine and siren loops, impacts,
gunfire, and a four-chord Am–F–C–G groove over the sunset. There are no audio
files anywhere in the game.

## How it is built

`game/src/` splits the game into one file per job:

| File | Job |
| --- | --- |
| `config.js` | World geometry, tuning, prices, palette, car models |
| `rng.js` | Seeded random numbers (mulberry32) and maths helpers |
| `input.js` | Keyboard and mouse state, one-shot press queue |
| `audio.js` | Every synthesized sound and the music loop |
| `city.js` | Procedural city generation, surfaces, collision queries |
| `vehicles.js` | Car factory, shared arcade physics, traffic AI |
| `people.js` | Pedestrian factory, walker / flee / rival behaviour, sight |
| `police.js` | Wanted and heat model, police cars, pursuit AI |
| `missions.js` | The three-mission story: steps, markers, rewards |
| `game.js` | The simulation: player, combat, crimes, busts, saves |
| `render.js` | Camera and world drawing, buildings, cars, people, sunset grade |
| `hud.js` | HUD: vitals, stars, objective, dialogue, minimap |
| `shots.js` | Deterministic staged scenes for screenshots (`?shot=<name>`) |
| `main.js` | Boot, DOM overlays, the frame loop |

## Screenshots

`screenshots/` holds four frames of real gameplay, staged deterministically
through `shots.json` (`?shot=drive|foot|chase|mission&seed=1`): the Vireo
downtown, on foot outside Rosa's Diner, a four-star pursuit, and the timed
pier delivery under police pressure. The HUD and minimap are visible in each,
exactly as a player sees them.
