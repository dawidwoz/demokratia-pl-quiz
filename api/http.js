'use strict';

// HTTP helpers shared by handler.js (quiz routes) and the auth routes: JSON responses and a bounded
// JSON body reader. Moved out of handler.js unchanged so both can reuse them.

const { InvalidRequestError } = require('./validate');

const MAX_BODY_BYTES = 16 * 1024;

class PayloadTooLargeError extends Error {
  constructor() {
    super('payload too large');
    this.code = 'payload_too_large';
  }
}

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(body));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const contentType = String(req.headers['content-type'] || '');
    if (!contentType.toLowerCase().startsWith('application/json')) {
      reject(new InvalidRequestError('content-type must be application/json'));
      req.resume();
      return;
    }
    const chunks = [];
    let size = 0;
    let failed = false;
    req.on('data', (chunk) => {
      if (failed) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        failed = true;
        reject(new PayloadTooLargeError());
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (failed) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (_) {
        reject(new InvalidRequestError('body is not valid JSON'));
      }
    });
    req.on('error', () => {
      if (!failed) reject(new InvalidRequestError('request stream error'));
    });
  });
}

module.exports = { MAX_BODY_BYTES, PayloadTooLargeError, sendJson, readJsonBody };
