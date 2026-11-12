import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../environments/environment';
import { QuizApi } from './quiz-api';

describe('QuizApi', () => {
  let api: QuizApi;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(QuizApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists quizzes from /quizzes', () => {
    api.listQuizzes().subscribe();
    const req = http.expectOne(`${environment.apiBaseUrl}/quizzes`);
    expect(req.request.method).toBe('GET');
    req.flush([]);
  });

  it('gets one quiz from /quizzes/:id', () => {
    api.getQuiz(7).subscribe();
    const req = http.expectOne(`${environment.apiBaseUrl}/quizzes/7`);
    expect(req.request.method).toBe('GET');
    req.flush({});
  });

  it('posts answers in the body, not in the URL', () => {
    const answers = [{ questionId: 1, answer: 'za' as const }];
    api.submitAnswers(7, answers).subscribe();
    const req = http.expectOne(`${environment.apiBaseUrl}/quizzes/7/result`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ answers });
    expect(req.request.url).not.toContain('za');
    req.flush({});
  });
});
