import * as crypto from 'crypto';

/**
 * Generates an RFC 9562 standard UUID version 7 string:
 * 48-bit timestamp | 4-bit ver (7) | 12-bit rand_a | 2-bit var (10) | 62-bit rand_b
 * Example output: "01923485-72f8-7b91-86d3-1a2b3c4d5e6f"
 */
export function generateUuidV7(): string {
  const timestamp = BigInt(Date.now());
  const randomBytes = crypto.randomBytes(10);

  // 48-bit timestamp in hex (12 hex characters)
  const timeHex = timestamp.toString(16).padStart(12, '0');

  // 12-bit rand_a with 4-bit version 7 (0x7)
  const randA =
    ((randomBytes[0] & 0x0f) | 0x70).toString(16).padStart(2, '0') +
    randomBytes[1].toString(16).padStart(2, '0');

  // 62-bit rand_b with 2-bit variant 10 (0b10 -> 0x80 | (byte & 0x3f))
  const varRandB = ((randomBytes[2] & 0x3f) | 0x80).toString(16).padStart(2, '0');
  const restRand = Array.from(randomBytes.slice(3))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const rawHex = timeHex + randA.slice(0, 4) + varRandB + restRand;

  return `${rawHex.slice(0, 8)}-${rawHex.slice(8, 12)}-${rawHex.slice(12, 16)}-${rawHex.slice(16, 20)}-${rawHex.slice(20, 32)}`;
}

/**
 * Generates an exact 10-digit numeric User ID derived from a 128-bit UUIDv7 (RFC 9562).
 * Result is strictly 10 digits (range: 1000000000 to 9999999999).
 */
export function generateNumericUuidV7(digits: number = 10): string {
  const uuid = generateUuidV7();
  const cleanHex = uuid.replace(/-/g, '').toLowerCase();
  const bigNum = BigInt('0x' + cleanHex);

  const min = 10n ** BigInt(digits - 1); // 1000000000n for 10 digits
  const range = 9n * min;                // 9000000000n for 10 digits
  const numericId = (bigNum % range) + min;

  return numericId.toString(10);
}

/**
 * Converts a standard 128-bit UUIDv7 hex string to a full numeric base-10 decimal string.
 */
export function uuidV7ToFullNumeric(uuid: string): string {
  const cleanHex = uuid.replace(/-/g, '').toLowerCase();
  return BigInt('0x' + cleanHex).toString(10);
}

export type TransactionTypePrefix =
  | 'EXPENSE'
  | 'INCOME'
  | 'TRANSFER'
  | 'TRANSFER_OUT'
  | 'TRANSFER_IN'
  | 'INVESTMENT'
  | 'INVESTMENT_BUY'
  | 'INVESTMENT_SELL'
  | 'BUY'
  | 'SELL'
  | 'ASSET'
  | 'GROUP';

/**
 * Returns the standard uppercase prefix for a transaction, asset, or group type:
 * - 'E' for EXPENSE
 * - 'I' for INCOME
 * - 'TE' for Outgoing Transfer ('TRANSFER', 'TRANSFER_OUT')
 * - 'TI' for Incoming Transfer ('TRANSFER_IN')
 * - 'PB' for Investment BUY ('BUY', 'INVESTMENT_BUY', 'INVESTMENT')
 * - 'PS' for Investment SELL ('SELL', 'INVESTMENT_SELL')
 * - 'A' for ASSET holding ('ASSET', 'HOLDING')
 * - 'G' for GROUP ('GROUP')
 */
export function getTransactionPrefix(type?: string | null): string {
  const normalized = (type || 'EXPENSE').toUpperCase().trim();
  if (normalized === 'INCOME') return 'I';
  if (normalized === 'TRANSFER_IN' || normalized === 'INCOMING_TRANSFER') return 'TI';
  if (normalized === 'TRANSFER' || normalized === 'TRANSFER_OUT' || normalized === 'OUTGOING_TRANSFER') return 'TE';
  if (normalized === 'INVESTMENT_SELL' || normalized === 'SELL') return 'PS';
  if (normalized === 'INVESTMENT' || normalized === 'INVESTMENT_BUY' || normalized === 'BUY') return 'PB';
  if (normalized === 'ASSET' || normalized === 'HOLDING') return 'A';
  if (normalized === 'GROUP') return 'G';
  if (normalized === 'EXPENSE') return 'E';
  return 'E';
}

/**
 * Generates an exact unique transaction, asset, or group tracking ID derived from a UUIDv7 (RFC 9562):
 * - For transfers ('TE' or 'TI'): Prefix followed by strictly 8 uppercase alphanumeric characters.
 * - For others ('A', 'G', 'E', 'I', 'PB', 'PS'): Prefix followed by strictly 9 uppercase alphanumeric characters.
 * No spaces or hyphens.
 * Examples: "G7W4TL78IP", "A7W4TL78IP", "E7W4TL78IP", "I5ZV0KQZT4", "TE3EL7Z1VU", "TI3EL7Z1VU", "PB2QAW4IPF", "PS8NM2LK4X"
 */
export function generateTransactionTrackingId(type?: string | null): string {
  const prefix = getTransactionPrefix(type);
  const isTransfer = prefix === 'TE' || prefix === 'TI';
  const uuid = generateUuidV7();
  const cleanHex = uuid.replace(/-/g, '').toLowerCase();
  const bigNum = BigInt('0x' + cleanHex);

  // If transfer: strictly 8 alphanumeric characters (from 36^7 to 36^8 - 1)
  // Otherwise: strictly 9 alphanumeric characters (from 36^8 to 36^9 - 1)
  const power = isTransfer ? 7n : 8n;
  const min = 36n ** power;
  const range = 35n * min;
  const alphanumericVal = (bigNum % range) + min;
  const body = alphanumericVal.toString(36).toUpperCase();

  return `${prefix}${body}`;
}

/**
 * Generates a unique tracking ID for an asset holding:
 * Prefix 'A' followed by strictly 9 uppercase alphanumeric characters (total length: 10).
 * Example: "A7W4TL78IP"
 */
export function generateAssetTrackingId(): string {
  return generateTransactionTrackingId('ASSET');
}

/**
 * Generates a unique tracking ID for a shared group:
 * Prefix 'G' followed by strictly 9 uppercase alphanumeric characters (total length: 10).
 * Example: "G7W4TL78IP"
 */
export function generateGroupTrackingId(): string {
  return generateTransactionTrackingId('GROUP');
}

/**
 * Derives a deterministic unique tracking ID for a transaction, asset, or group
 * based on the original ID, type, and target user ID.
 * Ensures that when a different or new user account imports an export file:
 * 1. The ID follows the standard prefix and length rules.
 * 2. It is strictly unique to the target user.
 * 3. Importing the same file multiple times yields the exact same ID, guaranteeing zero duplicates.
 */
export function deriveDeterministicTrackingId(
  originalId: string,
  type: string | null | undefined,
  targetUserId: string
): string {
  const prefix = getTransactionPrefix(type);
  const isTransfer = prefix === 'TE' || prefix === 'TI';
  const hash = crypto.createHash('sha256').update(`${originalId}:${targetUserId}`).digest('hex');
  const bigNum = BigInt('0x' + hash.slice(0, 16));
  const power = isTransfer ? 7n : 8n;
  const min = 36n ** power;
  const range = 35n * min;
  const alphanumericVal = (bigNum % range) + min;
  const body = alphanumericVal.toString(36).toUpperCase();
  return `${prefix}${body}`;
}

