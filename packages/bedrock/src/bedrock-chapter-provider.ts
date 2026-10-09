import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ConverseCommandOutput,
} from '@aws-sdk/client-bedrock-runtime';
import {
  chapterGenerationJsonSchema,
  chapterGenerationSchema,
  type ChapterGeneration,
  type ChapterGenerationRequest,
} from '@story-keeper/shared';

import {
  ChapterGenerationProviderError,
  type ChapterGenerationProvider,
} from './chapter-provider.js';

export interface BedrockChapterGenerationConfig {
  readonly region: string;
  readonly modelId: string;
  readonly temperature: number;
  readonly maxTokens: number;
  readonly timeoutMs: number;
  readonly sdkMaxAttempts: number;
}

interface ConverseSender {
  send(
    command: ConverseCommand,
    options: { abortSignal: AbortSignal },
  ): Promise<ConverseCommandOutput>;
}

export class BedrockChapterGenerationProvider implements ChapterGenerationProvider {
  private readonly client: ConverseSender;

  public constructor(
    private readonly config: BedrockChapterGenerationConfig,
    client?: ConverseSender,
  ) {
    this.client =
      client ??
      new BedrockRuntimeClient({
        region: config.region,
        maxAttempts: config.sdkMaxAttempts,
      });
  }

  public async generate(request: ChapterGenerationRequest): Promise<ChapterGeneration> {
    try {
      const response = await this.client.send(
        new ConverseCommand({
          modelId: this.config.modelId,
          system: [{ text: chapterSystemPrompt }],
          messages: [{ role: 'user', content: [{ text: buildChapterPrompt(request) }] }],
          inferenceConfig: {
            temperature: this.config.temperature,
            maxTokens: this.config.maxTokens,
          },
          outputConfig: {
            textFormat: {
              type: 'json_schema',
              structure: {
                jsonSchema: {
                  name: 'grounded_story_chapter',
                  description: 'A chapter grounded only in supplied approved sources.',
                  schema: JSON.stringify(chapterGenerationJsonSchema),
                },
              },
            },
          },
        }),
        { abortSignal: AbortSignal.timeout(this.config.timeoutMs) },
      );
      const text = extractResponseText(response);
      return chapterGenerationSchema.parse(JSON.parse(text) as unknown);
    } catch (error: unknown) {
      if (error instanceof ChapterGenerationProviderError) throw error;
      throw toProviderError(error);
    }
  }
}

const chapterSystemPrompt = `Write one family-history chapter using only the supplied approved structured sources.
Do not invent names, dates, relationships, locations, dialogue, emotions as fact, or causal explanations.
Preserve uncertainty and approximate dates exactly as supplied.
Omit unsupported details instead of filling gaps.
The prose may be coherent and warm, but every historical statement must be supported by a listed source.
Return only the requested structured result and cite only source references from the supplied set.`;

function buildChapterPrompt(request: ChapterGenerationRequest): string {
  return JSON.stringify({
    task: 'Draft a grounded family-history chapter.',
    topic: request.topic,
    narrator: request.narrator,
    approvedSources: request.sources,
  });
}

function extractResponseText(response: ConverseCommandOutput): string {
  const content = response.output?.message?.content ?? [];
  const text = content.find((block) => 'text' in block)?.text;
  if (text === undefined || text.length === 0) {
    throw new ChapterGenerationProviderError(
      'BEDROCK_EMPTY_RESPONSE',
      false,
      'Bedrock returned no structured chapter text.',
    );
  }
  return text;
}

function toProviderError(error: unknown): ChapterGenerationProviderError {
  const name = error instanceof Error ? error.name : 'UnknownError';
  const retryable = new Set([
    'AbortError',
    'InternalServerException',
    'ModelNotReadyException',
    'ModelTimeoutException',
    'ServiceUnavailableException',
    'ThrottlingException',
  ]).has(name);
  return new ChapterGenerationProviderError(
    retryable ? 'BEDROCK_TRANSIENT' : 'BEDROCK_INVALID_RESPONSE',
    retryable,
    retryable
      ? 'The Bedrock chapter request failed transiently.'
      : 'The Bedrock chapter response could not be validated.',
    error instanceof Error ? { cause: error } : undefined,
  );
}
