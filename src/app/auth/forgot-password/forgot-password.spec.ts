import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { environment } from '../../../environments/environment';
import { ForgotPassword } from './forgot-password';

const URL = `${environment.apiBaseUrl}/auth/forgot-password`;

describe('ForgotPassword', () => {
  let fixture: ComponentFixture<ForgotPassword>;
  let http: HttpTestingController;
  let el: HTMLElement;

  const type = (value: string) => {
    const input = el.querySelector<HTMLInputElement>('#forgot-email');
    if (!input) throw new Error('no email field');
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const submit = () => {
    el.querySelector('form')?.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ForgotPassword],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(ForgotPassword);
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('sends nothing for an empty or malformed address', () => {
    submit();
    expect(el.querySelector('.field-error')?.textContent).toContain('poprawny adres');
    type('not-an-email');
    submit();
    expect(el.querySelector('.field-error')).not.toBeNull();
  });

  it('posts the trimmed address and then shows the same neutral message for everyone', () => {
    type(' jan@example.com ');
    submit();
    const req = http.expectOne(URL);
    expect(req.request.body).toEqual({ email: 'jan@example.com' });
    req.flush({ status: 'ok' }, { status: 202, statusText: 'Accepted' });
    fixture.detectChanges();
    const message = el.querySelector('[data-testid="sent"]')?.textContent ?? '';
    expect(message).toContain('Jeśli konto o tym adresie istnieje');
    expect(el.querySelector('form')).toBeNull();
  });

  it('shows a message when the request is rate limited or the server is down', () => {
    type('jan@example.com');
    submit();
    http.expectOne(URL).flush({ code: 'rate_limited' }, { status: 429, statusText: 'x' });
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="form-error"]')?.textContent).toContain(
      'Zbyt wiele prób',
    );

    submit();
    http.expectOne(URL).flush({}, { status: 503, statusText: 'x' });
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="form-error"]')?.textContent).toContain(
      'Spróbuj ponownie',
    );
  });
});
