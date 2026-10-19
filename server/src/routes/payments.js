import { Router } from 'express';
import { prisma } from '../db.js';
import { auth, role } from '../middleware/auth.js';
import { cfg } from '../config.js';
import { confirmPayment, hmac, safeEq } from '../services/payments.js';
import crypto from 'crypto';

const r = Router();

// Called by the browser after Razorpay Checkout succeeds.
r.post('/verify', auth, role('PATIENT'), async (req, res) => {
  const { razorpay_order_id: orderId, razorpay_payment_id: paymentId, razorpay_signature: sig } = req.body;
  const mine = await prisma.payment.findFirst({
    where: { orderId: String(orderId), appointment: { patientId: req.user.id } },
  });
  if (!mine) return res.status(404).json({ error: 'Order not found' });
  if (cfg.mock || !safeEq(hmac(cfg.rzp.secret, `${orderId}|${paymentId}`), sig || ''))
    return res.status(400).json({ error: 'Payment signature mismatch' });
  const result = await confirmPayment(orderId, paymentId);
  if (result.error) return res.status(404).json({ error: result.error });
  if (result.late) return res.status(409).json({ error: 'Payment arrived after the booking hold expired. A refund has been initiated; please book another slot.' });
  res.json({ ok: true, duplicate: Boolean(result.duplicate) });
});

// Test-mode "Pay" button. Disabled automatically when PAYMENT_MODE=razorpay.
r.post('/mock-pay', auth, role('PATIENT'), async (req, res) => {
  if (!cfg.mock) return res.status(404).json({ error: 'Not available' });
  const p = await prisma.payment.findFirst({
    where: { appointmentId: String(req.body.appointmentId), appointment: { patientId: req.user.id } },
  });
  if (!p) return res.status(404).json({ error: 'Order not found' });
  await confirmPayment(p.orderId, 'pay_mock_' + crypto.randomBytes(6).toString('hex'));
  res.json({ ok: true });
});

// Razorpay -> server webhook. Mounted with express.raw() in index.js so the signature
// is computed over the exact bytes Razorpay sent.
export async function webhook(req, res) {
  const raw = req.body;
  const sig = req.get('x-razorpay-signature') || '';
  if (!cfg.rzp.hook || !safeEq(hmac(cfg.rzp.hook, raw), sig)) return res.status(400).end();

  const eventId = req.get('x-razorpay-event-id') || crypto.createHash('sha256').update(raw).digest('hex');
  try {
    await prisma.webhookEvent.create({ data: { id: eventId } });
  } catch (e) {
    if (e.code === 'P2002') return res.json({ duplicate: true }); // already processed
    throw e;
  }
  try {
    const ev = JSON.parse(raw.toString());
    const pay = ev.payload?.payment?.entity;
    if ((ev.event === 'payment.captured' || ev.event === 'order.paid') && pay) await confirmPayment(pay.order_id, pay.id);
  } catch (e) {
    await prisma.webhookEvent.delete({ where: { id: eventId } }).catch(() => {}); // let Razorpay retry
    throw e;
  }
  res.json({ ok: true });
}

export default r;
