import { Server } from 'socket.io';
import cookie from 'cookie';
import { cfg } from './config.js';
import { prisma, getAppointmentFor } from './db.js';
import { COOKIE, userFromToken } from './middleware/auth.js';

const LIVE = ['CONFIRMED', 'IN_PROGRESS'];

export function initSocket(server) {
  const io = new Server(server, { cors: { origin: cfg.origin, credentials: true } });

  io.use(async (socket, next) => {
    const c = cookie.parse(socket.handshake.headers.cookie || '');
    const u = await userFromToken(c[COOKIE]);
    if (!u) return next(new Error('unauthorized'));
    socket.user = u;
    next();
  });

  io.on('connection', (socket) => {
    socket.on('join', async (appointmentId, ack) => {
      const a = await getAppointmentFor(socket.user, String(appointmentId));
      if (!a || !LIVE.includes(a.status)) return ack?.({ error: 'Chat is not available' });
      socket.join('appt:' + a.id);
      ack?.({ ok: true });
    });

    socket.on('message', async ({ appointmentId, body } = {}, ack) => {
      const text = String(body || '').trim().slice(0, 1000);
      if (!text) return;
      const a = await getAppointmentFor(socket.user, String(appointmentId));
      if (!a || !LIVE.includes(a.status)) return ack?.({ error: 'Chat is not available' });
      const m = await prisma.message.create({ data: { appointmentId: a.id, senderId: socket.user.id, body: text } });
      io.to('appt:' + a.id).emit('message', {
        id: m.id, senderId: socket.user.id, senderName: socket.user.name, body: m.body, createdAt: m.createdAt,
      });
      ack?.({ ok: true });
    });
  });
}
