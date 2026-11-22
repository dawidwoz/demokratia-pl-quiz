/**
 * Facts the Regulamin and the Polityka Prywatności state about the service. The owner fills in the three
 * placeholder values and sets LEGAL_REVIEWED to true after reading the draft texts; until then the pages
 * show a "wersja robocza" banner and scripts/check-go-live.mjs (run by the deploy workflow) refuses to
 * deploy. Keep TERMS_VERSION equal to TERMS_VERSION in api/auth-config.js (a test checks it) and raise
 * both whenever the text changes in a way users must accept again.
 */

/** Version of the Regulamin / Polityka Prywatności that registration records as accepted. */
export const TERMS_VERSION = '1';

/** Who is the data controller: name (and address, if any) as it should read in the Polityka Prywatności. */
export const CONTROLLER_NAME = 'Quiz Demokratia PL';

/** E-mail address (or other contact) users write to about their data and complaints. */
export const PRIVACY_CONTACT = 'support@quiz.demokratia.pl';

/** Date from which this version applies, e.g. '2026-12-06'. */
export const EFFECTIVE_DATE = '2026-11-22';

/** Flip to true once the owner has read and approved both texts. */
export const LEGAL_REVIEWED = true;
