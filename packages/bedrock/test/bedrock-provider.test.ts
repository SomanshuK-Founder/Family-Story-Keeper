import type { ConverseCommand, ConverseCommandOutput } from '@aws-sdk/client-bedrock-runtime';
import { describe, expect, it } from 'vitest';

import { BedrockStoryExtractionProvider } from '../src/bedrock-provider.js';

const emptyExtraction = {
  people: [],
  relationships: [],
  events: [],
  places: [],
  dateMentions: [],
  factCandidates: [],
  followUpCandidates: [],
};

describe('BedrockStoryExtractionProvider', () => {
  it('uses Converse structured output and validates the returned JSON without calling AWS', async () => {
    let captured: ConverseCommand | undefined;
    const provider = new BedrockStoryExtractionProvider(
      {
        region: 'us-east-1',
        modelId: 'test-model',
        temperature: 0,
        maxTokens: 512,
        timeoutMs: 1_000,
        sdkMaxAttempts: 2,
      },
      {
        send: (command) => {
          captured = command;
          return Promise.resolve(responseWithText(JSON.stringify(emptyExtraction)));
        },
      },
    );

    await expect(
      provider.extract({
        answerId: '00000000-0000-4000-8000-000000000001',
        rawAnswer: 'I do not remember.',
        narrator: {
          reference: 'narrator',
          id: '00000000-0000-4000-8000-000000000002',
          displayName: 'Rosa',
        },
        question: {
          id: '00000000-0000-4000-8000-000000000003',
          text: 'What do you remember?',
        },
        knownPeople: [],
      }),
    ).resolves.toEqual(emptyExtraction);
    expect(captured?.input.modelId).toBe('test-model');
    expect(captured?.input.outputConfig?.textFormat?.type).toBe('json_schema');
    expect(captured?.input.system?.[0]?.text).toContain('Never invent');
  });

  it('rejects malformed model JSON', async () => {
    const provider = new BedrockStoryExtractionProvider(
      {
        region: 'us-east-1',
        modelId: 'test-model',
        temperature: 0,
        maxTokens: 512,
        timeoutMs: 1_000,
        sdkMaxAttempts: 1,
      },
      { send: () => Promise.resolve(responseWithText('{not-json')) },
    );

    await expect(
      provider.extract({
        answerId: '00000000-0000-4000-8000-000000000001',
        rawAnswer: 'Answer',
        narrator: {
          reference: 'narrator',
          id: '00000000-0000-4000-8000-000000000002',
          displayName: 'Rosa',
        },
        question: {
          id: '00000000-0000-4000-8000-000000000003',
          text: 'Question',
        },
        knownPeople: [],
      }),
    ).rejects.toMatchObject({ code: 'BEDROCK_INVALID_RESPONSE', retryable: false });
  });
});

function responseWithText(text: string): ConverseCommandOutput {
  return {
    $metadata: {},
    output: { message: { role: 'assistant', content: [{ text }] } },
    stopReason: 'end_turn',
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    metrics: { latencyMs: 1 },
  };
}
