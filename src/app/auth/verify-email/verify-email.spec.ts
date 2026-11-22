import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';

import { environment } from '../../../environments/environment';
import { VerifyEmail } from './verify-email';

const URL = `${environment.apiBaseUrl}/auth/verify-email`;

describe('VerifyEmail', () => {
  let http: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;
  let fixture: ComponentFixture<VerifyEmail>;
  let el: HTMLElement;

  function open(fragment: string | null) {
    TestBed.configureTestingModule({
      imports: [VerifyEmail],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { snapshot: { fragment } } },
      ],
    });
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(VerifyEmail);
    el = fixture.nativeElement;
    fixture.detectChanges();
  }

  afterEach(() => http.verify());

  it('posts the token from the link and confirms the address', () => {
    open('token=one-time-token');
    expect(el.textContent).toContain('Potwierdzamy');
    const req = http.expectOne(URL);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ token: 'one-time-token' });
    expect(req.request.url).not.toContain('one-time-token');
    req.flush({ status: 'ok' });
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="verified"]')?.textContent).toContain('potwierdzony');
    expect(el.querySelector('a[href="/logowanie"]')).not.toBeNull();
  });

  it('removes the token from the address bar by replacing the history entry', () => {
    open('token=one-time-token');
    http.expectOne(URL).flush({ status: 'ok' });
    expect(navigate).toHaveBeenCalledTimes(1);
    const [commands, extras] = navigate.mock.calls[0];
    expect(commands).toEqual([]);
    expect(extras).toMatchObject({ replaceUrl: true });
    expect(extras).not.toHaveProperty('fragment');
    expect(extras).not.toHaveProperty('preserveFragment');
  });

  it('says the link is invalid when the API refuses the token', () => {
    open('token=old');
    http
      .expectOne(URL)
      .flush({ status: 'error', code: 'invalid_token' }, { status: 400, statusText: 'x' });
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="invalid"]')?.textContent).toContain('nieważny');
  });

  it('shows a retry message for server trouble, not an "invalid link" verdict', () => {
    open('token=abc');
    http.expectOne(URL).flush({}, { status: 503, statusText: 'x' });
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="error"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="invalid"]')).toBeNull();
  });

  it('shows "invalid link" without any request when the fragment has no token', () => {
    open(null);
    expect(el.querySelector('[data-testid="invalid"]')).not.toBeNull();
    http.expectNone(URL);
  });

  it('never prints the token on the page', () => {
    open('token=super-secret-token');
    http.expectOne(URL).flush({ status: 'ok' });
    fixture.detectChanges();
    expect(el.textContent).not.toContain('super-secret-token');
  });
});
