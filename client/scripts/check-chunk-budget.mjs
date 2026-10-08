/**
 * S16 (ADR-040) — CI gate for the published client chunk budget:
 * no JavaScript chunk may exceed 300 kB raw. Run after `npm run build`
 * from the client/ directory.
 */
import fs from 'node:fs';
import path from 'node:path';

const BUDGET_BYTES = 300 * 1024;
const assetsDir = path.resolve(process.cwd(), 'dist', 'assets');

if (!fs.existsSync(assetsDir)) {
  console.error(`No build output at ${assetsDir} — run "npm run build" first.`);
  process.exit(1);
}

const over = fs
  .readdirSync(assetsDir)
  .filter((f) => f.endsWith('.js'))
  .map((f) => ({ file: f, bytes: fs.statSync(path.join(assetsDir, f)).size }))
  .filter((x) => x.bytes > BUDGET_BYTES);

if (over.length) {
  console.error('Chunk budget exceeded (300 kB raw):');
  for (const x of over) console.error(`  ${x.bytes} B  ${x.file}`);
  process.exit(1);
}

const largest = fs
  .readdirSync(assetsDir)
  .filter((f) => f.endsWith('.js'))
  .map((f) => ({ file: f, bytes: fs.statSync(path.join(assetsDir, f)).size }))
  .sort((a, b) => b.bytes - a.bytes)[0];

console.log(`Chunk budget OK — largest JS chunk ${largest.bytes} B (${largest.file}).`);
