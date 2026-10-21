import { Router } from 'express';
import { prisma } from '../db.js';

// PUBLIC routes. A doctor is only ever listed here after an admin has set status = APPROVED.
const r = Router();

const card = (d) => ({
  id: d.id,
  name: d.user.name,
  specialty: d.specialty,
  qualification: d.qualification,
  registrationNo: d.registrationNo,
  experienceYears: d.experienceYears,
  languages: d.languages,
  bio: d.bio,
  profileImage: d.profileImage,
  fee: d.fee,
});

r.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim();
  const specialty = String(req.query.specialty || '').trim();
  const maxFee = Number(req.query.maxFee) || 0;
  const list = await prisma.doctor.findMany({
    where: {
      status: 'APPROVED',
      user: { active: true },
      ...(specialty ? { specialty: { equals: specialty, mode: 'insensitive' } } : {}),
      ...(maxFee ? { fee: { lte: maxFee } } : {}),
      ...(q
        ? {
            OR: [
              { user: { name: { contains: q, mode: 'insensitive' } } },
              { specialty: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    include: { user: { select: { name: true } } },
    orderBy: { experienceYears: 'desc' },
  });
  res.json(list.map(card));
});

r.get('/specialties', async (req, res) => {
  const rows = await prisma.doctor.findMany({
    where: { status: 'APPROVED' },
    distinct: ['specialty'],
    select: { specialty: true },
    orderBy: { specialty: 'asc' },
  });
  res.json(rows.map((x) => x.specialty));
});

r.get('/:id', async (req, res) => {
  const d = await prisma.doctor.findFirst({
    where: { id: req.params.id, status: 'APPROVED', user: { active: true } },
    include: { user: { select: { name: true } } },
  });
  if (!d) return res.status(404).json({ error: 'Doctor not found' });
  const now = new Date();
  const slots = await prisma.slot.findMany({
    where: {
      doctorId: d.id,
      startsAt: { gt: now },
      OR: [{ status: 'FREE' }, { status: 'HELD', heldUntil: { lt: now } }],
    },
    orderBy: { startsAt: 'asc' },
    take: 60,
    select: { id: true, startsAt: true },
  });
  res.json({ ...card(d), slots });
});

export default r;
