import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { environment } from '../../../environments/environment';
import { AuthState } from '../auth-state';
import { Register } from './register';
import { watchStorageWrites } from '../../../testing/storage-watch';

const URL = `${environment.apiBaseUrl}/auth/register`;

describe('Register', () => {
  let fixture: ComponentFixture<Register>;
  let http: HttpTestingController;
  let el: HTMLElement;
  let storage: ReturnType<typeof watchStorageWrites>;

  const field = (selector: string) => {
    const input = el.querySelector<HTMLInputElement>(selector);
    if (!input) throw new Error(`no element for ${selector}`);
    return input;
  };
  const type = (selector: string, value: string) => {
    const input = field(selector);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const accept = () => {
    const box = field('#register-terms');
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  };
  const submit = () => {
    el.querySelector('form')?.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  };
  const fillValid = () => {
    type('#register-email', '  jan@example.com ');
    type('#register-password', 'correct horse battery');
    accept();
  };
  const text = () => el.textContent ?? '';

  beforeEach(() => {
    storage = watchStorageWrites();
    TestBed.configureTestingModule({
      imports: [Register],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(Register);
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  afterEach(() => {
    http.verify();
    // Passwords must never reach browser storage.
    expect(storage.writes()).toBe(0);
    storage.restore();
  });

  it('renders labelled fields, the terms checkbox with links, and the submit button', () => {
    expect(el.querySelector('label[for="register-email"]')?.textContent).toContain('Adres e-mail');
    expect(el.querySelector('label[for="register-password"]')?.textContent).toContain('Hasło');
    expect(field('#register-password').type).toBe('password');
    expect(field('#register-password').getAttribute('autocomplete')).toBe('new-password');
    const links = Array.from(el.querySelectorAll('label[for="register-terms"] a')).map((a) =>
      a.getAttribute('href'),
    );
    expect(links).toEqual(['/regulamin', '/polityka-prywatnosci']);
    expect(el.querySelector('button[type="submit"]')?.textContent).toContain('Załóż konto');
  });

  it('shows field errors and sends nothing when the form is empty', () => {
    submit();
    expect(el.querySelectorAll('.field-error').length).toBe(3);
    expect(text()).toContain('Podaj poprawny adres e-mail.');
    expect(text()).toContain('co najmniej 10 znaków');
    expect(text()).toContain('zaakceptuj Regulamin');
    expect(field('#register-email').getAttribute('aria-invalid')).toBe('true');
  });

  it('refuses a short password and an unchecked terms box locally', () => {
    type('#register-email', 'jan@example.com');
    type('#register-password', 'too short');
    submit();
    expect(text()).toContain('co najmniej 10 znaków');
    type('#register-password', 'correct horse battery');
    submit();
    expect(text()).toContain('zaakceptuj Regulamin');
  });

  it('posts the trimmed email, the password and the acceptance, then asks to check the mailbox', () => {
    fillValid();
    submit();
    const req = http.expectOne(URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      email: 'jan@example.com',
      password: 'correct horse battery',
      acceptTerms: true,
    });
    expect(el.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(true);
    req.flush({ status: 'ok' }, { status: 202, statusText: 'Accepted' });
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="sent"]')?.textContent).toContain('Sprawdź skrzynkę');
    expect(text()).toContain('jan@example.com');
    expect(el.querySelector('form')).toBeNull();
    expect(text()).not.toContain('correct horse battery');
  });

  it('shows the API reason for a rejected password', () => {
    fillValid();
    submit();
    http
      .expectOne(URL)
      .flush(
        { status: 'error', code: 'invalid_password', reason: 'too_common' },
        { status: 422, statusText: 'Unprocessable' },
      );
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="form-error"]')?.textContent).toContain('zbyt popularne');
    expect(el.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
    expect(el.querySelector('form')).not.toBeNull();
  });

  it('shows messages for rate limiting, server errors and a network failure', () => {
    const attempt = (respond: (req: ReturnType<HttpTestingController['expectOne']>) => void) => {
      fillValid();
      submit();
      respond(http.expectOne(URL));
      fixture.detectChanges();
      return el.querySelector('[data-testid="form-error"]')?.textContent ?? '';
    };
    expect(
      attempt((r) => r.flush({ code: 'rate_limited' }, { status: 429, statusText: 'x' })),
    ).toContain('Zbyt wiele prób');
    expect(attempt((r) => r.flush({}, { status: 503, statusText: 'x' }))).toContain(
      'Spróbuj ponownie',
    );
    expect(attempt((r) => r.error(new ProgressEvent('error')))).toContain(
      'połączyć się z serwerem',
    );
  });

  it('renders text from the API as text, not HTML', () => {
    fillValid();
    submit();
    http
      .expectOne(URL)
      .flush({ code: '<img src=x onerror=alert(1)>' }, { status: 422, statusText: 'x' });
    fixture.detectChanges();
    expect(el.querySelector('img')).toBeNull();
  });

  it('tells a signed-in user so, instead of showing the form', () => {
    TestBed.inject(AuthState).user.set({ id: 1, email: 'jan@example.com' });
    fixture.detectChanges();
    expect(text()).toContain('Jesteś zalogowany jako jan@example.com');
    expect(el.querySelector('form')).toBeNull();
  });
});
