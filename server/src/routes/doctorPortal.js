import { Router } from 'express';
import { z } from 'zod';
import { prisma, audit } from '../db.js';
import { auth, role } from '../middleware/auth.js';
import { ensureUpcomingSlots } from '../services/availability.js';

const r = Router();
r.use(auth, role('DOCTOR'));
r.use(async (req, res, next) => {
  req.doctor = await prisma.doctor.findUnique({ where: { userId: req.user.id } });
  req.doctor ? next() : res.status(404).json({ error: 'Doctor profile not found' });
});

r.get('/me', (req, res) => {
  const { id, specialty, qualification, registrationNo, experienceYears, languages, bio, profileImage, fee, status, rejectionReason, weeklySchedule, slotDurationMinutes } = req.doctor;
  res.json({ id, specialty, qualification, registrationNo, experienceYears, languages, bio, profileImage, fee, status, rejectionReason, weeklySchedule: weeklySchedule || [], slotDurationMinutes, phone: req.user.phone || '' });
});

const patch = z.object({
  fee: z.coerce.number().int().min(1).max(100000).optional(),
  languages: z.string().trim().max(100).optional(),
  bio: z.string().trim().max(600).optional(),
  profileImage: z.union([z.string().max(1000000), z.null()]).optional(),
  phone: z.string().trim().max(24).optional(),
});
r.patch('/me', async (req, res) => {
  const p = patch.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.issues[0].message });
  const phone = p.data.phone === undefined ? undefined : p.data.phone.replace(/[\s()-]/g, '');
  if (phone !== undefined && phone && !/^\+?[1-9]\d{7,14}$/.test(phone)) return res.status(400).json({ error: 'Enter a valid phone number with country code, e.g. +919876543210' });
  const { phone: _phone, ...doctorData } = p.data;
  await prisma.$transaction(async (tx) => {
    await tx.doctor.update({ where: { id: req.doctor.id }, data: doctorData });
    if (phone !== undefined) await tx.user.update({ where: { id: req.user.id }, data: { phone: phone || null } });
  });
  res.json({ ok: true });
});


const scheduleInput = z.object({
  durationMinutes: z.coerce.number().int().min(5).max(120),
  weeklySchedule: z.array(z.object({
    weekday: z.coerce.number().int().min(0).max(6),
    start: z.string().regex(/^([01]\\d|2[0-3]):[0-5]\\d$/),
    end: z.string().regex(/^([01]\\d|2[0-3]):[0-5]\\d$/),
  })).max(14),
});
r.put('/availability', async (req, res) => {
  const parsed = scheduleInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { weeklySchedule, durationMinutes } = parsed.data;
  for (const rule of weeklySchedule) {
    const toMinutes = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3));
    if (toMinutes(rule.end) <= toMinutes(rule.start)) return res.status(400).json({ error: 'Each end time must be later than its start time on the same day' });
  }
  const deduped = [...new Map(weeklySchedule.map((rule) => [`${rule.weekday}-${rule.start}-${rule.end}`, rule])).values()];
  await prisma.$transaction(async (tx) => {
    await tx.doctor.update({ where: { id: req.doctor.id }, data: { weeklySchedule: deduped, slotDurationMinutes: durationMinutes } });
    // Remove only future free slots with no appointments; held/booked slots are preserved.
    await tx.slot.deleteMany({ where: { doctorId: req.doctor.id, startsAt: { gt: new Date() }, status: 'FREE', appointments: { none: {} } } });
  });
  const added = await ensureUpcomingSlots(prisma, req.doctor.id, deduped, durationMinutes);
  await audit(req.user.id, 'AVAILABILITY_SCHEDULE_UPDATED', 'Doctor', req.doctor.id, { rules: deduped.length, durationMinutes, slotsGenerated: added });
  res.json({ ok: true, weeklySchedule: deduped, durationMinutes, slotsGenerated: added });
});

r.get('/slots', async (req, res) => {
  await ensureUpcomingSlots(prisma, req.doctor.id, req.doctor.weeklySchedule, req.doctor.slotDurationMinutes);
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
  res.json(list.map((a) => ({ id: a.id, startsAt: a.startsAt, status: a.status, fee: a.fee, patientName: a.patient.name, notes: a.notes, meetUrl: a.meetUrl })));
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
