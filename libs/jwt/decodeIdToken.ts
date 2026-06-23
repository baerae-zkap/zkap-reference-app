import { jwtDecode } from 'jwt-decode';

interface IdTokenClaims {
  iss: string;
  sub: string;
  aud: string | string[];
  exp: number;
  iat: number;
  email?: string;
  name?: string;
  nickname?: string;
  // Kakao specific
  preferred_username?: string;
}

export interface DecodedIdToken {
  iss: string;
  sub: string;
  aud: string; // First element when the JWT aud is an array.
  identifier: string;
}

/**
 * Decode an ID token and extract the claims needed by the app.
 */
export function decodeIdToken(idToken: string): DecodedIdToken {
  const claims = jwtDecode<IdTokenClaims>(idToken);

  return {
    iss: claims.iss,
    sub: claims.sub,
    aud: Array.isArray(claims.aud) ? claims.aud[0] : claims.aud,
    identifier: getIdentifier(claims),
  };
}

/**
 * Extract a human-readable identifier from claims.
 * Priority: name > email > nickname > preferred_username > 'Account'
 */
function getIdentifier(claims: IdTokenClaims): string {
  return (
    claims.name ||
    claims.email ||
    claims.nickname ||
    claims.preferred_username ||
    'Account'
  );
}

interface JwtHeader {
  alg: string;
  kid: string;
  typ?: string;
}

/**
 * Extract the key ID (kid) from the JWT header.
 */
export function extractJwtKid(idToken: string): string {
  const header = jwtDecode<JwtHeader>(idToken, { header: true });
  if (!header.kid) {
    throw new Error('JWT header does not contain kid');
  }
  return header.kid;
}
