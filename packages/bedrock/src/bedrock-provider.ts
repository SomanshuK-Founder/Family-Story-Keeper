import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ConverseCommandOutput,
} from '@aws-sdk/client-bedrock-runtime';
import {
  storyExtractionJsonSchema,
  storyExtractionSchema,
  type StoryExtraction,
  type StoryExtractionRequest,
} from '@story-keeper/shared';

import { StoryExtractionProviderError, type StoryExtractionProvider } from './provider.js';

export interface BedrockStoryExtractionConfig {
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

export class BedrockStoryExtractionProvider implements StoryExtractionProvider {
  private readonly client: ConverseSender;

  public constructor(
    private readonly config: BedrockStoryExtractionConfig,
    client?: ConverseSender,
  ) {
    this.client =
      client ??
      new BedrockRuntimeClient({
        region: config.region,
        maxAttempts: config.sdkMaxAttempts,
      });
  }

  public async extract(request: StoryExtractionRequest): Promise<StoryExtraction> {
    try {
      const response = await this.client.send(
        new ConverseCommand({
          modelId: this.config.modelId,
          system: [{ text: extractionSystemPrompt }],
          messages: [{ role: 'user', content: [{ text: buildUserPrompt(request) }] }],
          inferenceConfig: {
            temperature: this.config.temperature,
            maxTokens: this.config.maxTokens,
          },
          outputConfig: {
            textFormat: {
              type: 'json_schema',
              structure: {
                jsonSchema: {
                  name: 'story_extraction',
                  description: 'Grounded Story Keeper extraction candidates.',
                  schema: JSON.stringify(storyExtractionJsonSchema),
                },
              },
            },
          },
        }),
        { abortSignal: AbortSignal.timeout(this.config.timeoutMs) },
      );
      const text = extractResponseText(response);
      return storyExtractionSchema.parse(JSON.parse(text) as unknown);
    } catch (error: unknown) {
      if (error instanceof StoryExtractionProviderError) throw error;
      throw toProviderError(error);
    }
  }
}

const extractionSystemPrompt = `You extract structured family-history candidates from one answer.
Use only information explicitly supported by the supplied answer, question, and bounded people list.
Never invent a person, date, place, relationship, event, or fact.
Preserve uncertainty: use exact only for an explicit single year, approximate/range when uncertain, and unknown otherwise.
Use narrator or supplied person references exactly. Give newly mentioned people unique local references and include them in people.
Do not assume that similar names are the same person. Return empty arrays when the answer supports nothing.
Facts, relationships, and events are candidates for later human review, never approved history.`;

function buildUserPrompt(request: StoryExtractionRequest): string {
  return JSON.stringify({
    task: 'Extract supported story-memory candidates.',
    narrator: request.narrator,
    question: request.question,
    answer: request.rawAnswer,
    knownPeople: request.knownPeople,
  });
}

function extractResponseText(response: ConverseCommandOutput): string {
  const content = response.output?.message?.content ?? [];
  const text = content.find((block) => 'text' in block)?.text;
  if (text === undefined || text.length === 0) {
    throw new StoryExtractionProviderError(
      'BEDROCK_EMPTY_RESPONSE',
      false,
      'Bedrock returned no structured extraction text.',
    );
  }
  return text;
}

function toProviderError(error: unknown): StoryExtractionProviderError {
  const name = error instanceof Error ? error.name : 'UnknownError';
  const retryableNames = new Set([
    'AbortError',
    'InternalServerException',
    'ModelNotReadyException',
    'ModelTimeoutException',
    'ServiceUnavailableException',
    'ThrottlingException',
  ]);
  const retryable = retryableNames.has(name);
  return new StoryExtractionProviderError(
    retryable ? 'BEDROCK_TRANSIENT' : 'BEDROCK_INVALID_RESPONSE',
    retryable,
    retryable
      ? 'The Bedrock request failed transiently.'
      : 'The Bedrock response could not be validated.',
    error instanceof Error ? { cause: error } : undefined,
  );
}
