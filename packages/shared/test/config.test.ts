import { describe, expect, it } from 'vitest';

import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('uses safe local defaults', () => {
    expect(loadConfig({})).toEqual({
      port: 3000,
      http: { host: '127.0.0.1' },
      databasePath: './data/story-keeper.sqlite',
      worker: {
        pollIntervalMs: 1_000,
        lockTimeoutMs: 60_000,
        retryDelayMs: 5_000,
        jobMaxAttempts: 3,
      },
      extraction: { provider: 'disabled' },
      chapter: { provider: 'disabled' },
    });
  });

  it('parses valid environment values', () => {
    expect(loadConfig({ PORT: '4321', DATABASE_PATH: './tmp/test.sqlite' })).toEqual({
      port: 4321,
      http: { host: '127.0.0.1' },
      databasePath: './tmp/test.sqlite',
      worker: {
        pollIntervalMs: 1_000,
        lockTimeoutMs: 60_000,
        retryDelayMs: 5_000,
        jobMaxAttempts: 3,
      },
      extraction: { provider: 'disabled' },
      chapter: { provider: 'disabled' },
    });
  });

  it('requires centralized Bedrock settings only when live chapter generation is enabled', () => {
    expect(() => loadConfig({ CHAPTER_GENERATION_PROVIDER: 'bedrock' })).toThrow();
    expect(
      loadConfig({
        CHAPTER_GENERATION_PROVIDER: 'bedrock',
        AWS_REGION: 'us-east-1',
        BEDROCK_MODEL_ID: 'test-model',
      }).chapter,
    ).toEqual({
      provider: 'bedrock',
      region: 'us-east-1',
      modelId: 'test-model',
      temperature: 0.2,
      maxTokens: 4_096,
      timeoutMs: 30_000,
      sdkMaxAttempts: 3,
    });
  });

  it('requires centralized Bedrock settings only when live extraction is enabled', () => {
    expect(() => loadConfig({ STORY_EXTRACTION_PROVIDER: 'bedrock' })).toThrow();
    expect(
      loadConfig({
        STORY_EXTRACTION_PROVIDER: 'bedrock',
        AWS_REGION: 'us-east-1',
        BEDROCK_MODEL_ID: 'test-model',
      }).extraction,
    ).toEqual({
      provider: 'bedrock',
      region: 'us-east-1',
      modelId: 'test-model',
      temperature: 0,
      maxTokens: 2_048,
      timeoutMs: 30_000,
      sdkMaxAttempts: 3,
    });
  });

  it('rejects an invalid port', () => {
    expect(() => loadConfig({ PORT: '70000' })).toThrow();
  });

  it('requires an explicit host allowlist for non-loopback binding', () => {
    expect(() => loadConfig({ HTTP_HOST: '0.0.0.0' })).toThrow('HTTP_ALLOWED_HOSTS is required');
    expect(
      loadConfig({
        HTTP_HOST: '0.0.0.0',
        HTTP_ALLOWED_HOSTS: 'story-keeper.example.com, localhost, story-keeper.example.com',
        HTTP_ALLOWED_ORIGINS: 'https://story-keeper.example.com',
      }).http,
    ).toEqual({
      host: '0.0.0.0',
      allowedHosts: ['story-keeper.example.com', 'localhost'],
      allowedOrigins: ['https://story-keeper.example.com'],
    });
  });
});
