import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../environments/environment';
import { Quiz, QuizResult, QuizSummary, SubmittedAnswer } from './quiz.models';

/** Thin typed wrapper over the quiz API. Answers go only in the POST body and are never stored. */
@Injectable({ providedIn: 'root' })
export class QuizApi {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  listQuizzes(): Observable<QuizSummary[]> {
    return this.http.get<QuizSummary[]>(`${this.base}/quizzes`);
  }

  getQuiz(id: number): Observable<Quiz> {
    return this.http.get<Quiz>(`${this.base}/quizzes/${id}`);
  }

  submitAnswers(id: number, answers: SubmittedAnswer[]): Observable<QuizResult> {
    return this.http.post<QuizResult>(`${this.base}/quizzes/${id}/result`, { answers });
  }
}
