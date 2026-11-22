// Development: `ng serve` runs on :4200 and forwards /api/** to the API on :3000 (src/proxy.conf.json), so
// the browser sees one origin, exactly like production. That keeps the session cookie and the API's
// same-origin check behaving as they do in production. Start the API with the dev-only variables in
// api/README.md (AUTH_INSECURE_COOKIES=1 for plain-http localhost). Restart `ng serve` after editing the proxy.
// angular.json swaps this file in for environment.ts in the `development` build configuration.
export const environment = {
  apiBaseUrl: '/api',
};
