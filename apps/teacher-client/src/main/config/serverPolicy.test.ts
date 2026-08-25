import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  ServerPolicyStore,
  normalizeFingerprint,
  parseServerPolicy,
} from './serverPolicy.js';

const createdDirectories: string[] = [];
const currentFingerprint = 'AA'.repeat(32);
const nextFingerprint = 'BB'.repeat(32);

async function createPolicyPath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'schoolworkhub-policy-'));
  createdDirectories.push(directory);
  return join(directory, 'server-policy.json');
}

afterEach(async () => {
  await Promise.all(
    createdDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('server policy', () => {
  it('normalizes fingerprints and rejects insecure or malformed policies', () => {
    expect(normalizeFingerprint('aa:bb:cc')).toBe('AABBCC');

    expect(() =>
      parseServerPolicy({
        baseUrl: 'http://school.example',
        schoolCode: 'sample-school',
        currentFingerprint,
        nextFingerprint: null,
      }),
    ).toThrow();

    expect(() =>
      parseServerPolicy({
        baseUrl: 'https://school.example',
        schoolCode: 'sample-school',
        currentFingerprint: 'not-a-fingerprint',
        nextFingerprint: null,
      }),
    ).toThrow();
  });

  it('writes a normalized private policy atomically and preserves it on invalid replacement', async () => {
    const path = await createPolicyPath();
    const store = new ServerPolicyStore(path);
    const colonSeparated = currentFingerprint.match(/.{2}/g)?.join(':');
    expect(colonSeparated).toBeDefined();

    await store.replaceAtomically({
      baseUrl: 'https://school.example:8443/api/',
      schoolCode: 'sample-school',
      currentFingerprint: colonSeparated?.toLowerCase(),
      nextFingerprint,
    });

    await expect(store.load()).resolves.toEqual({
      baseUrl: 'https://school.example:8443/api/',
      schoolCode: 'sample-school',
      currentFingerprint,
      nextFingerprint,
    });
    if (process.platform !== 'win32') {
      expect((await stat(path)).mode & 0o777).toBe(0o600);
    }

    await expect(
      store.replaceAtomically({
        baseUrl: 'http://attacker.example',
        schoolCode: 'sample-school',
        currentFingerprint,
        nextFingerprint: null,
      }),
    ).rejects.toThrow();

    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({
      baseUrl: 'https://school.example:8443/api/',
      currentFingerprint,
    });
  });
});
