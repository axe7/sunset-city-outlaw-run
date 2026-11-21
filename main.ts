// Sunset City: Outlaw Run — the entry program for the make.fun gta6-01 bounty.
// Node 22, standard library only. It gathers the game (game/ as plain static files
// a desktop browser loads offline) and its screenshots (screenshots/) into the
// output directory and writes the dossier (dossier.json) the judge reads, using
// the kit's vendored buildDossier. Running it twice writes identical bytes.
//
// Local check, outside the grader:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Inside the grader the output directory is /output (MAKEFUN_OUTPUT_DIR unset).

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

/** The repository root: the directory this file lives in. */
const REPO_ROOT = dirname(fileURLToPath(import.meta.url));

/** Where the entry goes: the grader's /output, or MAKEFUN_OUTPUT_DIR locally. */
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/**
 * The bounty's gate caps, as gate.json names them. Only text_max_bytes shapes
 * the dossier's bytes; the others make the program fail exactly where the
 * scorer would refuse the entry (too many screenshots, one too large, game/
 * past its file or byte caps, a path too long).
 */
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

/** Empty a directory (creating it when missing) so a run never inherits stale files. */
function freshDirectory(path: string): void {
  rmSync(path, { recursive: true, force: true });
  mkdirSync(path, { recursive: true });
}

/** Copy one top-level folder of the repo into the output, when it exists. */
function copyFolder(name: string): void {
  const source = join(REPO_ROOT, name);
  if (existsSync(source)) cpSync(source, join(OUTPUT_DIR, name), { recursive: true });
}

/** Assemble the entry: game, screenshots, then the dossier built from them. */
function main(): void {
  freshDirectory(OUTPUT_DIR);
  copyFolder('game');
  copyFolder('screenshots');
  const dossier = buildDossier(OUTPUT_DIR, DOSSIER_CAPS);
  const dossierPath = join(OUTPUT_DIR, 'dossier.json');
  writeFileSync(dossierPath, dossier);
  console.log(`wrote ${dossierPath} (${dossier.length} bytes)`);
}

main();
