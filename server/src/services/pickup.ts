import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

const key = (purpose: string) => createHmac('sha256', config.PICKUP_SECRET).update(purpose).digest();
const pinKey = key('foodshare/pickup/pin/v1');
const encryptionKey = key('foodshare/pickup/encryption/v1');

function pinHash(establishmentId: string, pin: string) {
  return createHmac('sha256', pinKey).update(`${establishmentId}:${pin}`).digest('hex');
}

function qrHash(qrToken: string) {
  return createHash('sha256').update(qrToken).digest('hex');
}

export function generatePickup(orderId: string, establishmentId: string) {
  const pin = String(randomInt(10_000)).padStart(4, '0');
  const qrToken = randomBytes(32).toString('base64url');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
  cipher.setAAD(Buffer.from(orderId));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify({ pin, qrToken })), cipher.final()]);

  return {
    pickupPinHash: pinHash(establishmentId, pin),
    pickupQrHash: qrHash(qrToken),
    pickupCredentialsCiphertext: Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url'),
  };
}

export function readPickup(orderId: string, ciphertext: string): { pin: string; qrToken: string } {
  const data = Buffer.from(ciphertext, 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey, data.subarray(0, 12));
  decipher.setAAD(Buffer.from(orderId));
  decipher.setAuthTag(data.subarray(12, 28));
  const plaintext = Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8'));
}

export type PickupProof = { pin: string } | { qrToken: string };
export function verifyPickup(
  order: { establishmentId: string; pickupPinHash: string | null; pickupQrHash: string | null },
  proof: PickupProof,
) {
  const usingPin = 'pin' in proof;
  const expected = usingPin ? order.pickupPinHash : order.pickupQrHash;
  const supplied = usingPin ? pinHash(order.establishmentId, proof.pin) : qrHash(proof.qrToken);
  return expected !== null && /^[a-f0-9]{64}$/.test(expected)
    && timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(supplied, 'hex'));
}
