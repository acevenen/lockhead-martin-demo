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
const three = readFileSync(join(root, 'vendor', 'three.min.js'), 'utf8');

html = html.replace('<script src="vendor/three.min.js"></script>', () => `<script>\n${three}\n</script>`);

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
