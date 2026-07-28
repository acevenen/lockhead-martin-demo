#!/usr/bin/env node
/**
 * Builds the self-contained artifact/deploy version of the demo:
 * - inlines vendor/three.min.js into the page
 * - strips the document skeleton (doctype/html/head/body) so the result
 *   can be published as page-content-only (artifact hosts add their own shell)
 *
 * Usage: node tools/build-artifact.mjs [outFile]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] || join(root, 'dist', 'artifact.html');

let html = readFileSync(join(root, 'index.html'), 'utf8');

/* inline every local script so the published page is a single self-contained
   file — the artifact CSP blocks external fetches, and this also keeps the
   file:// build working from one document */
const LOCAL = /<script src="((?:vendor|js)\/[^"]+)"><\/script>/g;
let inlined = 0;
html = html.replace(LOCAL, (_m, rel) => {
  const code = readFileSync(join(root, rel), 'utf8');
  inlined++;
  return `<script>\n/* inlined: ${rel} */\n${code}\n</script>`;
});
if (!inlined) throw new Error('no local scripts inlined — check the tag pattern');
console.log(`inlined ${inlined} local scripts`);

const SKELETON = [
  /^<!DOCTYPE html>\s*$/i,
  /^<html[^>]*>\s*$/i,
  /^<\/html>\s*$/i,
  /^<head>\s*$/i,
  /^<\/head>\s*$/i,
  /^<body>\s*$/i,
  /^<\/body>\s*$/i,
  /^<meta charset[^>]*>\s*$/i,
  /^<meta name="viewport"[^>]*>\s*$/i,
];
html = html.split('\n').filter(line => !SKELETON.some(re => re.test(line.trim()))).join('\n');

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
console.log(`built ${out} (${(html.length / 1024).toFixed(0)} KB)`);
