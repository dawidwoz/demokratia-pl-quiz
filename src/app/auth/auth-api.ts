import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { LoginResponse, MeResponse, RegisterRequest, StatusResponse } from './auth.models';

/**
 * Thin typed wrapper over `/api/auth/*`. Same-origin cookies carry the session, so there is no token
 * handling here and nothing is ever written to browser storage. Passwords and one-time tokens go only
 * in POST bodies, never in a URL.
 */
@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiBaseUrl}/auth`;

  me(): Observable<MeResponse> {
    return this.http.get<MeResponse>(`${this.base}/me`);
  }

  register(request: RegisterRequest): Observable<StatusResponse> {
    return this.http.post<StatusResponse>(`${this.base}/register`, request);
  }

  verifyEmail(token: string): Observable<StatusResponse> {
    return this.http.post<StatusResponse>(`${this.base}/verify-email`, { token });
  }

  resendVerification(email: string): Observable<StatusResponse> {
    return this.http.post<StatusResponse>(`${this.base}/resend-verification`, { email });
  }

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.base}/login`, { email, password });
  }

  logout(): Observable<StatusResponse> {
    return this.http.post<StatusResponse>(`${this.base}/logout`, {});
  }

  forgotPassword(email: string): Observable<StatusResponse> {
    return this.http.post<StatusResponse>(`${this.base}/forgot-password`, { email });
  }

  resetPassword(token: string, password: string): Observable<StatusResponse> {
    return this.http.post<StatusResponse>(`${this.base}/reset-password`, { token, password });
  }
}
