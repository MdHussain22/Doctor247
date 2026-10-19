import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export const audit = (actorId, action, entity, entityId, meta) =>
  prisma.auditLog
    .create({ data: { actorId, action, entity, entityId, meta } })
    .catch((e) => console.error('audit failed:', e.message));

// Returns the appointment only if `user` is its patient or its doctor.
export async function getAppointmentFor(user, id) {
  const a = await prisma.appointment.findUnique({ where: { id }, include: { doctor: true } });
  return a && (a.patientId === user.id || a.doctor.userId === user.id) ? a : null;
}

export async function feePercent() {
  const s = await prisma.setting.findUnique({ where: { key: 'platformFeePercent' } });
  return Number(s?.value || 0);
}
