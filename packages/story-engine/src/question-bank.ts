export interface PhaseOneQuestion {
  readonly key: string;
  readonly text: string;
}

export const phaseOneQuestionBank: readonly PhaseOneQuestion[] = [
  {
    key: 'childhood-street',
    text: 'What do you remember about the street you grew up on?',
  },
  {
    key: 'childhood-home',
    text: 'What was your childhood home like?',
  },
  {
    key: 'childhood-close-person',
    text: 'Who were you closest to when you were young?',
  },
];
