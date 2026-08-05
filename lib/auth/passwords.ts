import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

// Hand-wrapped rather than promisify'd: the promisified overload drops the
// options argument, which is where the work factors live.
function scryptAsync(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keyLength, options, (error, derived) =>
      error ? reject(error) : resolve(derived)
    );
  });
}

/** Memory-hard by design; these are the Node defaults raised for password use. */
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const SCRYPT_OPTIONS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/**
 * Password hashing on `node:crypto` alone. scrypt is memory-hard and built in,
 * so the app gains no dependency for something it must never get wrong.
 *
 * Stored as `scrypt$<salt-hex>$<hash-hex>`, which leaves room to change the
 * algorithm later without guessing at what an existing row used.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scryptAsync(password, salt, KEY_LENGTH, SCRYPT_OPTIONS);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

/** Constant-time comparison; returns false rather than throwing on a malformed row. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;

  try {
    const expected = Buffer.from(hashHex, 'hex');
    const derived = await scryptAsync(
      password,
      Buffer.from(saltHex, 'hex'),
      expected.length,
      SCRYPT_OPTIONS
    );
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export const PASSWORD_MIN_LENGTH = 10;

/** Length is the requirement that actually helps; composition rules do not. */
export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Use at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (password.length > 512) return 'That password is too long.';
  return null;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email) && email.length <= 254;
}
