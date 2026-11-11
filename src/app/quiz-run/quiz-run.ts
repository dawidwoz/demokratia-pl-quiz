import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { QuizApi } from '../quiz-api';
import { ANSWER_LABELS, Answer, Quiz, QuizResult } from '../quiz.models';

/**
 * Runs one quiz: one question per screen, then the result as another state of this component.
 * Answers live only in the `answers` signal. They are never written to the URL, router state or
 * browser storage (PRD: anonymous answers leave no trace).
 */
@Component({
  selector: 'app-quiz-run',
  imports: [DatePipe, RouterLink],
  templateUrl: './quiz-run.html',
  styleUrl: './quiz-run.scss',
})
export class QuizRun implements OnInit {
  private readonly api = inject(QuizApi);

  /** Route parameter `id` (bound via withComponentInputBinding). */
  readonly id = input.required<string>();

  protected readonly options: Answer[] = ['za', 'przeciw', 'wstrzymuje'];
  protected readonly labels = ANSWER_LABELS;

  protected readonly quiz = signal<Quiz | null>(null);
  protected readonly loadFailed = signal(false);
  protected readonly index = signal(0);
  protected readonly answers = signal<Record<number, Answer>>({});
  protected readonly result = signal<QuizResult | null>(null);
  protected readonly submitting = signal(false);
  protected readonly submitError = signal<string | null>(null);

  protected readonly question = computed(() => this.quiz()?.questions[this.index()] ?? null);
  protected readonly total = computed(() => this.quiz()?.questions.length ?? 0);
  protected readonly isLast = computed(() => this.index() >= this.total() - 1);
  protected readonly answeredCount = computed(() => Object.keys(this.answers()).length);
  protected readonly canSubmit = computed(() => {
    const quiz = this.quiz();
    return quiz !== null && this.answeredCount() >= quiz.minAnswered;
  });
  protected readonly selected = computed(() => {
    const question = this.question();
    return question ? (this.answers()[question.id] ?? null) : null;
  });

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    const id = Number(this.id());
    this.loadFailed.set(false);
    if (!Number.isInteger(id) || id < 1) {
      this.loadFailed.set(true);
      return;
    }
    this.api.getQuiz(id).subscribe({
      next: (quiz) => this.quiz.set(quiz),
      error: () => this.loadFailed.set(true),
    });
  }

  protected choose(answer: Answer): void {
    const question = this.question();
    if (!question) return;
    this.answers.update((current) => ({ ...current, [question.id]: answer }));
    this.submitError.set(null);
    this.advance();
  }

  protected skip(): void {
    const question = this.question();
    if (!question) return;
    this.answers.update((current) => {
      const { [question.id]: _removed, ...rest } = current;
      return rest;
    });
    this.advance();
  }

  protected back(): void {
    this.index.update((value) => Math.max(0, value - 1));
  }

  protected submit(): void {
    const quiz = this.quiz();
    if (!quiz || !this.canSubmit() || this.submitting()) return;
    const current = this.answers();
    const payload = quiz.questions
      .filter((question) => current[question.id] !== undefined)
      .map((question) => ({ questionId: question.id, answer: current[question.id] }));

    this.submitting.set(true);
    this.submitError.set(null);
    this.api.submitAnswers(quiz.id, payload).subscribe({
      next: (result) => {
        this.result.set(result);
        this.submitting.set(false);
      },
      error: (error: unknown) => {
        this.submitting.set(false);
        this.submitError.set(this.describeSubmitError(error, quiz.minAnswered));
      },
    });
  }

  protected restart(): void {
    this.answers.set({});
    this.index.set(0);
    this.result.set(null);
    this.submitError.set(null);
  }

  private advance(): void {
    if (!this.isLast()) this.index.update((value) => value + 1);
  }

  private describeSubmitError(error: unknown, minAnswered: number): string {
    if (error instanceof HttpErrorResponse && error.status === 422) {
      return `Aby zobaczyć wynik, odpowiedz na co najmniej ${minAnswered} pytań.`;
    }
    return 'Nie udało się obliczyć wyniku. Spróbuj ponownie za chwilę.';
  }
}
