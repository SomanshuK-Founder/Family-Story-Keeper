import { z } from 'zod';

const configSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  DATABASE_PATH: z.string().trim().min(1).default('./data/story-keeper.sqlite'),
});

export interface AppConfig {
  readonly port: number;
  readonly databasePath: string;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = configSchema.parse(environment);

  return {
    port: parsed.PORT,
    databasePath: parsed.DATABASE_PATH,
  };
}
