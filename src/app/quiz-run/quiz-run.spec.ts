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
  // Partia A has a stance on every question (the first with a linked source); Partia B only on the
  // first one, and without a justification.
  questions: quiz.questions.map((question) => ({
    id: question.id,
    positions: [
      {
        partyId: 1,
        stance: 'za' as const,
        justification: `Uzasadnienie A${question.id}`,
        source: {
          label: `Źródło stanowiska ${question.id}`,
          url: question.id === 1 ? 'https://example.org/glosowanie' : null,
          date: '2025-03-05',
        },
      },
      ...(question.id === 1
        ? [
            {
              partyId: 2,
              stance: 'przeciw' as const,
              justification: null,
              source: { label: 'Źródło B1', url: null, date: '2025-04-01' },
            },
          ]
        : []),
    ],
  })),
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
    // The denominator is the number of questions the user answered (4), not the quiz total (8).
    expect(el.textContent).toContain('na podstawie 4 z 4 pytań');
    expect(el.textContent).toContain('brak danych');
  });

  describe('result details ("Dlaczego taki wynik")', () => {
    // Answers 1-3 and 7, skips the rest, submits and shows the given result.
    const showResult = (shown: QuizResult = result) => {
      answerThreeSkipRest();
      click('[data-action="back"]');
      answer('za');
      click('[data-action="submit"]');
      http.expectOne(`${environment.apiBaseUrl}/quizzes/1/result`).flush(shown);
      fixture.detectChanges();
    };
    const blocks = () => Array.from(el.querySelectorAll('[data-testid="question-details"]'));
    const block = (number: number) => blocks()[number - 1] as HTMLDetailsElement;

    it('renders one collapsed block per question, skipped ones included', () => {
      showResult();
      expect(blocks().length).toBe(8);
      expect(blocks().every((item) => !(item as HTMLDetailsElement).open)).toBe(true);
      expect(block(1).textContent).toContain('1. Pytanie 1');
      expect(block(8).textContent).toContain('8. Pytanie 8');
    });

    it('shows the user’s own answer, or that the question was skipped', () => {
      showResult();
      expect(block(1).querySelector('summary')?.textContent).toContain('Twoja odpowiedź: Za');
      expect(block(2).querySelector('summary')?.textContent).toContain('Twoja odpowiedź: Przeciw');
      expect(block(3).querySelector('summary')?.textContent).toContain(
        'Twoja odpowiedź: Wstrzymuję się',
      );
      expect(block(4).querySelector('summary')?.textContent).toContain('Pominięte');
      expect(block(4).querySelector('summary')?.textContent).not.toContain('Twoja odpowiedź');
    });

    it('shows each party’s stance with justification, source link and date', () => {
      showResult();
      const text = block(1).textContent ?? '';
      expect(text).toContain('Partia A:');
      expect(text).toContain('Uzasadnienie A1');
      expect(text).toContain('Źródło stanowiska 1');
      expect(text).toContain('05.03.2025');
      const link = block(1).querySelector<HTMLAnchorElement>(
        'a[href="https://example.org/glosowanie"]',
      );
      expect(link?.textContent).toContain('Źródło stanowiska 1');
      expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
      expect(link?.getAttribute('target')).toBe('_blank');
      // Without a URL the label is shown as plain text, not as a link.
      expect(block(2).querySelector('a')).toBeNull();
      expect(block(2).textContent).toContain('Źródło stanowiska 2');
    });

    it('names the stance as text', () => {
      showResult();
      const rows = block(1).querySelectorAll('.stance');
      expect(Array.from(rows).map((row) => row.textContent?.trim())).toEqual(['Za', 'Przeciw']);
    });

    it('shows "Brak stanowiska" for a party without a stance and a note for a missing justification', () => {
      showResult();
      expect(block(2).textContent).toMatch(/Partia B:\s*Brak stanowiska/);
      expect(block(1).textContent).toContain('Brak uzasadnienia w danych');
      expect(block(2).textContent).not.toContain('Brak uzasadnienia w danych');
    });

    it('lists parties in the quiz order, whatever the ranking of the result is', () => {
      // The API ranks Partia B first here; the details must still start with Partia A.
      const ranked: QuizResult = {
        ...result,
        parties: [
          { id: 2, name: 'Partia B', percent: 80, counted: 1 },
          { id: 1, name: 'Partia A', percent: 10, counted: 4 },
        ],
        questions: result.questions.map((item) => ({
          ...item,
          positions: item.id === 1 ? [...item.positions].reverse() : item.positions,
        })),
      };
      showResult(ranked);
      const names = Array.from(block(1).querySelectorAll('.positions li strong')).map((n) =>
        n.textContent?.trim(),
      );
      expect(names).toEqual(['Partia A:', 'Partia B:']);
    });

    it('renders justification text as text, never as HTML', () => {
      const hostile: QuizResult = {
        ...result,
        questions: result.questions.map((item) => ({
          ...item,
          positions: item.positions.map((position) => ({
            ...position,
            justification: '<b>pogrubione</b><img src="x" onerror="alert(1)">',
          })),
        })),
      };
      showResult(hostile);
      expect(block(1).textContent).toContain('<b>pogrubione</b>');
      expect(block(1).querySelector('b')).toBeNull();
      expect(block(1).querySelector('img')).toBeNull();
    });

    it('"Rozwiąż jeszcze raz" clears the details together with the answers', () => {
      showResult();
      click('.actions button.button');
      expect(blocks().length).toBe(0);
      expect(el.textContent).toContain('Pytanie 1 z 8');
    });
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

  it('reloads the quiz and drops old answers when only the route id changes', () => {
    answer('za');
    expect(el.querySelector('[aria-pressed="true"]')).toBeNull(); // moved on to question 2
    click('[data-action="back"]');
    expect(el.querySelector('[aria-pressed="true"]')).not.toBeNull(); // question 1 is answered

    fixture.componentRef.setInput('id', '2');
    fixture.detectChanges();
    http.expectOne(`${environment.apiBaseUrl}/quizzes/2`).flush({
      ...quiz,
      id: 2,
      questions: [
        { id: 21, text: 'Inne pytanie', source: { label: 'Inne źródło', url: null, date: null } },
      ],
      minAnswered: 1,
    });
    fixture.detectChanges();

    expect(el.textContent).toContain('Inne pytanie');
    expect(el.textContent).toContain('Pytanie 1 z 1');
    expect(el.querySelector('[aria-pressed="true"]')).toBeNull();
  });

  it('ignores a late response from a previous id', () => {
    fixture.componentRef.setInput('id', '2');
    fixture.detectChanges();
    const second = http.expectOne(`${environment.apiBaseUrl}/quizzes/2`);
    fixture.componentRef.setInput('id', '3');
    fixture.detectChanges();
    const third = http.expectOne(`${environment.apiBaseUrl}/quizzes/3`);
    expect(second.cancelled).toBe(true);
    third.flush({ ...quiz, id: 3 });
    fixture.detectChanges();
    expect(el.textContent).toContain('Pytanie 1 z 8');
  });
});

describe('QuizRun with a quiz that has no questions', () => {
  it('shows a message with a way back instead of a blank page', () => {
    TestBed.configureTestingModule({
      imports: [QuizRun],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(QuizRun);
    fixture.componentRef.setInput('id', '1');
    fixture.detectChanges();
    http
      .expectOne(`${environment.apiBaseUrl}/quizzes/1`)
      .flush({ ...quiz, questions: [], minAnswered: 0 });
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Ten quiz nie ma jeszcze pytań');
    expect(el.querySelector('a[href="/"]')).not.toBeNull();
    http.verify();
  });
});
