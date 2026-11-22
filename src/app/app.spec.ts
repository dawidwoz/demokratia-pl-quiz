import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { environment } from '../environments/environment';
import { App } from './app';
import { AuthState } from './auth/auth-state';

describe('App', () => {
  let fixture: ComponentFixture<App>;
  let http: HttpTestingController;
  let auth: AuthState;
  let el: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthState);
    fixture = TestBed.createComponent(App);
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  afterEach(() => http.verify());

  it('should create the app', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('shows no account links until the API has said who is signed in', () => {
    expect(el.querySelector('.account')).toBeNull();
    expect(el.querySelector('.brand')?.textContent).toContain('Z kim mi po drodze');
  });

  it('offers sign-in and sign-up to an anonymous visitor', () => {
    auth.ready.set(true);
    fixture.detectChanges();
    const links = Array.from(el.querySelectorAll('.account a')).map((a) => [
      a.getAttribute('href'),
      a.textContent?.trim(),
    ]);
    expect(links).toEqual([
      ['/logowanie', 'Zaloguj się'],
      ['/rejestracja', 'Załóż konto'],
    ]);
    expect(el.querySelector('[data-action="logout"]')).toBeNull();
  });

  it('shows the email and a logout button when signed in, and no sign-in links', () => {
    auth.user.set({ id: 3, email: 'jan@example.com' });
    auth.ready.set(true);
    fixture.detectChanges();
    expect(el.querySelector('[data-testid="user-email"]')?.textContent).toContain(
      'jan@example.com',
    );
    expect(el.querySelector('[data-action="logout"]')?.textContent).toContain('Wyloguj');
    expect(el.querySelector('.account a')).toBeNull();
  });

  it('logs out through the API, clears the user and goes to the quiz list', () => {
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    auth.user.set({ id: 3, email: 'jan@example.com' });
    auth.ready.set(true);
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('[data-action="logout"]')?.click();
    http.expectOne(`${environment.apiBaseUrl}/auth/logout`).flush({ status: 'ok' });
    fixture.detectChanges();
    expect(auth.user()).toBeNull();
    expect(navigate).toHaveBeenCalledWith('/');
    expect(el.querySelector('.account a')).not.toBeNull();
  });

  it('asks the API again when logout fails, instead of assuming', () => {
    auth.user.set({ id: 3, email: 'jan@example.com' });
    auth.ready.set(true);
    fixture.detectChanges();
    el.querySelector<HTMLButtonElement>('[data-action="logout"]')?.click();
    http
      .expectOne(`${environment.apiBaseUrl}/auth/logout`)
      .flush({}, { status: 503, statusText: 'Unavailable' });
    http
      .expectOne(`${environment.apiBaseUrl}/auth/me`)
      .flush({ user: { id: 3, email: 'jan@example.com' } });
    expect(auth.user()).toEqual({ id: 3, email: 'jan@example.com' });
  });

  it('links to the Regulamin and the Polityka Prywatności in the footer', () => {
    const hrefs = Array.from(el.querySelectorAll('.site-footer a')).map((a) =>
      a.getAttribute('href'),
    );
    expect(hrefs).toEqual(['/regulamin', '/polityka-prywatnosci']);
  });
});
