import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { environment } from '../../../environments/environment';
import { AuthState } from '../auth-state';
import { Login } from './login';
import { watchStorageWrites } from '../../../testing/storage-watch';

const URL = `${environment.apiBaseUrl}/auth/login`;

describe('Login', () => {
  let fixture: ComponentFixture<Login>;
  let http: HttpTestingController;
  let el: HTMLElement;
  let navigate: ReturnType<typeof vi.spyOn>;
  let storage: ReturnType<typeof watchStorageWrites>;

  const type = (selector: string, value: string) => {
    const input = el.querySelector<HTMLInputElement>(selector);
    if (!input) throw new Error(`no element for ${selector}`);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const submit = () => {
    el.querySelector('form')?.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  };
  const fillAndSubmit = () => {
    type('#login-email', ' jan@example.com ');
    type('#login-password', 'correct horse battery');
    submit();
  };
  const errorText = () => el.querySelector('[data-testid="form-error"]')?.textContent ?? '';

  beforeEach(() => {
    storage = watchStorageWrites();
    TestBed.configureTestingModule({
      imports: [Login],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    fixture = TestBed.createComponent(Login);
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    expect(storage.writes()).toBe(0);
    storage.restore();
  });

  it('renders the fields, the forgot-password link and the sign-up hint', () => {
    expect(
      el.querySelector<HTMLInputElement>('#login-password')?.getAttribute('autocomplete'),
    ).toBe('current-password');
    expect(el.querySelector('a[href="/zapomniane-haslo"]')).not.toBeNull();
    expect(el.querySelector('a[href="/rejestracja"]')?.textContent).toContain('Załóż');
    expect(el.textContent).toContain('Quiz działa także bez konta');
  });

  it('sends nothing and shows field errors when the form is empty', () => {
    submit();
    expect(el.querySelectorAll('.field-error').length).toBe(2);
  });

  it('logs in, remembers the user in the shared state and goes to the quiz list', () => {
    fillAndSubmit();
    const req = http.expectOne(URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      email: 'jan@example.com',
      password: 'correct horse battery',
    });
    req.flush({ user: { id: 3, email: 'jan@example.com' } });
    expect(TestBed.inject(AuthState).user()).toEqual({ id: 3, email: 'jan@example.com' });
    expect(navigate).toHaveBeenCalledWith('/');
  });

  it('shows one message for wrong credentials and keeps the user signed out', () => {
    fillAndSubmit();
    http
      .expectOne(URL)
      .flush({ status: 'error', code: 'invalid_credentials' }, { status: 401, statusText: 'x' });
    fixture.detectChanges();
    expect(errorText()).toContain('Nieprawidłowy adres e-mail lub hasło');
    expect(el.querySelector('[data-action="resend"]')).toBeNull();
    expect(TestBed.inject(AuthState).user()).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('offers to resend the link when the address is unverified, and answers neutrally', () => {
    fillAndSubmit();
    http
      .expectOne(URL)
      .flush({ status: 'error', code: 'email_not_verified' }, { status: 403, statusText: 'x' });
    fixture.detectChanges();
    expect(errorText()).toContain('nie został jeszcze potwierdzony');

    el.querySelector<HTMLButtonElement>('[data-action="resend"]')?.click();
    const resend = http.expectOne(`${environment.apiBaseUrl}/auth/resend-verification`);
    expect(resend.request.body).toEqual({ email: 'jan@example.com' });
    resend.flush({ status: 'ok' }, { status: 202, statusText: 'Accepted' });
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="resent"]')?.textContent).toContain('Jeśli konto czeka');
  });

  it('shows messages for rate limiting and a network failure', () => {
    fillAndSubmit();
    http.expectOne(URL).flush({ code: 'rate_limited' }, { status: 429, statusText: 'x' });
    fixture.detectChanges();
    expect(errorText()).toContain('Zbyt wiele prób');

    submit();
    http.expectOne(URL).error(new ProgressEvent('error'));
    fixture.detectChanges();
    expect(errorText()).toContain('połączyć się z serwerem');
  });

  it('disables the button while the request is pending', () => {
    fillAndSubmit();
    expect(el.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
    http.expectOne(URL).flush({}, { status: 503, statusText: 'x' });
    fixture.detectChanges();
    expect(el.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
  });

  it('tells a signed-in user so, instead of showing the form', () => {
    TestBed.inject(AuthState).user.set({ id: 1, email: 'jan@example.com' });
    fixture.detectChanges();
    expect(el.textContent).toContain('Jesteś zalogowany jako jan@example.com');
    expect(el.querySelector('form')).toBeNull();
  });
});
