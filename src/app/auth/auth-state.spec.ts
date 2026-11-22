import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../environments/environment';
import { AuthState } from './auth-state';
import { watchStorageWrites } from '../../testing/storage-watch';

const user = { id: 3, email: 'jan@example.com' };

describe('AuthState', () => {
  let state: AuthState;
  let http: HttpTestingController;
  let storage: ReturnType<typeof watchStorageWrites>;
  const url = (path: string) => `${environment.apiBaseUrl}/auth/${path}`;

  beforeEach(() => {
    // Node 25's built-in localStorage shadows jsdom's, so watch the Storage API itself.
    storage = watchStorageWrites();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    state = TestBed.inject(AuthState);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    // The quiz's anonymity contract: no account code may write to browser storage.
    expect(storage.writes()).toBe(0);
    storage.restore();
  });

  it('starts anonymous and not ready, and makes no request by itself', () => {
    expect(state.user()).toBeNull();
    expect(state.ready()).toBe(false);
  });

  it('refresh() adopts the user the API reports', () => {
    state.refresh();
    http.expectOne(url('me')).flush({ user });
    expect(state.user()).toEqual(user);
    expect(state.ready()).toBe(true);
  });

  it('refresh() treats an anonymous answer as ready and signed out', () => {
    state.refresh();
    http.expectOne(url('me')).flush({ user: null });
    expect(state.user()).toBeNull();
    expect(state.ready()).toBe(true);
  });

  it('refresh() treats an unreachable API as signed out, still ready', () => {
    state.refresh();
    http.expectOne(url('me')).error(new ProgressEvent('error'));
    expect(state.user()).toBeNull();
    expect(state.ready()).toBe(true);
  });

  it('login() sets the user on success and leaves it unset on failure', () => {
    state.login('jan@example.com', 'wrong').subscribe({ error: () => undefined });
    http
      .expectOne(url('login'))
      .flush(
        { status: 'error', code: 'invalid_credentials' },
        { status: 401, statusText: 'Unauthorized' },
      );
    expect(state.user()).toBeNull();

    state.login('jan@example.com', 'right').subscribe();
    http.expectOne(url('login')).flush({ user });
    expect(state.user()).toEqual(user);
    expect(state.ready()).toBe(true);
  });

  it('logout() clears the user once the API confirms', () => {
    state.user.set(user);
    state.logout().subscribe();
    http.expectOne(url('logout')).flush({ status: 'ok' });
    expect(state.user()).toBeNull();
  });

  it('logout() keeps the user when the API call fails', () => {
    state.user.set(user);
    state.logout().subscribe({ error: () => undefined });
    http.expectOne(url('logout')).flush({}, { status: 503, statusText: 'Unavailable' });
    expect(state.user()).toEqual(user);
  });
});
