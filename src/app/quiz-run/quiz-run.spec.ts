import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { environment } from '../../environments/environment';
import { Quiz, QuizResult } from '../quiz.models';
import { QuizRun } from './quiz-run';

const quiz: Quiz = {
  id: 1,
  title: 'Quiz',
  isSample: true,
  minAnswered: 4,
  questions: Array.from({ length: 8 }, (_, i) => ({
    id: i + 1,
    text: `Pytanie ${i + 1}`,
    source: { label: `Źródło ${i + 1}`, url: null, date: '2025-02-11' },
  })),
  parties: [
    { id: 1, name: 'Partia A' },
    { id: 2, name: 'Partia B' },
  ],
};

const result: QuizResult = {
  answered: 4,
  total: 8,
  parties: [
    { id: 1, name: 'Partia A', percent: 63, counted: 4 },
    { id: 2, name: 'Partia B', percent: null, counted: 0 },
  ],
};

describe('QuizRun', () => {
  let fixture: ComponentFixture<QuizRun>;
  let http: HttpTestingController;
  let el: HTMLElement;

  const click = (selector: string) => {
    const button = el.querySelector<HTMLButtonElement>(selector);
    if (!button) throw new Error(`no element for ${selector}`);
    button.click();
    fixture.detectChanges();
  };
  const answer = (value: string) => click(`[data-answer="${value}"]`);
  const skip = () => click('[data-action="skip"]');
  const submitButton = () => el.querySelector<HTMLButtonElement>('[data-action="submit"]');

  // Node 25's built-in localStorage shadows jsdom's and has no methods, so watch the Storage API
  // itself: any browser-storage write by the component would go through Storage.prototype.setItem.
  let storageWrites: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    storageWrites = vi.spyOn(Storage.prototype, 'setItem');
    TestBed.configureTestingModule({
      imports: [QuizRun],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(QuizRun);
    fixture.componentRef.setInput('id', '1');
    el = fixture.nativeElement;
    fixture.detectChanges();
    http.expectOne(`${environment.apiBaseUrl}/quizzes/1`).flush(quiz);
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    storageWrites.mockRestore();
  });

  // Answers questions 1-3, skips 4-8: three answered, which is below half of eight.
  const answerThreeSkipRest = () => {
    answer('za');
    answer('przeciw');
    answer('wstrzymuje');
    for (let i = 0; i < 5; i++) skip();
  };

  it('shows the question source and date on every question screen', () => {
    for (let n = 1; n <= 8; n++) {
      expect(el.textContent).toContain(`Źródło ${n}`);
      expect(el.textContent).toContain('11.02.2025');
      skip();
    }
  });

  it('disables "Pokaż wynik" at 3 of 8 answered and enables it at 4 of 8', () => {
    answerThreeSkipRest();
    expect(submitButton()?.disabled).toBe(true);
    expect(el.querySelector('[data-testid="gate-hint"]')?.textContent).toContain('4 z 8');

    click('[data-action="back"]'); // question 7
    answer('za'); // question 7 answered, moves to the last question
    expect(submitButton()?.disabled).toBe(false);
    expect(el.querySelector('[data-testid="gate-hint"]')).toBeNull();
  });

  it('does not count skipped questions as answered', () => {
    answer('za');
    skip();
    skip();
    skip();
    skip();
    skip();
    skip();
    skip(); // last question, answered count stays at 1
    expect(submitButton()?.disabled).toBe(true);
  });

  it('posts only the answered questions and renders the result', () => {
    answerThreeSkipRest();
    click('[data-action="back"]');
    answer('za');
    click('[data-action="submit"]');

    const req = http.expectOne(`${environment.apiBaseUrl}/quizzes/1/result`);
    expect(req.request.body).toEqual({
      answers: [
        { questionId: 1, answer: 'za' },
        { questionId: 2, answer: 'przeciw' },
        { questionId: 3, answer: 'wstrzymuje' },
        { questionId: 7, answer: 'za' },
      ],
    });
    req.flush(result);
    fixture.detectChanges();

    expect(el.textContent).toContain('63%');
    expect(el.textContent).toContain('na podstawie 4 z 8 pytań');
    expect(el.textContent).toContain('brak danych');
  });

  it('shows an explanation when the API answers 422', () => {
    answerThreeSkipRest();
    click('[data-action="back"]');
    answer('za');
    click('[data-action="submit"]');
    http
      .expectOne(`${environment.apiBaseUrl}/quizzes/1/result`)
      .flush({ code: 'insufficient_answers' }, { status: 422, statusText: 'Unprocessable' });
    fixture.detectChanges();
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('co najmniej 4');
  });

  it('never writes answers to localStorage or sessionStorage', () => {
    answerThreeSkipRest();
    click('[data-action="back"]');
    answer('za');
    click('[data-action="submit"]');
    http.expectOne(`${environment.apiBaseUrl}/quizzes/1/result`).flush(result);
    fixture.detectChanges();
    expect(storageWrites).not.toHaveBeenCalled();
  });
});
