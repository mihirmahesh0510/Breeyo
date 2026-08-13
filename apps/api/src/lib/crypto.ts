import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

/**
 * At-rest encryption for per-clinic Razorpay credentials (D-29, ASVS V6/V8).
 *
 * ## Scope — read this before using anything here
 *
 * `clinics.razorpay_key_secret_enc` and `clinics.razorpay_webhook_secret_enc`
 * are the ONLY places a Razorpay secret exists in this system, and the two
 * functions below are the only way in and out of them. Possession of a live
 * `key_secret` is authority to move money out of a clinic's account, so:
 *
 * - **No API response may ever contain a decrypted secret.** `GET
 *   /billing/settings` returns presence booleans (`ClinicBillingSettings`,
 *   plan 06-04), never values.
 * - **The mobile client never receives either value**, encrypted or not.
 * - **Nothing here is logged.** Not the plaintext, not the key, not the
 *   ciphertext, and not inside an error message — errors thrown below name
 *   only the environment variable and the expected format.
 *
 * ## Algorithm
 *
 * AES-256-GCM with a fresh random 12-byte IV per call (the size GCM is
 * specified for) and the authentication tag stored alongside. GCM rather than
 * CBC because the tag makes tampering detectable: a substituted ciphertext
 * fails loudly instead of decrypting to a plausible-looking wrong credential
 * that would silently redirect payments.
 *
 * The random IV also means encrypting the same secret twice yields different
 * ciphertext, so an attacker with read access to the column cannot tell that
 * two clinics share a credential.
 *
 * ## Envelope format
 *
 *     v1.<iv base64>.<auth tag base64>.<ciphertext base64>
 *
 * The leading `v1` is a key/algorithm version marker, present so that a future
 * key rotation or algorithm change is *detected* rather than guessed at from
 * the shape of the data. Anything that is not `v1` is rejected outright rather
 * than parsed optimistically. When a `v2` is introduced, decrypt must branch on
 * this marker and continue to accept `v1` until every row is migrated.
 *
 * Rotating `BILLING_ENCRYPTION_KEY` invalidates every stored secret — clinics
 * must re-enter their credentials. This is documented in `.env.example`.
 */

/** Current envelope version. See the note on the envelope format above. */
const ENVELOPE_VERSION = 'v1';

/** GCM's specified IV size, in bytes. */
const IV_BYTES = 12;

/** AES-256 needs a 32-byte key, which is 64 hexadecimal characters. */
const KEY_HEX_LENGTH = 64;

const HEX_ONLY = /^[0-9a-fA-F]+$/;

/**
 * Resolves the master encryption key from the environment.
 *
 * Read lazily, inside this function, and deliberately never at module scope: an
 * API instance whose clinics have not configured Razorpay must still boot. A
 * module-scope read would turn a missing optional key into a crash on startup
 * for every deployment, and would also capture the value at import time where
 * a test could not vary it.
 */
function getEncryptionKey(): Buffer {
  const value = process.env.BILLING_ENCRYPTION_KEY;

  if (!value) {
    throw new Error(
      'BILLING_ENCRYPTION_KEY is not set — per-clinic Razorpay credentials cannot be encrypted',
    );
  }

  // Note the error text names the expected format only. Echoing the supplied
  // value would put key material into logs the moment someone mis-pastes it.
  if (value.length !== KEY_HEX_LENGTH || !HEX_ONLY.test(value)) {
    throw new Error(
      `BILLING_ENCRYPTION_KEY must be exactly ${KEY_HEX_LENGTH} hexadecimal characters ` +
        '(a 32-byte AES-256 key). Generate one with: openssl rand -hex 32',
    );
  }

  return Buffer.from(value, 'hex');
}

/**
 * Encrypts a Razorpay secret for storage in a `*_enc` column.
 *
 * Returns the full self-describing envelope; store it verbatim.
 */
export function encryptSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_BYTES);

  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    ENVELOPE_VERSION,
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join('.');
}

/**
 * Decrypts a stored envelope back to the Razorpay secret.
 *
 * Throws on a version mismatch, a malformed envelope, the wrong key, or any
 * tampering — the authentication tag is verified as part of `final()`. There is
 * deliberately no try/catch and no fallback return value: a credential that
 * fails to authenticate must abort the operation, because the alternative is
 * signing a payment request with an attacker-chosen key.
 */
export function decryptSecret(stored: string): string {
  const segments = stored.split('.');

  if (segments.length !== 4 || segments[0] !== ENVELOPE_VERSION) {
    throw new Error(
      `Stored credential is not a ${ENVELOPE_VERSION} envelope — refusing to decrypt`,
    );
  }

  const [, ivB64, authTagB64, ciphertextB64] = segments;
  const key = getEncryptionKey();

  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, 'base64')),
    decipher.final(),
  ]);

  return plaintext.toString('utf8');
}

/**
 * Whether a value is already an encrypted envelope.
 *
 * Used by the billing settings service (plan 06-11) to tell an unchanged,
 * already-encrypted value apart from a newly submitted plaintext one, so that
 * saving settings without touching the credentials does not double-encrypt
 * them into an unrecoverable state.
 */
export function isEncrypted(value: string): boolean {
  const segments = value.split('.');
  return segments.length === 4 && segments[0] === ENVELOPE_VERSION;
}
