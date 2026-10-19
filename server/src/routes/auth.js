import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { prisma, audit } from '../db.js';
import { auth, setCookie, COOKIE } from '../middleware/auth.js';

const r = Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
const pub = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role });

const schema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().max(24).optional(),
  password: z.string().min(8).max(100),
  role: z.enum(['PATIENT', 'DOCTOR']).default('PATIENT'),
  doctor: z
    .object({
      specialty: z.string().trim().min(2).max(60),
      qualification: z.string().trim().min(2).max(120),
      registrationNo: z.string().trim().min(3).max(40),
      fee: z.coerce.number().int().min(1).max(100000),
      experienceYears: z.coerce.number().int().min(0).max(70).default(0),
      languages: z.string().trim().max(100).default('English'),
    })
    .optional(),
});

r.post('/register', limiter, async (req, res) => {
  const p = schema.safeParse(req.body);
  if (!p.success) {
    const i = p.error.issues[0];
    return res.status(400).json({ error: `${i.path.join('.')}: ${i.message}` });
  }
  const d = p.data;
  if (d.role === 'DOCTOR' && !d.doctor) return res.status(400).json({ error: 'Doctor details are required' });
  const phone = String(d.phone || '').replace(/[\\s()-]/g, '');
  if (d.role === 'DOCTOR' && !/^\\+?[1-9]\\d{7,14}$/.test(phone)) return res.status(400).json({ error: 'Doctors must provide a valid phone number with country code, e.g. +919876543210' });
  if (phone && !/^\\+?[1-9]\\d{7,14}$/.test(phone)) return res.status(400).json({ error: 'Enter a valid phone number with country code, e.g. +919876543210' });
  if (await prisma.user.findUnique({ where: { email: d.email } }))
    return res.status(409).json({ error: 'That email is already registered' });
  const u = await prisma.user.create({
    data: {
      name: d.name,
      email: d.email,
      phone: phone || null,
      passwordHash: await bcrypt.hash(d.password, 11),
      role: d.role,
      ...(d.role === 'DOCTOR' ? { doctor: { create: d.doctor } } : {}), // status defaults to PENDING
    },
  });
  await audit(u.id, 'REGISTER', 'User', u.id, { role: u.role });
  setCookie(res, u);
  res.status(201).json(pub(u));
});

r.post('/login', limiter, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const u = await prisma.user.findUnique({ where: { email } });
  if (!u || !u.active || !(await bcrypt.compare(String(req.body.password || ''), u.passwordHash)))
    return res.status(401).json({ error: 'Wrong email or password' });
  setCookie(res, u);
  res.json(pub(u));
});

r.post('/logout', (req, res) => {
  res.clearCookie(COOKIE);
  res.json({ ok: true });
});

r.get('/me', auth, async (req, res) => {
  const d = req.user.role === 'DOCTOR' ? await prisma.doctor.findUnique({ where: { userId: req.user.id } }) : null;
  res.json({ ...pub(req.user), doctorStatus: d?.status });
});

export default r;
