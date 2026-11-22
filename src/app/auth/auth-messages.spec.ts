import { HttpErrorResponse } from '@angular/common/http';

import {
  genericMessage,
  loginMessage,
  readProblem,
  registerMessage,
  resetMessage,
} from './auth-messages';

const problem = (status: number, code: string | null = null, reason: string | null = null) => ({
  status,
  code,
  reason,
});

describe('auth messages', () => {
  it('reads status, code and reason from an HTTP error', () => {
    const error = new HttpErrorResponse({
      status: 422,
      error: { status: 'error', code: 'invalid_password', reason: 'too_short' },
    });
    expect(readProblem(error)).toEqual(problem(422, 'invalid_password', 'too_short'));
  });

  it('tolerates a body that is not an object, and errors that are not HTTP errors', () => {
    expect(readProblem(new HttpErrorResponse({ status: 502, error: '<html>' }))).toEqual(
      problem(502),
    );
    expect(readProblem(new Error('boom'))).toEqual(problem(0));
    expect(readProblem(null)).toEqual(problem(0));
  });

  it('maps password reasons to Polish copy', () => {
    expect(registerMessage(problem(422, 'invalid_password', 'too_short'))).toContain('za krótkie');
    expect(registerMessage(problem(422, 'invalid_password', 'too_long'))).toContain('za długie');
    expect(registerMessage(problem(422, 'invalid_password', 'too_common'))).toContain('popularne');
    expect(resetMessage(problem(422, 'invalid_password', 'too_common'))).toContain('popularne');
    expect(registerMessage(problem(422, 'invalid_password', 'weird'))).toContain('nie spełnia');
  });

  it('maps the other API codes', () => {
    expect(registerMessage(problem(422, 'invalid_email'))).toContain('poprawny adres');
    expect(registerMessage(problem(422, 'terms_required'))).toContain('Regulamin');
    expect(loginMessage(problem(401, 'invalid_credentials'))).toContain('Nieprawidłowy');
    expect(loginMessage(problem(403, 'email_not_verified'))).toContain(
      'nie został jeszcze potwierdzony',
    );
    expect(resetMessage(problem(400, 'invalid_token'))).toContain('nieważny');
  });

  it('shares messages for rate limiting, server trouble and network trouble', () => {
    for (const read of [registerMessage, loginMessage, resetMessage, genericMessage]) {
      expect(read(problem(429, 'rate_limited'))).toContain('Zbyt wiele prób');
      expect(read(problem(503, 'unavailable'))).toContain('Spróbuj ponownie');
      expect(read(problem(0))).toContain('połączyć się z serwerem');
    }
  });

  it('never echoes what the server sent beyond its fixed codes', () => {
    expect(loginMessage(problem(401, '<script>alert(1)</script>'))).not.toContain('script');
  });
});
