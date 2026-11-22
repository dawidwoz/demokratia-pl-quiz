'use strict';

// Outbound mail for account flows (verification, password reset, "you already have an account").
// Production sends through the host's SMTP with nodemailer (pure JavaScript, no native build).
//
// Configuration (environment, set in cPanel; never committed):
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, MAIL_FROM   - the SMTP account and sender
//   PUBLIC_BASE_URL  - origin used in mail links, e.g. https://quiz.demokratia.pl. Never derived from
//                      the request's Host header (host-header injection). Must be https, except
//                      http://localhost... in the dev-only AUTH_INSECURE_COOKIES=1 mode.
//   MAIL_TRANSPORT=console - DEV ONLY: print the message (including its secret link) instead of sending.
//
// Privacy: outside console mode nothing about the recipient or the token is ever logged; failures
// carry a short code only. Missing settings are reported by variable NAME, never value.

const templates = require('./mail-templates');

const REQUIRED_SMTP = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'MAIL_FROM'];

class MailConfigError extends Error {
  constructor(names) {
    super(`Missing or invalid mail settings: ${names.join(', ')}`);
    this.name = 'MailConfigError';
    this.code = 'MISSING_CONFIG';
    this.missing = names;
  }
}

// -> the validated origin (no path, no trailing slash) or throws MailConfigError.
function publicOrigin(env) {
  let url;
  try {
    url = new URL(env.PUBLIC_BASE_URL);
  } catch (_) {
    throw new MailConfigError(['PUBLIC_BASE_URL']);
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  const devAllowed = env.AUTH_INSECURE_COOKIES === '1' && local;
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && devAllowed)) {
    throw new MailConfigError(['PUBLIC_BASE_URL']);
  }
  return url.origin;
}

function smtpOptions(env) {
  const missing = REQUIRED_SMTP.filter((name) => !env[name]);
  const port = Number(env.SMTP_PORT);
  if (!missing.includes('SMTP_PORT') && !(Number.isInteger(port) && port > 0 && port < 65536)) {
    missing.push('SMTP_PORT');
  }
  if (missing.length > 0) throw new MailConfigError(missing);
  return {
    host: env.SMTP_HOST,
    port,
    // 465 is implicit TLS; on any other port (587) STARTTLS is mandatory, never a plaintext fallback.
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  };
}

// deps (tests): { transport } with sendMail(), or { createTransport(options) }.
function createMailer(env = process.env, deps = {}) {
  let transport = deps.transport || null;

  function getTransport() {
    if (transport) return transport;
    const options = smtpOptions(env);
    const create = deps.createTransport || require('nodemailer').createTransport;
    transport = create(options);
    return transport;
  }

  async function send(to, message) {
    const origin = publicOrigin(env);
    const { subject, text } = message(origin);
    if (env.MAIL_TRANSPORT === 'console') {
      // Dev only: the link is a secret, so this branch must never run in production.
      console.log(`[mail:console] to=${to}\nsubject=${subject}\n${text}`);
      return;
    }
    if (!env.MAIL_FROM) throw new MailConfigError(['MAIL_FROM']);
    await getTransport().sendMail({ from: env.MAIL_FROM, to, subject, text });
  }

  const link = (origin, pathname, token) =>
    `${origin}${pathname}#token=${encodeURIComponent(token)}`;

  return {
    sendVerification: (to, token) =>
      send(to, (origin) => templates.verification(link(origin, '/weryfikacja', token))),
    sendReset: (to, token) =>
      send(to, (origin) => templates.passwordReset(link(origin, '/reset-hasla', token))),
    sendAlreadyRegistered: (to) =>
      send(to, (origin) =>
        templates.alreadyRegistered(`${origin}/logowanie`, `${origin}/zapomniane-haslo`),
      ),
  };
}

module.exports = { createMailer, MailConfigError };
