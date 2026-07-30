import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { dirname } from 'node:path';

import { z } from 'zod';

export function normalizeFingerprint(value: string): string {
  return value.replaceAll(':', '').trim().toUpperCase();
}

const fingerprintSchema = z
  .string()
  .transform(normalizeFingerprint)
  .pipe(z.string().regex(/^[A-F0-9]{64}$/));

export const serverPolicySchema = z.object({
  baseUrl: z
    .string()
    .url()
    .refine((value) => new URL(value).protocol === 'https:', 'HTTPS is required'),
  schoolCode: z.string().min(2).max(30),
  currentFingerprint: fingerprintSchema,
  nextFingerprint: fingerprintSchema.nullable(),
});

export type ServerPolicy = z.infer<typeof serverPolicySchema>;

export function parseServerPolicy(value: unknown): ServerPolicy {
  return serverPolicySchema.parse(value);
}

export class ServerPolicyStore {
  public constructor(private readonly policyPath: string) {}

  public async load(): Promise<ServerPolicy> {
    const content = await readFile(this.policyPath, 'utf8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(content) as unknown;
    } catch (error: unknown) {
      throw new Error('SERVER_POLICY_INVALID', { cause: error });
    }
    return parseServerPolicy(parsed);
  }

  public async replaceAtomically(candidate: unknown): Promise<ServerPolicy> {
    const policy = parseServerPolicy(candidate);
    const temporaryPath = `${this.policyPath}.${process.pid}.${randomUUID()}.tmp`;
    await mkdir(dirname(this.policyPath), { recursive: true });

    const handle = await open(temporaryPath, 'wx', 0o600);
    let closed = false;
    try {
      await handle.writeFile(`${JSON.stringify(policy, null, 2)}\n`, 'utf8');
      await handle.sync();
      await handle.close();
      closed = true;
      await rename(temporaryPath, this.policyPath);
      return policy;
    } catch (error: unknown) {
      if (!closed) {
        await handle.close().catch(() => undefined);
      }
      await unlink(temporaryPath).catch(() => undefined);
      throw error;
    }
  }
}
