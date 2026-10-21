import 'express-async-errors';
import express from 'express';
import http from 'http';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { cfg } from './config.js';
import { prisma } from './db.js';
import authRoutes from './routes/auth.js';
import doctorRoutes from './routes/doctors.js';
import appointmentRoutes from './routes/appointments.js';
import paymentRoutes, { webhook } from './routes/payments.js';
import doctorPortal from './routes/doctorPortal.js';
import medicalRecords from './routes/medicalRecords.js';
import adminRoutes from './routes/admin.js';
import { initSocket } from './socket.js';

const app = express();
app.set('trust proxy', 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        'script-src': ["'self'", 'https://checkout.razorpay.com'],
        'frame-src': ['https://api.razorpay.com', 'https://checkout.razorpay.com'],
        'connect-src': ["'self'", 'ws:', 'wss:', 'https://lumberjack.razorpay.com'],
        'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        'font-src': ["'self'", 'https://fonts.gstatic.com'],
        'img-src': ["'self'", 'data:', 'https:'],
      },
    },
  })
);
app.use(cors({ origin: cfg.origin, credentials: true }));

// The webhook needs the raw body for signature checks, so it is registered BEFORE express.json().
app.post('/api/payments/webhook', express.raw({ type: 'application/json', limit: '200kb' }), webhook);

app.use('/api/medical-records', express.json({ limit: '6mb' }));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({
  ok: true,
  paymentMode: cfg.mock ? 'mock' : 'razorpay',
  googleMeetConfigured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN),
  emailConfigured: Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL),
}));
app.use('/api/auth', authRoutes);
app.use('/api/doctors', doctorRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/doctor', doctorPortal);
app.use('/api/medical-records', medicalRecords);
app.use('/api/admin', adminRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// In production, Express also serves the built React app (client/dist).
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api|socket\.io).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, req, res, next) => {
  if (err.code === 'P2002') return res.status(409).json({ error: 'That record already exists' });
  if (err.code === 'P2025') return res.status(404).json({ error: 'Not found' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

const server = http.createServer(app);
initSocket(server);

// Release slots whose payment window expired.
setInterval(async () => {
  try {
    const stale = await prisma.appointment.findMany({
      where: { status: 'PENDING_PAYMENT', slot: { status: 'HELD', heldUntil: { lt: new Date() } } },
      select: { id: true, slotId: true },
    });
    for (const a of stale) {
      await prisma.$transaction(async (tx) => {
        const u = await tx.appointment.updateMany({ where: { id: a.id, status: 'PENDING_PAYMENT' }, data: { status: 'CANCELLED' } });
        if (u.count) await tx.slot.updateMany({ where: { id: a.slotId, status: 'HELD' }, data: { status: 'FREE', heldUntil: null } });
      });
    }
  } catch (e) {
    console.error('slot cleanup failed:', e.message);
  }
}, 60000);

server.listen(cfg.port, () => console.log(`Doctor247 API on http://localhost:${cfg.port} (payments: ${cfg.mock ? 'mock' : 'razorpay'})`));
