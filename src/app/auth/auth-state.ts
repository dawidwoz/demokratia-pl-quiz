import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { AuthApi } from './auth-api';
import { AuthUser, LoginResponse, StatusResponse } from './auth.models';

/**
 * Who is signed in, as a signal. The session itself lives in an HttpOnly cookie the browser manages,
 * so this service keeps the user in memory only: it must never touch localStorage, sessionStorage or
 * cookies (the quiz's anonymity contract, see QuizRun). It is started without being awaited, so a slow
 * or failing `/auth/me` never delays the quiz.
 */
@Injectable({ providedIn: 'root' })
export class AuthState {
  private readonly api = inject(AuthApi);

  readonly user = signal<AuthUser | null>(null);
  /** False until the first `/auth/me` answer, so the header does not flash the wrong links. */
  readonly ready = signal(false);

  refresh(): void {
    this.api.me().subscribe({
      next: (response) => {
        this.user.set(response.user);
        this.ready.set(true);
      },
      // The API being unreachable means "not signed in" for the header; the quiz is unaffected.
      error: () => {
        this.user.set(null);
        this.ready.set(true);
      },
    });
  }

  login(email: string, password: string): Observable<LoginResponse> {
    return this.api.login(email, password).pipe(
      tap((response) => {
        this.user.set(response.user);
        this.ready.set(true);
      }),
    );
  }

  logout(): Observable<StatusResponse> {
    return this.api.logout().pipe(tap(() => this.user.set(null)));
  }
}
