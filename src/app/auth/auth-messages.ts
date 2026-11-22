import { HttpErrorResponse } from '@angular/common/http';

/** What the API said about a failed request: HTTP status, short code and (for passwords) a reason. */
export interface ApiProblem {
  status: number;
  code: string | null;
  reason: string | null;
}

export function readProblem(error: unknown): ApiProblem {
  if (!(error instanceof HttpErrorResponse)) return { status: 0, code: null, reason: null };
  const body: unknown = error.error;
  const record = body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  return {
    status: error.status,
    code: typeof record['code'] === 'string' ? record['code'] : null,
    reason: typeof record['reason'] === 'string' ? record['reason'] : null,
  };
}

export const MIN_PASSWORD_LENGTH = 10;
export const MAX_PASSWORD_LENGTH = 128;

const PASSWORD_REASONS: Record<string, string> = {
  too_short: `Hasło jest za krótkie (co najmniej ${MIN_PASSWORD_LENGTH} znaków).`,
  too_long: `Hasło jest za długie (najwyżej ${MAX_PASSWORD_LENGTH} znaków).`,
  too_common: 'To hasło jest zbyt popularne. Wybierz inne.',
};

const GENERIC = 'Coś poszło nie tak. Spróbuj ponownie za chwilę.';
const RATE_LIMITED = 'Zbyt wiele prób. Spróbuj ponownie za kilka minut.';

/** Messages every form shares: network trouble, rate limiting, server trouble. */
function common(problem: ApiProblem): string | null {
  if (problem.status === 0)
    return 'Nie można połączyć się z serwerem. Sprawdź połączenie i spróbuj ponownie.';
  if (problem.status === 429) return RATE_LIMITED;
  if (problem.status >= 500) return GENERIC;
  return null;
}

function passwordProblem(problem: ApiProblem): string | null {
  if (problem.code !== 'invalid_password') return null;
  return (problem.reason && PASSWORD_REASONS[problem.reason]) || 'To hasło nie spełnia wymagań.';
}

export function registerMessage(problem: ApiProblem): string {
  return (
    common(problem) ??
    passwordProblem(problem) ??
    (problem.code === 'invalid_email'
      ? 'Podaj poprawny adres e-mail.'
      : problem.code === 'terms_required'
        ? 'Aby założyć konto, zaakceptuj Regulamin i Politykę Prywatności.'
        : GENERIC)
  );
}

export function loginMessage(problem: ApiProblem): string {
  return (
    common(problem) ??
    (problem.code === 'email_not_verified'
      ? 'Ten adres e-mail nie został jeszcze potwierdzony. Otwórz link z wiadomości albo wyślij go ponownie.'
      : problem.code === 'invalid_credentials'
        ? 'Nieprawidłowy adres e-mail lub hasło.'
        : GENERIC)
  );
}

export function resetMessage(problem: ApiProblem): string {
  return (
    common(problem) ??
    passwordProblem(problem) ??
    (problem.code === 'invalid_token'
      ? 'Ten link jest nieważny lub wygasł. Poproś o nowy.'
      : GENERIC)
  );
}

export function genericMessage(problem: ApiProblem): string {
  return common(problem) ?? GENERIC;
}
