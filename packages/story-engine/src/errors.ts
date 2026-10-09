export type StoryKeeperErrorCode =
  | 'FAMILY_NOT_FOUND'
  | 'PERSON_NOT_IN_FAMILY'
  | 'INTERVIEW_NOT_FOUND'
  | 'QUESTION_NOT_IN_INTERVIEW'
  | 'QUESTION_ALREADY_ANSWERED';

export class StoryKeeperError extends Error {
  public constructor(
    public readonly code: StoryKeeperErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'StoryKeeperError';
  }
}
