import { z } from 'zod';

const configSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_PATH: z.string().trim().min(1).default('./data/story-keeper.sqlite'),
  STORY_EXTRACTION_PROVIDER: z.enum(['disabled', 'bedrock']).default('disabled'),
  CHAPTER_GENERATION_PROVIDER: z.enum(['disabled', 'bedrock']).default('disabled'),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(100).default(1_000),
  WORKER_LOCK_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(60_000),
  JOB_RETRY_DELAY_MS: z.coerce.number().int().min(0).default(5_000),
  JOB_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
  AWS_REGION: z.string().trim().min(1).optional(),
  BEDROCK_MODEL_ID: z.string().trim().min(1).optional(),
  BEDROCK_TEMPERATURE: z.coerce.number().min(0).max(1).default(0),
  BEDROCK_MAX_TOKENS: z.coerce.number().int().min(1).max(8_192).default(2_048),
  BEDROCK_CHAPTER_TEMPERATURE: z.coerce.number().min(0).max(1).default(0.2),
  BEDROCK_CHAPTER_MAX_TOKENS: z.coerce.number().int().min(1).max(16_384).default(4_096),
  BEDROCK_TIMEOUT_MS: z.coerce.number().int().min(1_000).default(30_000),
  BEDROCK_SDK_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(3),
});

export interface WorkerConfig {
  readonly pollIntervalMs: number;
  readonly lockTimeoutMs: number;
  readonly retryDelayMs: number;
  readonly jobMaxAttempts: number;
}

export type ExtractionProviderConfig =
  | { readonly provider: 'disabled' }
  | {
      readonly provider: 'bedrock';
      readonly region: string;
      readonly modelId: string;
      readonly temperature: number;
      readonly maxTokens: number;
      readonly timeoutMs: number;
      readonly sdkMaxAttempts: number;
    };

export type ChapterProviderConfig =
  | { readonly provider: 'disabled' }
  | {
      readonly provider: 'bedrock';
      readonly region: string;
      readonly modelId: string;
      readonly temperature: number;
      readonly maxTokens: number;
      readonly timeoutMs: number;
      readonly sdkMaxAttempts: number;
    };

export interface AppConfig {
  readonly port: number;
  readonly databasePath: string;
  readonly worker: WorkerConfig;
  readonly extraction: ExtractionProviderConfig;
  readonly chapter: ChapterProviderConfig;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = configSchema.parse(environment);
  const extraction: ExtractionProviderConfig = (() => {
    if (parsed.STORY_EXTRACTION_PROVIDER === 'disabled') return { provider: 'disabled' };
    const region = parsed.AWS_REGION;
    const modelId = parsed.BEDROCK_MODEL_ID;
    if (region === undefined || modelId === undefined) {
      throw new Error(
        'AWS_REGION and BEDROCK_MODEL_ID are required when Bedrock extraction is enabled.',
      );
    }
    return {
      provider: 'bedrock',
      region,
      modelId,
      temperature: parsed.BEDROCK_TEMPERATURE,
      maxTokens: parsed.BEDROCK_MAX_TOKENS,
      timeoutMs: parsed.BEDROCK_TIMEOUT_MS,
      sdkMaxAttempts: parsed.BEDROCK_SDK_MAX_ATTEMPTS,
    };
  })();
  const chapter: ChapterProviderConfig = (() => {
    if (parsed.CHAPTER_GENERATION_PROVIDER === 'disabled') return { provider: 'disabled' };
    const region = parsed.AWS_REGION;
    const modelId = parsed.BEDROCK_MODEL_ID;
    if (region === undefined || modelId === undefined) {
      throw new Error(
        'AWS_REGION and BEDROCK_MODEL_ID are required when Bedrock chapter generation is enabled.',
      );
    }
    return {
      provider: 'bedrock',
      region,
      modelId,
      temperature: parsed.BEDROCK_CHAPTER_TEMPERATURE,
      maxTokens: parsed.BEDROCK_CHAPTER_MAX_TOKENS,
      timeoutMs: parsed.BEDROCK_TIMEOUT_MS,
      sdkMaxAttempts: parsed.BEDROCK_SDK_MAX_ATTEMPTS,
    };
  })();

  return {
    port: parsed.PORT,
    databasePath: parsed.DATABASE_PATH,
    worker: {
      pollIntervalMs: parsed.WORKER_POLL_INTERVAL_MS,
      lockTimeoutMs: parsed.WORKER_LOCK_TIMEOUT_MS,
      retryDelayMs: parsed.JOB_RETRY_DELAY_MS,
      jobMaxAttempts: parsed.JOB_MAX_ATTEMPTS,
    },
    extraction,
    chapter,
  };
}
