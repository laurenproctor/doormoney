/**
 * The one check the recovery page makes before it will call the reset action.
 *
 * Deliberately the only one. Whether a handle looks like an email address or a username is the
 * server's business (`addressFor` in the reset action decides), and guessing at it here would let
 * the page refuse something the account actually uses. Blank is the only thing the page can be
 * sure about, and catching it here means an empty submission never reaches the service at all.
 */

/** Shown under the field when somebody submits nothing. */
export const EMPTY_MESSAGE = "Enter your email address or username.";

/**
 * Shown when the call to the reset action never completed: the connection, or the server.
 *
 * It cannot describe anything more specific, and must not try. The action reports the same result
 * whether or not an account matches, and deliberately swallows what the mail provider said, so
 * anything more detailed here would either be a guess or a way to tell accounts apart.
 */
export const SERVICE_MESSAGE = "We couldn’t send the reset link right now. Try again in a moment.";

/** Ids are fixed rather than generated, so the field's aria-describedby is stable across renders. */
export const FIELD_ID = "forgot-handle";
export const HINT_ID = "forgot-handle-hint";
export const ERROR_ID = "forgot-handle-error";

export function isBlankHandle(value: string): boolean {
  return value.trim().length === 0;
}

/** What the field points at: always the hint, and the message too while there is one. */
export function describedBy(hasError: boolean): string {
  return hasError ? `${ERROR_ID} ${HINT_ID}` : HINT_ID;
}
