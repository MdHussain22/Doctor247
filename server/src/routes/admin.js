import { Router } from 'express';
import { prisma, audit, feePercent } from '../db.js';
import { auth, role } from '../middleware/auth.js';

const r = Router();
r.use(auth, role('ADMIN'));

r.get('/summary', async (req, res) => {
  const [verified, pending, bookings, paid, refunded, pct] = await Promise.all([
    prisma.doctor.count({ where: { status: 'APPROVED' } }),
    prisma.doctor.count({ where: { status: 'PENDING' } }),
    prisma.appointment.count(),
    prisma.payment.aggregate({ where: { status: 'PAID' }, _sum: { amount: true } }),
    prisma.payment.aggregate({ where: { status: 'REFUNDED' }, _sum: { amount: true } }),
    feePercent(),
  ]);
  const collected = (paid._sum.amount || 0) / 100;
  const platformShare = Math.round((collected * pct) / 100);
  res.json({
    verifiedDoctors: verified,
    pendingDoctors: pending,
    bookings,
    collected,
    refunded: (refunded._sum.amount || 0) / 100,
    platformFeePercent: pct,
    platformShare,
    doctorShare: collected - platformShare,
  });
});

r.get('/doctors', async (req, res) => {
  const status = ['PENDING', 'APPROVED', 'REJECTED'].includes(req.query.status) ? req.query.status : 'PENDING';
  const list = await prisma.doctor.findMany({
    where: { status },
    include: { user: { select: { name: true, email: true } } },
    orderBy: { createdAt: 'asc' },
  });
  res.json(list.map((d) => ({ id: d.id, name: d.user.name, email: d.user.email, specialty: d.specialty, qualification: d.qualification, registrationNo: d.registrationNo, experienceYears: d.experienceYears, fee: d.fee, status: d.status })));
});

r.post('/doctors/:id/approve', async (req, res) => {
  const d = await prisma.doctor.update({ where: { id: req.params.id }, data: { status: 'APPROVED', verifiedAt: new Date(), verifiedById: req.user.id, rejectionReason: null } });
  await audit(req.user.id, 'DOCTOR_APPROVED', 'Doctor', d.id);
  res.json({ ok: true });
});

r.post('/doctors/:id/reject', async (req, res) => {
  const reason = String(req.body.reason || '').trim().slice(0, 300) || 'Credentials could not be verified';
  const d = await prisma.doctor.update({ where: { id: req.params.id }, data: { status: 'REJECTED', rejectionReason: reason, verifiedById: req.user.id } });
  await audit(req.user.id, 'DOCTOR_REJECTED', 'Doctor', d.id, { reason });
  res.json({ ok: true });
});

r.get('/appointments', async (req, res) => {
  const list = await prisma.appointment.findMany({
    include: { patient: { select: { name: true } }, doctor: { include: { user: { select: { name: true } } } }, payment: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json(list.map((a) => ({ id: a.id, startsAt: a.startsAt, status: a.status, fee: a.fee, patient: a.patient.name, doctor: a.doctor.user.name, paymentStatus: a.payment?.status || null })));
});

r.get('/audit', async (req, res) => {
  res.json(await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }));
});

r.put('/settings/fee', async (req, res) => {
  const pct = Number(req.body.percent);
  if (!Number.isFinite(pct) || pct < 0 || pct > 30) return res.status(400).json({ error: 'Enter a percentage from 0 to 30' });
  await prisma.setting.upsert({ where: { key: 'platformFeePercent' }, update: { value: String(pct) }, create: { key: 'platformFeePercent', value: String(pct) } });
  await audit(req.user.id, 'FEE_PERCENT_CHANGED', 'Setting', 'platformFeePercent', { pct });
  res.json({ ok: true });
});

export default r;
