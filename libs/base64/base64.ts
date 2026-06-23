import { ethers } from 'ethers';

/** Convert base64url to standard base64 with padding */
function base64URLtoBase64(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  if (pad) {
    base64 += '='.repeat(4 - pad);
  }
  return base64;
}

export function base64URLdecode(str: string): string {
  return atob(base64URLtoBase64(str))
    .split('')
    .map((char) => String.fromCharCode(char.charCodeAt(0)))
    .join('');
}

export function base64URLencode(str: string): string {
  const base64Encoded = ethers.encodeBase64(ethers.toUtf8Bytes(str));

  return base64Encoded.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function toURLEncode(base64str: string): string {
  return base64str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function StringToUint8Array(str: string): Uint8Array {
  const r = new Uint8Array(str.length);

  for (let i = 0; i < str.length; i++) {
    r[i] = str.charCodeAt(i);
  }

  return r;
}

export function Uint8ArrayToString(uint8Array: Uint8Array): string {
  let string = '';

  uint8Array.forEach((byte) => (string = string + String.fromCharCode(byte)));

  return string;
}

export function base64URLtoArrayBuffer(base64url: string): ArrayBuffer {
  const binaryString = atob(base64URLtoBase64(base64url));
  const bytes = new Uint8Array(binaryString.length);

  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return bytes.buffer;
}
