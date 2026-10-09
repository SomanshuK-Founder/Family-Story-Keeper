import type { ConverseCommand, ConverseCommandOutput } from '@aws-sdk/client-bedrock-runtime';
import { describe, expect, it } from 'vitest';

import { BedrockStoryExtractionProvider } from '../src/bedrock-provider.js';
import { BedrockChapterGenerationProvider } from '../src/bedrock-chapter-provider.js';

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

describe('BedrockChapterGenerationProvider', () => {
  const factId = '00000000-0000-4000-8000-000000000010';
  const eventId = '00000000-0000-4000-8000-000000000011';
  const request = {
    chapterDraftId: '00000000-0000-4000-8000-000000000012',
    topic: 'childhood',
    narrator: {
      id: '00000000-0000-4000-8000-000000000002',
      displayName: 'Rosa',
    },
    sources: [
      { type: 'fact' as const, id: factId, label: 'Home city: Delhi', content: 'Home city: Delhi' },
      {
        type: 'timeline_event' as const,
        id: eventId,
        label: 'Moved to Delhi',
        content: 'Moved to Delhi. The move was remembered. Date: around 1962–1964.',
      },
    ],
  };

  it('uses Converse structured output and sends only bounded approved sources', async () => {
    let captured: ConverseCommand | undefined;
    const result = {
      title: 'Rosa’s Early Years',
      body: 'Rosa remembered Delhi and an approximate move between 1962 and 1964.',
      usedSources: [
        { type: 'fact', id: factId },
        { type: 'timeline_event', id: eventId },
      ],
    };
    const provider = new BedrockChapterGenerationProvider(
      {
        region: 'us-east-1',
        modelId: 'test-model',
        temperature: 0.2,
        maxTokens: 1_024,
        timeoutMs: 1_000,
        sdkMaxAttempts: 2,
      },
      {
        send: (command) => {
          captured = command;
          return Promise.resolve(responseWithText(JSON.stringify(result)));
        },
      },
    );

    await expect(provider.generate(request)).resolves.toEqual(result);
    expect(captured?.input.outputConfig?.textFormat?.type).toBe('json_schema');
    expect(captured?.input.system?.[0]?.text).toContain('Do not invent');
    const prompt = captured?.input.messages?.[0]?.content?.[0];
    expect(prompt && 'text' in prompt ? prompt.text : '').toContain('approvedSources');
    expect(prompt && 'text' in prompt ? prompt.text : '').not.toContain('rawAnswer');
  });

  it.each([
    ['malformed JSON', '{not-json'],
    [
      'unknown fields',
      JSON.stringify({
        title: 'Title',
        body: 'Body',
        usedSources: [{ type: 'fact', id: factId }],
        extra: true,
      }),
    ],
    [
      'empty body',
      JSON.stringify({ title: 'Title', body: '', usedSources: [{ type: 'fact', id: factId }] }),
    ],
    [
      'oversized title',
      JSON.stringify({
        title: 'x'.repeat(201),
        body: 'Body',
        usedSources: [{ type: 'fact', id: factId }],
      }),
    ],
    [
      'oversized body',
      JSON.stringify({
        title: 'Title',
        body: 'x'.repeat(10_001),
        usedSources: [{ type: 'fact', id: factId }],
      }),
    ],
  ])('rejects %s before domain publication', async (_caseName, responseText) => {
    const provider = new BedrockChapterGenerationProvider(
      {
        region: 'us-east-1',
        modelId: 'test-model',
        temperature: 0.2,
        maxTokens: 1_024,
        timeoutMs: 1_000,
        sdkMaxAttempts: 1,
      },
      { send: () => Promise.resolve(responseWithText(responseText)) },
    );

    await expect(provider.generate(request)).rejects.toMatchObject({
      code: 'BEDROCK_INVALID_RESPONSE',
      retryable: false,
    });
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
