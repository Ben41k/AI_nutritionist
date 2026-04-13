import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export type JwtPayload = {
  sub: string;
  email: string;
  role: 'USER' | 'ADMIN';
};

const COOKIE = 'access_token';
const MAX_AGE_SEC = 60 * 60 * 24 * 7;

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: MAX_AGE_SEC });
}

export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, config.jwtSecret) as JwtPayload;
  return decoded;
}

export const authCookie = {
  name: COOKIE,
  maxAgeSec: MAX_AGE_SEC,
};
