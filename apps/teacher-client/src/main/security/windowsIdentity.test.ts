import { describe, expect, it, vi } from 'vitest';

import { getWindowsSid, type CommandRunner } from './windowsIdentity.js';

describe('getWindowsSid', () => {
  it('runs whoami with a hidden window and returns the CSV SID field', async () => {
    const runner = vi.fn<CommandRunner>().mockResolvedValue({
      stdout: '"SCHOOL\\teacher","S-1-5-21-111-222-333-1001"\r\n',
    });

    await expect(getWindowsSid(runner)).resolves.toBe('S-1-5-21-111-222-333-1001');
    expect(runner).toHaveBeenCalledWith(
      'whoami.exe',
      ['/user', '/fo', 'csv', '/nh'],
      { windowsHide: true },
    );
  });

  it('does not fall back to a username when the SID field is missing or invalid', async () => {
    const missing = vi.fn<CommandRunner>().mockResolvedValue({
      stdout: '"SCHOOL\\teacher",""\r\n',
    });
    const invalid = vi.fn<CommandRunner>().mockResolvedValue({
      stdout: '"SCHOOL\\teacher","teacher"\r\n',
    });

    await expect(getWindowsSid(missing)).rejects.toThrow('WINDOWS_IDENTITY_UNAVAILABLE');
    await expect(getWindowsSid(invalid)).rejects.toThrow('WINDOWS_IDENTITY_UNAVAILABLE');
  });

  it('handles escaped quotes in the account field without shifting the SID column', async () => {
    const runner = vi.fn<CommandRunner>().mockResolvedValue({
      stdout: '"SCHOOL\\teacher ""lead""","S-1-5-21-444-555-666-1002"\r\n',
    });

    await expect(getWindowsSid(runner)).resolves.toBe('S-1-5-21-444-555-666-1002');
  });
});
