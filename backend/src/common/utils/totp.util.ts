import * as crypto from 'crypto';
import * as QRCode from 'qrcode';

// Base32 alphabet according to RFC 4648
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Encodes a buffer to RFC 4648 Base32 string.
 */
export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Decodes an RFC 4648 Base32 string into a Buffer.
 */
export function base32Decode(base32: string): Buffer {
  const clean = base32.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < clean.length; i++) {
    const charIndex = BASE32_ALPHABET.indexOf(clean[i]);
    if (charIndex === -1) continue;

    value = (value << 5) | charIndex;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Generates a cryptographically random 20-byte TOTP secret encoded in Base32 (32 characters).
 */
export function generateTotpSecret(): string {
  const randomBytes = crypto.randomBytes(20);
  return base32Encode(randomBytes);
}

/**
 * Generates the standard `otpauth://` URI compatible with Google Authenticator,
 * Microsoft Authenticator, Authy, Apple Passwords, 1Password, etc.
 */
export function generateOtpAuthUri(email: string, secret: string, issuer: string = 'CashFlow'): string {
  const cleanEmail = encodeURIComponent(email);
  const cleanIssuer = encodeURIComponent(issuer);
  return `otpauth://totp/${cleanIssuer}:${cleanEmail}?secret=${secret}&issuer=${cleanIssuer}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Generates a high-quality Data URL PNG QR code for mobile scanning.
 */
export async function generateQrCodeDataUrl(otpauthUri: string): Promise<string> {
  return QRCode.toDataURL(otpauthUri, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 256,
    color: {
      dark: '#111827',
      light: '#ffffff'
    }
  });
}

/**
 * Generates a 6-digit TOTP code for a given secret and counter.
 */
export function generateTotpCode(secretBase32: string, counter: number): string {
  const key = base32Decode(secretBase32);
  const buffer = Buffer.alloc(8);
  buffer.writeBigInt64BE(BigInt(counter));

  const hmac = crypto.createHmac('sha1', key).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;

  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = (binary % 1000000).toString().padStart(6, '0');
  return otp;
}

/**
 * Verifies a 6-digit TOTP token against a secret.
 * Checks the current 30-second window, plus 1 window back and 1 window forward (±30s drift).
 */
export function verifyTotpCode(token: string, secretBase32: string): boolean {
  if (!token || typeof token !== 'string') return false;
  const cleanToken = token.trim();
  if (!/^\d{6}$/.test(cleanToken)) return false;

  const currentCounter = Math.floor(Date.now() / 1000 / 30);

  // Check windows: -1, 0, +1
  for (let offset = -1; offset <= 1; offset++) {
    const expected = generateTotpCode(secretBase32, currentCounter + offset);
    if (crypto.timingSafeEqual(Buffer.from(cleanToken), Buffer.from(expected))) {
      return true;
    }
  }

  return false;
}

/**
 * Generates 8 alphanumeric single-use recovery / backup codes.
 * Returns both the plaintext codes (for the user) and their SHA-256 hashes (for storage).
 */
export function generateRecoveryCodes(count: number = 8): { plainCodes: string[]; hashedCodes: string[] } {
  const plainCodes: string[] = [];
  const hashedCodes: string[] = [];

  for (let i = 0; i < count; i++) {
    const raw = crypto.randomBytes(5).toString('hex').toUpperCase(); // 10 characters
    const formatted = `${raw.slice(0, 5)}-${raw.slice(5, 10)}`;
    plainCodes.push(formatted);

    const hash = hashRecoveryCode(formatted);
    hashedCodes.push(hash);
  }

  return { plainCodes, hashedCodes };
}

/**
 * Hashes a recovery code for secure database storage.
 */
export function hashRecoveryCode(code: string): string {
  const clean = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return crypto.createHash('sha256').update(clean).digest('hex');
}

/**
 * Verifies and consumes a recovery code from the user's stored hashed codes list.
 * Returns { valid: boolean, remainingHashes: string[] }.
 */
export function verifyAndConsumeRecoveryCode(
  inputCode: string,
  storedHashedCodesJson?: string | null
): { valid: boolean; remainingHashes: string[] } {
  if (!storedHashedCodesJson) {
    return { valid: false, remainingHashes: [] };
  }

  let hashes: string[] = [];
  try {
    hashes = JSON.parse(storedHashedCodesJson);
    if (!Array.isArray(hashes)) return { valid: false, remainingHashes: [] };
  } catch {
    return { valid: false, remainingHashes: [] };
  }

  const inputHash = hashRecoveryCode(inputCode);
  const matchIndex = hashes.indexOf(inputHash);

  if (matchIndex === -1) {
    return { valid: false, remainingHashes: hashes };
  }

  // Consume the code
  const remainingHashes = hashes.filter((_, idx) => idx !== matchIndex);
  return { valid: true, remainingHashes };
}
