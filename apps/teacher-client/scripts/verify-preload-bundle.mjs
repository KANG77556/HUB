import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const bundlePath = resolve(
  process.cwd(),
  'dist',
  'electron',
  'preload',
  'index.cjs',
);
const content = await readFile(bundlePath, 'utf8');

if (/^\s*(?:import|export)\s/m.test(content)) {
  throw new Error('PRELOAD_BUNDLE_CONTAINS_ESM');
}
if (!/require\(["']electron["']\)/.test(content)) {
  throw new Error('PRELOAD_BUNDLE_ELECTRON_EXTERNAL_MISSING');
}
if (!content.includes('exposeInMainWorld')) {
  throw new Error('PRELOAD_BUNDLE_BRIDGE_MISSING');
}

process.stdout.write(
  `${JSON.stringify({
    ok: true,
    format: 'commonjs',
    file: 'dist/electron/preload/index.cjs',
  })}\n`,
);
