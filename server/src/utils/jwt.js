import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

export const signToken = (user) =>
  jwt.sign(
    { sub: user._id.toString(), role: user.role },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn, issuer: 'fitgen' },
  );

export const verifyToken = (token) =>
  jwt.verify(token, env.jwtSecret, { issuer: 'fitgen' });
