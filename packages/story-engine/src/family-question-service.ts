import type {
  FamilyQuestionRepository,
  InterviewRecord,
  QueuedFamilyQuestionRecord,
} from '@story-keeper/database';
import { FamilyQuestionRepositoryError } from '@story-keeper/database';

import { StoryKeeperError } from './errors.js';

export interface QueueFamilyQuestionResult {
  readonly queuedQuestionId: string;
  readonly status: 'queued';
}

export interface PlannedFamilyQuestion {
  readonly queuedQuestionId: string;
  readonly sourceReferenceId: string;
  readonly text: string;
}

export class FamilyQuestionService {
  public constructor(private readonly questions: FamilyQuestionRepository) {}

  public queueFamilyQuestion(
    familyId: string,
    fromPersonId: string,
    toPersonId: string,
    questionText: string,
  ): QueueFamilyQuestionResult {
    try {
      const question = this.questions.queueQuestion({
        familyId,
        fromPersonId,
        toPersonId,
        questionText,
      });
      return { queuedQuestionId: question.id, status: 'queued' };
    } catch (error: unknown) {
      if (!(error instanceof FamilyQuestionRepositoryError)) throw error;
      throw new StoryKeeperError(error.code, error.message);
    }
  }

  public planNextQuestion(interview: InterviewRecord): PlannedFamilyQuestion | undefined {
    const question = this.questions.findNextQueuedQuestion(
      interview.familyId,
      interview.narratorPersonId,
    );
    return question === undefined ? undefined : toPlannedQuestion(question);
  }
}

function toPlannedQuestion(question: QueuedFamilyQuestionRecord): PlannedFamilyQuestion {
  return {
    queuedQuestionId: question.id,
    sourceReferenceId: `family_queue:${question.id}`,
    text: `${question.fromDisplayName} left you a question. They asked: “${question.questionText}”`,
  };
}
