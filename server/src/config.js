import 'dotenv/config';
const e = process.env;
export const cfg = {
  port: Number(e.PORT) || 5000,
  jwt: e.JWT_SECRET || 'dev-secret-change-me',
  prod: e.NODE_ENV === 'production',
  origin: e.CLIENT_ORIGIN || false,
  mock: (e.PAYMENT_MODE || 'mock') !== 'razorpay',
  rzp: { id: e.RAZORPAY_KEY_ID, secret: e.RAZORPAY_KEY_SECRET, hook: e.RAZORPAY_WEBHOOK_SECRET },
  hold: Number(e.SLOT_HOLD_MINUTES) || 10,
  cutoff: Number(e.REFUND_CUTOFF_HOURS) || 2,
};
if (cfg.prod && cfg.jwt === 'dev-secret-change-me') throw new Error('Set JWT_SECRET in production');
if (!cfg.mock && !(cfg.rzp.id && cfg.rzp.secret && cfg.rzp.hook)) throw new Error('PAYMENT_MODE=razorpay needs RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, and RAZORPAY_WEBHOOK_SECRET');
