import { routes } from './app.routes';

describe('routes', () => {
  const paths = routes.map((route) => route.path);

  it('defines every page the shell, the mails and the forms link to', () => {
    for (const path of [
      '',
      'quiz/:id',
      'rejestracja',
      'logowanie',
      'weryfikacja',
      'zapomniane-haslo',
      'reset-hasla',
      'regulamin',
      'polityka-prywatnosci',
    ]) {
      expect(paths).toContain(path);
    }
  });

  it('keeps the catch-all redirect last, so no page is shadowed by it', () => {
    expect(paths.at(-1)).toBe('**');
    expect(paths.filter((path) => path === '**')).toHaveLength(1);
  });

  it('gives every page a Polish title ending in the site name', () => {
    for (const route of routes.filter((candidate) => candidate.path !== '**')) {
      expect(String(route.title)).toMatch(/Z kim mi po drodze$/);
    }
  });
});
