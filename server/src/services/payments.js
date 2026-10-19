import crypto from 'crypto';
import Razorpay from 'razorpay';
import { cfg } from '../config.js';
import { prisma, audit } from '../db.js';

const rzp = !cfg.mock ? new Razorpay({ key_id: cfg.rzp.id, key_secret: cfg.rzp.secret }) : null;

export const hmac = (secret, data) => crypto.createHmac('sha256', secret || '').update(data).digest('hex');
export const safeEq = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

export async function createOrder(a) {
  const amount = a.fee * 100; // paise
  let orderId;
  if (rzp) {
    const o = await rzp.orders.create({ amount, currency: 'INR', receipt: a.id, notes: { appointmentId: a.id } });
    orderId = o.id;
  } else {
    orderId = 'order_mock_' + crypto.randomBytes(8).toString('hex');
  }
  await prisma.payment.create({ data: { appointmentId: a.id, orderId, amount } });
  return { orderId, amount, currency: 'INR', keyId: cfg.rzp.id || null, mock: !rzp };
}

/**
 * Idempotent: the conditional UPDATE "claims" the payment exactly once, so a duplicate
 * webhook, a verify call racing the webhook, or a retry can never confirm twice.
 */
export async function confirmPayment(orderId, paymentId) {
  const out = await prisma.$transaction(async (tx) => {
    const claim = await tx.payment.updateMany({
      where: { orderId, status: 'CREATED' },
      data: { status: 'PAID', paymentId, paidAt: new Date() },
    });
    const p = await tx.payment.findUnique({ where: { orderId } });
    if (!p) return { error: 'Unknown order' };
    if (claim.count === 0) return { duplicate: true };
    const u = await tx.appointment.updateMany({
      where: { id: p.appointmentId, status: 'PENDING_PAYMENT' },
      data: { status: 'CONFIRMED' },
    });
    if (u.count === 0) return { late: true, appointmentId: p.appointmentId }; // slot hold expired
    const appt = await tx.appointment.findUnique({ where: { id: p.appointmentId } });
    await tx.slot.update({ where: { id: appt.slotId }, data: { status: 'BOOKED', heldUntil: null } });
    return { confirmed: true, paymentRowId: p.id };
  });
  if (out.late) {
    await refund(out.appointmentId, 'LATE_PAYMENT');
  } else if (out.confirmed) {
    await audit(null, 'PAYMENT_CONFIRMED', 'Payment', out.paymentRowId, { orderId, paymentId });
  }
  return out;
}

export async function refund(appointmentId, reason) {
  const p = await prisma.payment.findUnique({ where: { appointmentId } });
  if (!p || p.status !== 'PAID') return null;
  const claim = await prisma.payment.updateMany({ where: { id: p.id, status: 'PAID' }, data: { status: 'REFUNDED' } });
  if (!claim.count) return null;
  try {
    if (rzp) await rzp.payments.refund(p.paymentId, { amount: p.amount, notes: { reason } });
  } catch (e) {
    await prisma.payment.update({ where: { id: p.id }, data: { status: 'PAID' } });
    throw e;
  }
  await audit(null, 'REFUND', 'Payment', p.id, { reason });
  return p;
}
