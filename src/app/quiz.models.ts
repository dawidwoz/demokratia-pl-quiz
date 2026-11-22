// Payload types of the quiz API (api/handler.js). Keep in sync with the API.

export type Answer = 'za' | 'przeciw' | 'wstrzymuje';

export const ANSWER_LABELS: Record<Answer, string> = {
  za: 'Za',
  przeciw: 'Przeciw',
  wstrzymuje: 'Wstrzymuję się',
};

export interface QuizSummary {
  id: number;
  title: string;
  description: string | null;
  isSample: boolean;
  questionCount: number;
}

export interface QuestionSource {
  label: string;
  url: string | null;
  date: string | null;
}

export interface Question {
  id: number;
  text: string;
  source: QuestionSource;
}

export interface Party {
  id: number;
  name: string;
}

export interface Quiz {
  id: number;
  title: string;
  isSample: boolean;
  minAnswered: number;
  questions: Question[];
  parties: Party[];
}

export interface SubmittedAnswer {
  questionId: number;
  answer: Answer;
}

export interface PartyResult {
  id: number;
  name: string;
  /** Rounded whole percent, or null when the party has no stance on any answered question. */
  percent: number | null;
  /** Number of answered questions this party has a stance on. */
  counted: number;
}

/** One party's stance on one question, with the reasoning and where it comes from. */
export interface PartyPosition {
  partyId: number;
  stance: Answer;
  /** Null when the data has no justification (the sample content has none). */
  justification: string | null;
  source: QuestionSource;
}

/** Stances of the parties that have one on this question; a party without a stance is absent. */
export interface QuestionPositions {
  id: number;
  positions: PartyPosition[];
}

export interface QuizResult {
  answered: number;
  total: number;
  parties: PartyResult[];
  /** Every question of the quiz in quiz order (also the skipped ones), positions by party id. */
  questions: QuestionPositions[];
}
