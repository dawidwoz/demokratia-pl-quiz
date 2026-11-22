import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';

import { environment } from '../../../environments/environment';
import { ResetPassword } from './reset-password';
import { watchStorageWrites } from '../../../testing/storage-watch';

const URL = `${environment.apiBaseUrl}/auth/reset-password`;

describe('ResetPassword', () => {
  let http: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;
  let fixture: ComponentFixture<ResetPassword>;
  let el: HTMLElement;
  let storage: ReturnType<typeof watchStorageWrites>;

  function open(fragment: string | null) {
    storage = watchStorageWrites();
    TestBed.configureTestingModule({
      imports: [ResetPassword],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { fragment } } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(ResetPassword);
    el = fixture.nativeElement;
    fixture.detectChanges();
  }

  const type = (value: string) => {
    const input = el.querySelector<HTMLInputElement>('#reset-password');
    if (!input) throw new Error('no password field');
    input.value = value;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  };
  const submit = () => {
    el.querySelector('form')?.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
  };

  afterEach(() => {
    http.verify();
    expect(storage.writes()).toBe(0);
    storage.restore();
  });

  it('posts the token from the link with the new password, then confirms', () => {
    open('token=reset-token');
    type('a brand new passphrase');
    submit();
    const req = http.expectOne(URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ token: 'reset-token', password: 'a brand new passphrase' });
    expect(req.request.url).not.toContain('reset-token');
    req.flush({ status: 'ok' });
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="done"]')?.textContent).toContain(
      'Hasło zostało zmienione',
    );
    expect(el.querySelector('form')).toBeNull();
    expect(el.querySelector('a[href="/logowanie"]')).not.toBeNull();
  });

  it('removes the token from the address bar by replacing the history entry', () => {
    open('token=reset-token');
    expect(navigate).toHaveBeenCalledTimes(1);
    const [commands, extras] = navigate.mock.calls[0];
    expect(commands).toEqual([]);
    expect(extras).toMatchObject({ replaceUrl: true });
    expect(extras).not.toHaveProperty('fragment');
  });

  it('refuses a short password locally without using the token', () => {
    open('token=reset-token');
    type('too short');
    submit();
    expect(el.querySelector('.field-error')?.textContent).toContain('co najmniej 10 znaków');
    http.expectNone(URL);
  });

  it('shows the API reason for a rejected password and keeps the form for another try', () => {
    open('token=reset-token');
    type('1234567890');
    submit();
    http
      .expectOne(URL)
      .flush(
        { status: 'error', code: 'invalid_password', reason: 'too_common' },
        { status: 422, statusText: 'x' },
      );
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="form-error"]')?.textContent).toContain('zbyt popularne');
    expect(el.querySelector('form')).not.toBeNull();
  });

  it('says the link is invalid when the API refuses the token, and offers a new one', () => {
    open('token=old');
    type('a brand new passphrase');
    submit();
    http
      .expectOne(URL)
      .flush({ status: 'error', code: 'invalid_token' }, { status: 400, statusText: 'x' });
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="invalid"]')?.textContent).toContain('nieważny');
    expect(el.querySelector('a[href="/zapomniane-haslo"]')).not.toBeNull();
    expect(el.querySelector('form')).toBeNull();
  });

  it('shows "invalid link" without a form when the fragment has no token', () => {
    open(null);
    expect(el.querySelector('[data-testid="invalid"]')).not.toBeNull();
    expect(el.querySelector('form')).toBeNull();
  });

  it('never prints the token or the password on the page', () => {
    open('token=super-secret-token');
    type('a brand new passphrase');
    submit();
    http.expectOne(URL).flush({ status: 'ok' });
    fixture.detectChanges();
    expect(el.textContent).not.toContain('super-secret-token');
    expect(el.textContent).not.toContain('a brand new passphrase');
  });
});
