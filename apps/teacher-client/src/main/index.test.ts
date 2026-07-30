import { describe, expect, it } from 'vitest';

import { createWindowOptions } from './index.js';

describe('createWindowOptions', () => {
  it('enforces context isolation, sandboxing, and a fixed preload', () => {
    const options = createWindowOptions('C:\\SchoolWorkHub\\preload.js');

    expect(options.webPreferences).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: 'C:\\SchoolWorkHub\\preload.js',
    });
    expect(options.webPreferences?.webSecurity).not.toBe(false);
  });
});
