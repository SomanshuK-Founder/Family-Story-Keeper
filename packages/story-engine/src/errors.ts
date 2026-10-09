export type StoryKeeperErrorCode =
  | 'FAMILY_NOT_FOUND'
  | 'PERSON_NOT_IN_FAMILY'
  | 'INTERVIEW_NOT_FOUND'
  | 'QUESTION_NOT_IN_INTERVIEW'
  | 'QUESTION_ALREADY_ANSWERED'
  | 'QUESTION_NOT_ACTIVE'
  | 'CONTRADICTION_NOT_FOUND'
  | 'CONFLICT_ALREADY_RESOLVED'
  | 'INVALID_CONFLICT_RESOLUTION'
  | 'ACTOR_NOT_AUTHORIZED'
  | 'STORY_ITEM_NOT_FOUND'
  | 'STORY_ITEM_NOT_RELEVANT'
  | 'STORY_ITEM_STATE_CONFLICT'
  | 'STORY_ITEM_PROVENANCE_REQUIRED'
  | 'STORY_ITEM_IDENTITY_UNRESOLVED';

export class StoryKeeperError extends Error {
  public constructor(
    public readonly code: StoryKeeperErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'StoryKeeperError';
  }
}
