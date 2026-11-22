import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { AuthApi } from './auth-api';

describe('AuthApi', () => {
  let api: AuthApi;
  let http: HttpTestingController;
  const url = (path: string) => `${environment.apiBaseUrl}/auth/${path}`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(AuthApi);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('asks /auth/me who is signed in', () => {
    api.me().subscribe();
    const req = http.expectOne(url('me'));
    expect(req.request.method).toBe('GET');
    req.flush({ user: null });
  });

  it('posts the registration in the body', () => {
    const request = {
      email: 'jan@example.com',
      password: 'correct horse battery',
      acceptTerms: true,
    };
    api.register(request).subscribe();
    const req = http.expectOne(url('register'));
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(request);
    req.flush({ status: 'ok' });
  });

  it('posts credentials and tokens in the body, never in the URL', () => {
    api.login('jan@example.com', 'secret passphrase').subscribe();
    api.verifyEmail('one-time-token').subscribe();
    api.resetPassword('reset-token', 'new passphrase').subscribe();

    const login = http.expectOne(url('login'));
    expect(login.request.body).toEqual({ email: 'jan@example.com', password: 'secret passphrase' });
    const verify = http.expectOne(url('verify-email'));
    expect(verify.request.body).toEqual({ token: 'one-time-token' });
    const reset = http.expectOne(url('reset-password'));
    expect(reset.request.body).toEqual({ token: 'reset-token', password: 'new passphrase' });

    for (const req of [login, verify, reset]) {
      expect(req.request.method).toBe('POST');
      expect(req.request.urlWithParams).not.toMatch(/secret|token|passphrase|@/);
      req.flush({});
    }
  });

  it('covers resend, forgot password and logout', () => {
    api.resendVerification('jan@example.com').subscribe();
    api.forgotPassword('jan@example.com').subscribe();
    api.logout().subscribe();

    const resend = http.expectOne(url('resend-verification'));
    expect(resend.request.body).toEqual({ email: 'jan@example.com' });
    const forgot = http.expectOne(url('forgot-password'));
    expect(forgot.request.body).toEqual({ email: 'jan@example.com' });
    const logout = http.expectOne(url('logout'));
    expect(logout.request.method).toBe('POST');
    expect(logout.request.body).toEqual({});
    for (const req of [resend, forgot, logout]) req.flush({ status: 'ok' });
  });
});
