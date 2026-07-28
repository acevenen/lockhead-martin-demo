#!/usr/bin/env node
/**
 * Fetches REAL elevation grids for every location in the world atlas and writes
 * data/world-elevation.json. Run once at build time; the demo ships the baked
 * result so it still runs air-gapped from file://.
 *
 * Source: opentopodata.org (ETOPO1 / SRTM). Public instance is rate limited to
 * 100 locations per call and 1 call/sec, so we sample a 10x10 grid per site.
 *
 * Usage: node tools/fetch-world-data.mjs [--dataset etopo1] [--only <id>]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITES = JSON.parse(readFileSync(join(root, 'data', 'world-sites.json'), 'utf8'));

const args = process.argv.slice(2);
const argVal = (flag, dflt) => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : dflt; };
const DATASET = argVal('--dataset', 'etopo1');
const ONLY = argVal('--only', null);

const N = 10;                 // 10x10 = 100 samples, the per-call maximum
const SPAN_KM = 60;           // grid covers ~60km across, matching the demo map
const sleep = ms => new Promise(r => setTimeout(r, ms));

function gridFor(lat, lon) {
  const dLat = (SPAN_KM / 111) / (N - 1);
  const dLon = (SPAN_KM / (111 * Math.cos(lat * Math.PI / 180))) / (N - 1);
  const pts = [];
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      pts.push([
        (lat + (j - (N - 1) / 2) * dLat).toFixed(5),
        (lon + (i - (N - 1) / 2) * dLon).toFixed(5),
      ]);
    }
  }
  return pts;
}

async function fetchGrid(site, attempt = 1) {
  const pts = gridFor(site.lat, site.lon);
  const locs = pts.map(p => `${p[0]},${p[1]}`).join('|');
  const url = `https://api.opentopodata.org/v1/${DATASET}?locations=${locs}`;
  try {
    const res = await fetch(url);
    if (res.status === 429 || res.status >= 500) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    if (json.status !== 'OK') throw new Error(json.error || 'bad status');
    return json.results.map(r => (r.elevation == null ? 0 : Math.round(r.elevation)));
  } catch (e) {
    if (attempt >= 4) throw e;
    await sleep(1500 * attempt);
    return fetchGrid(site, attempt + 1);
  }
}

const out = {};
const list = SITES.filter(s => !ONLY || s.id === ONLY);
let done = 0;
for (const site of list) {
  const grid = await fetchGrid(site);
  const min = Math.min(...grid), max = Math.max(...grid);
  out[site.id] = { n: N, spanKm: SPAN_KM, min, max, grid };
  done++;
  console.log(`${String(done).padStart(3)}/${list.length}  ${site.id.padEnd(16)} ${String(min).padStart(6)}m..${String(max).padStart(6)}m  relief ${max - min}m`);
  await sleep(1100);           // stay under the 1 call/sec public limit
}

mkdirSync(join(root, 'data'), { recursive: true });
const path = join(root, 'data', 'world-elevation.json');
writeFileSync(path, JSON.stringify(out));
console.log(`\nwrote ${path} — ${Object.keys(out).length} sites, ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
