import { OAuth2Client } from 'google-auth-library';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

const client = new OAuth2Client(env.googleClientId);

/**
 * Verifies a Google ID token (JWT) issued to *our* client id.
 *
 * The client obtains this token via Google Identity Services and posts it here;
 * we never see or store a password. Verification checks Google's signature, the
 * `aud` claim (our client id) and expiry, so a token minted for another app is
 * rejected.
 */
export const verifyGoogleIdToken = async (idToken) => {
  if (!idToken || typeof idToken !== 'string') {
    throw ApiError.badRequest('A Google ID token (credential) is required');
  }

  let ticket;
  try {
    ticket = await client.verifyIdToken({
      idToken,
      audience: env.googleClientId,
    });
  } catch (err) {
    throw ApiError.unauthorized(`Invalid Google credential: ${err.message}`);
  }

  const payload = ticket.getPayload();

  if (!payload?.sub || !payload.email) {
    throw ApiError.unauthorized('Google credential is missing required claims');
  }

  if (payload.email_verified === false) {
    throw ApiError.unauthorized('Your Google email address is not verified');
  }

  return {
    googleId: payload.sub,
    email: payload.email.toLowerCase(),
    name: payload.name || payload.email.split('@')[0],
    avatarUrl: payload.picture,
  };
};
