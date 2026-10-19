import { Router } from 'express';
import { z } from 'zod';
import { prisma, audit } from '../db.js';
import { auth, role } from '../middleware/auth.js';

const r = Router();
r.use(auth, role('DOCTOR'));
r.use(async (req, res, next) => {
  req.doctor = await prisma.doctor.findUnique({ where: { userId: req.user.id } });
  req.doctor ? next() : res.status(404).json({ error: 'Doctor profile not found' });
});

r.get('/me', (req, res) => {
  const { id, specialty, qualification, registrationNo, experienceYears, languages, bio, fee, status, rejectionReason } = req.doctor;
  res.json({ id, specialty, qualification, registrationNo, experienceYears, languages, bio, fee, status, rejectionReason });
});

const patch = z.object({
  fee: z.coerce.number().int().min(1).max(100000).optional(),
  languages: z.string().trim().max(100).optional(),
  bio: z.string().trim().max(600).optional(),
});
r.patch('/me', async (req, res) => {
  const p = patch.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  await prisma.doctor.update({ where: { id: req.doctor.id }, data: p.data });
  res.json({ ok: true });
});

r.get('/slots', async (req, res) => {
  res.json(
    await prisma.slot.findMany({
      where: { doctorId: req.doctor.id, startsAt: { gt: new Date() } },
      orderBy: { startsAt: 'asc' },
      select: { id: true, startsAt: true, status: true },
    })
  );
});

r.post('/slots', async (req, res) => {
  const times = [...new Set((Array.isArray(req.body.times) ? req.body.times : []).map((t) => new Date(t).getTime()))]
    .filter((t) => Number.isFinite(t) && t > Date.now())
    .slice(0, 50);
  if (!times.length) return res.status(400).json({ error: 'Pick a time in the future' });
  const out = await prisma.slot.createMany({
    data: times.map((t) => ({ doctorId: req.doctor.id, startsAt: new Date(t) })),
    skipDuplicates: true,
  });
  res.status(201).json({ added: out.count });
});

r.delete('/slots/:id', async (req, res) => {
  const out = await prisma.slot.deleteMany({ where: { id: req.params.id, doctorId: req.doctor.id, status: 'FREE', appointments: { none: {} } } });
  out.count ? res.json({ ok: true }) : res.status(409).json({ error: 'Only unused slots can be removed' });
});

r.get('/appointments', async (req, res) => {
  const list = await prisma.appointment.findMany({
    where: { doctorId: req.doctor.id, status: { in: ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'REFUNDED', 'NO_SHOW'] } },
    include: { patient: { select: { name: true } } },
    orderBy: { startsAt: 'desc' },
    take: 100,
  });
  res.json(list.map((a) => ({ id: a.id, startsAt: a.startsAt, status: a.status, fee: a.fee, patientName: a.patient.name, notes: a.notes })));
});

r.post('/appointments/:id/start', async (req, res) => {
  const u = await prisma.appointment.updateMany({
    where: { id: req.params.id, doctorId: req.doctor.id, status: 'CONFIRMED' },
    data: { status: 'IN_PROGRESS' },
  });
  u.count ? res.json({ ok: true }) : res.status(409).json({ error: 'This appointment cannot be started' });
});

r.post('/appointments/:id/complete', async (req, res) => {
  const notes = String(req.body.notes || '').trim().slice(0, 4000);
  if (!notes) return res.status(400).json({ error: 'Add consultation notes before completing' });
  const u = await prisma.appointment.updateMany({
    where: { id: req.params.id, doctorId: req.doctor.id, status: 'IN_PROGRESS' },
    data: { status: 'COMPLETED', notes },
  });
  if (!u.count) return res.status(409).json({ error: 'This appointment is not in progress' });
  await audit(req.user.id, 'CONSULTATION_COMPLETED', 'Appointment', req.params.id);
  res.json({ ok: true });
});

export default r;
