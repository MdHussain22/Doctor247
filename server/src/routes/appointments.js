import { Router } from 'express';
import { prisma, audit, getAppointmentFor } from '../db.js';
import { auth, role } from '../middleware/auth.js';
import { cfg } from '../config.js';
import { createOrder, refund } from '../services/payments.js';

const r = Router();
r.use(auth);

const include = { doctor: { include: { user: { select: { name: true, phone: true } } } }, payment: true };
const shape = (a) => ({
  id: a.id,
  startsAt: a.startsAt,
  status: a.status,
  fee: a.fee,
  notes: a.status === 'COMPLETED' ? a.notes : null,
  doctor: {
    name: a.doctor.user.name,
    specialty: a.doctor.specialty,
    phone: a.payment?.status === 'PAID' && !['CANCELLED', 'REFUNDED'].includes(a.status) ? a.doctor.user.phone : null,
  },
  meetUrl: a.payment?.status === 'PAID' && !['CANCELLED', 'REFUNDED'].includes(a.status) ? a.meetUrl : null,
  paymentStatus: a.payment?.status || null,
});

r.get('/', role('PATIENT'), async (req, res) => {
  const list = await prisma.appointment.findMany({
    where: { patientId: req.user.id },
    include,
    orderBy: { startsAt: 'desc' },
  });
  res.json(list.map(shape));
});

// Step 1 of booking: hold the slot (atomically) and create the payment order.
r.post('/', role('PATIENT'), async (req, res) => {
  const slotId = String(req.body.slotId || '');
  const now = new Date();
  const slot = await prisma.slot.findUnique({ where: { id: slotId }, include: { doctor: true } });
  if (!slot || slot.doctor.status !== 'APPROVED' || slot.startsAt <= now)
    return res.status(404).json({ error: 'That slot is not available' });

  // One conditional UPDATE = double-booking protection. Only one request can win it.
  const held = await prisma.slot.updateMany({
    where: { id: slotId, OR: [{ status: 'FREE' }, { status: 'HELD', heldUntil: { lt: now } }] },
    data: { status: 'HELD', heldUntil: new Date(now.getTime() + cfg.hold * 60000) },
  });
  if (held.count !== 1) return res.status(409).json({ error: 'That slot was just taken. Please pick another.' });

  await prisma.appointment.updateMany({ where: { slotId, status: 'PENDING_PAYMENT' }, data: { status: 'CANCELLED' } });
  const appointment = await prisma.appointment.create({
    data: { patientId: req.user.id, doctorId: slot.doctorId, slotId, startsAt: slot.startsAt, fee: slot.doctor.fee },
  });
  const order = await createOrder(appointment);
  await audit(req.user.id, 'BOOKING_STARTED', 'Appointment', appointment.id);
  res.status(201).json({ appointment: { id: appointment.id, fee: appointment.fee, startsAt: appointment.startsAt }, order });
});

r.post('/:id/cancel', role('PATIENT'), async (req, res) => {
  const a = await prisma.appointment.findFirst({ where: { id: req.params.id, patientId: req.user.id } });
  if (!a) return res.status(404).json({ error: 'Appointment not found' });

  if (a.status === 'PENDING_PAYMENT') {
    await prisma.$transaction(async (tx) => {
      const u = await tx.appointment.updateMany({ where: { id: a.id, status: 'PENDING_PAYMENT' }, data: { status: 'CANCELLED' } });
      if (u.count) await tx.slot.updateMany({ where: { id: a.slotId, status: 'HELD' }, data: { status: 'FREE', heldUntil: null } });
    });
    return res.json({ status: 'CANCELLED' });
  }
  if (a.status !== 'CONFIRMED') return res.status(409).json({ error: 'This appointment can no longer be cancelled' });
  if (a.startsAt.getTime() - Date.now() < cfg.cutoff * 3600 * 1000)
    return res.status(409).json({ error: `Cancellations close ${cfg.cutoff} hours before the visit` });

  await refund(a.id, 'PATIENT_CANCEL');
  await prisma.$transaction([
    prisma.appointment.update({ where: { id: a.id }, data: { status: 'REFUNDED' } }),
    prisma.slot.update({ where: { id: a.slotId }, data: { status: 'FREE', heldUntil: null } }),
  ]);
  await audit(req.user.id, 'APPOINTMENT_CANCELLED', 'Appointment', a.id);
  res.json({ status: 'REFUNDED' });
});

// Chat history: only the appointment's own patient and doctor can read it.
r.get('/:id/messages', async (req, res) => {
  const a = await getAppointmentFor(req.user, req.params.id);
  if (!a) return res.status(404).json({ error: 'Not found' });
  const rows = await prisma.message.findMany({
    where: { appointmentId: a.id },
    include: { sender: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
    take: 200,
  });
  res.json(rows.map((m) => ({ id: m.id, senderId: m.senderId, senderName: m.sender.name, body: m.body, createdAt: m.createdAt })));
});

export default r;
