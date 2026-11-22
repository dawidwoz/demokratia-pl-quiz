/**
 * Test helper: counts every write to browser storage and every script-set cookie while a spec runs.
 *
 * Why not just `vi.spyOn(Storage.prototype, 'setItem')`: Node 25 ships its own `sessionStorage` (and a
 * `localStorage` without methods), which is not jsdom's `Storage`, so a write to it would go unseen.
 * So this watches the prototype of each storage object that exists, plus `document.cookie` writes.
 * Account code must write to none of them: the session lives in an HttpOnly cookie the server sets,
 * and answers and passwords must never reach browser storage (the quiz's anonymity contract).
 *
 * Compiled only for tests (see tsconfig.spec.json); it is excluded from the app build.
 */
export function watchStorageWrites() {
  const prototypes = new Set<object>([Storage.prototype]);
  for (const name of ['sessionStorage', 'localStorage'] as const) {
    const area: unknown = (globalThis as Record<string, unknown>)[name];
    if (area !== null && typeof area === 'object') prototypes.add(Object.getPrototypeOf(area));
  }
  const spies = [...prototypes]
    .filter((prototype) => typeof (prototype as Storage).setItem === 'function')
    .map((prototype) => vi.spyOn(prototype as Storage, 'setItem'));
  const cookieWrites = vi.spyOn(document, 'cookie', 'set');

  return {
    /** Number of storage and cookie writes since the watch started. */
    writes: () =>
      spies.reduce((total, spy) => total + spy.mock.calls.length, 0) +
      cookieWrites.mock.calls.length,
    restore: () => {
      for (const spy of spies) spy.mockRestore();
      cookieWrites.mockRestore();
    },
  };
}
