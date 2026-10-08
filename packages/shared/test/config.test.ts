import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('uses safe local defaults', () => {
    expect(loadConfig({})).toEqual({
      port: 3000,
      databasePath: './data/story-keeper.sqlite',
    });
  });

  it('parses valid environment values', () => {
    expect(loadConfig({ PORT: '4321', DATABASE_PATH: './tmp/test.sqlite' })).toEqual({
      port: 4321,
      databasePath: './tmp/test.sqlite',
    });
  });

  it('rejects an invalid port', () => {
    expect(() => loadConfig({ PORT: '70000' })).toThrow();
  });
});
