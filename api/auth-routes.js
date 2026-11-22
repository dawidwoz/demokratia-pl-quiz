'use strict';

// HTTP layer for /api/auth/*: routing, the CSRF guard, the session cookie, JSON in and out. All account
// logic lives in auth-service.js. Every response is `Cache-Control: no-store`. Nothing here logs a
// body, an email, a token or a cookie; errors log a short code only.
//
// CSRF: a state-changing request must be same-origin. Browsers send Sec-Fetch-Site on every request;
// when it is absent (older clients) the Origin header must name this host. Anything else is refused
// with 403 before the body is read. SameSite=Lax on the cookie is the second layer, and requiring a
// JSON content type (readJsonBody) blocks plain cross-site form posts.

const config = require('./auth-config');
const { sendJson, readJsonBody, PayloadTooLargeError } = require('./http');
const { InvalidRequestError } = require('./validate');

const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

// method + path -> { name: service method, body: whether a JSON body is read }
const ROUTES = {
  'POST /api/auth/register': { name: 'register', body: true },
  'POST /api/auth/verify-email': { name: 'verifyEmail', body: true },
  'POST /api/auth/resend-verification': { name: 'resendVerification', body: true },
  'POST /api/auth/login': { name: 'login', body: true },
  'POST /api/auth/logout': { name: 'logout', body: false },
  'POST /api/auth/forgot-password': { name: 'forgotPassword', body: true },
  'POST /api/auth/reset-password': { name: 'resetPassword', body: true },
  'GET /api/auth/me': { name: 'me', body: false },
};

function errorCode(error) {
  return typeof error?.code === 'string' ? error.code : 'UNKNOWN';
}

function isSameOriginRequest(req) {
  const site = req.headers['sec-fetch-site'];
  if (site !== undefined) return site === 'same-origin';
  const origin = req.headers.origin;
  if (typeof origin !== 'string' || origin === '') return false;
  try {
    return new URL(origin).host === req.headers.host;
  } catch (_) {
    return false; // includes "Origin: null"
  }
}

// Client address, used ONLY as a rate-limit key (never stored or logged). Behind the host's proxy the
// last X-Forwarded-For entry is the one the proxy appended; without the header, the socket address.
function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    const last = forwarded.split(',').pop().trim();
    if (last) return last;
  }
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

function createAuthRoutes({ service, env = process.env }) {
  const insecure = env.AUTH_INSECURE_COOKIES === '1'; // dev only: plain-http localhost
  const cookieName = insecure ? config.COOKIE_NAME_INSECURE : config.COOKIE_NAME_SECURE;

  function readSessionToken(req) {
    const header = req.headers.cookie;
    if (typeof header !== 'string') return null;
    for (const part of header.split(';')) {
      const index = part.indexOf('=');
      if (index === -1) continue;
      if (part.slice(0, index).trim() !== cookieName) continue;
      const value = part.slice(index + 1).trim();
      return SESSION_TOKEN_PATTERN.test(value) ? value : null;
    }
    return null;
  }

  function cookie(value, maxAgeSeconds) {
    const attributes = ['Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`];
    if (!insecure) attributes.push('Secure');
    return `${cookieName}=${value}; ${attributes.join('; ')}`;
  }

  async function handle(req, res, pathname) {
    res.setHeader('Cache-Control', 'no-store');
    const route = ROUTES[`${req.method} ${pathname}`];
    if (!route) return sendJson(res, 404, { status: 'not_found' });

    if (req.method === 'POST' && !isSameOriginRequest(req)) {
      res.setHeader('Connection', 'close'); // the unread body is not worth keeping the socket for
      req.resume();
      return sendJson(res, 403, { status: 'error', code: 'csrf_rejected' });
    }

    let body = null;
    if (route.body) {
      try {
        body = await readJsonBody(req);
      } catch (error) {
        if (error instanceof PayloadTooLargeError) {
          res.setHeader('Connection', 'close');
          return sendJson(res, 413, { status: 'error', code: 'payload_too_large' });
        }
        if (error instanceof InvalidRequestError) {
          return sendJson(res, 400, { status: 'error', code: 'invalid_request' });
        }
        throw error;
      }
    } else if (req.method === 'POST') {
      req.resume();
    }

    let result;
    try {
      result = await service[route.name](body, {
        ip: clientIp(req),
        sessionToken: readSessionToken(req),
      });
    } catch (error) {
      // The real code (HASH_BUSY, ECONNREFUSED, ...) goes to the log only; the caller gets a fixed one.
      console.error(`auth request failed: ${errorCode(error)}`);
      return sendJson(res, 503, { status: 'error', code: 'unavailable' });
    }

    if (result.setSession) {
      res.setHeader('Set-Cookie', cookie(result.setSession, config.SESSION_ABSOLUTE_SECONDS));
    } else if (result.clearSession) {
      res.setHeader('Set-Cookie', cookie('', 0));
    }
    sendJson(res, result.status, result.body);

    if (result.after) {
      // After the response, so timing does not reveal whether mail was sent.
      Promise.resolve()
        .then(result.after)
        .catch((error) => console.error(`auth mail failed: ${errorCode(error)}`));
    }
  }

  return { handle };
}

module.exports = { createAuthRoutes, isSameOriginRequest, clientIp };
