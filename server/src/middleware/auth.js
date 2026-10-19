import jwt from 'jsonwebtoken';
import { cfg } from '../config.js';
import { prisma } from '../db.js';

export const COOKIE = 'mc_token';

export const setCookie = (res, u) =>
  res.cookie(COOKIE, jwt.sign({ sub: u.id, role: u.role }, cfg.jwt, { expiresIn: '7d' }), {
    httpOnly: true,
    sameSite: 'lax',
    secure: cfg.prod,
    maxAge: 7 * 24 * 3600 * 1000,
  });

export async function userFromToken(token) {
  if (!token) return null;
  try {
    const p = jwt.verify(token, cfg.jwt);
    const u = await prisma.user.findUnique({ where: { id: p.sub } });
    return u && u.active ? u : null;
  } catch {
    return null;
  }
}

export async function auth(req, res, next) {
  const u = await userFromToken(req.cookies[COOKIE]);
  if (!u) return res.status(401).json({ error: 'Please log in' });
  req.user = u;
  next();
}

export const role = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Not allowed' });
