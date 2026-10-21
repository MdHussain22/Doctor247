import { Router } from 'express';
import { z } from 'zod';
import { prisma, audit, getAppointmentFor } from '../db.js';
import { auth } from '../middleware/auth.js';

const r = Router();
r.use(auth);

const MAX_FILE_CHARS = 5_600_000; // about 4 MB binary after base64 encoding
const reportInput = z.object({
  title: z.string().trim().min(1).max(120),
  fileName: z.string().trim().min(1).max(180),
  mimeType: z.enum(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
  fileData: z.string().max(MAX_FILE_CHARS),
});
const prescriptionInput = z.object({
  diagnosis: z.string().trim().min(1).max(500),
  advice: z.string().trim().max(2000).optional().default(''),
  followUp: z.string().trim().max(200).optional().default(''),
  medicines: z.array(z.object({
    name: z.string().trim().min(1).max(160),
    dose: z.string().trim().max(120).optional().default(''),
    frequency: z.string().trim().max(120).optional().default(''),
    duration: z.string().trim().max(120).optional().default(''),
    instructions: z.string().trim().max(300).optional().default(''),
  })).max(20),
});

function recordShape(record) {
  return {
    id: record.id, type: record.type, title: record.title, mimeType: record.mimeType,
    fileName: record.fileName, details: record.details, createdAt: record.createdAt,
  };
}

r.get('/:appointmentId/records', async (req, res) => {
  const appointment = await getAppointmentFor(req.user, req.params.appointmentId);
  if (!appointment) return res.status(404).json({ error: 'Appointment not found' });
  const records = await prisma.medicalRecord.findMany({
    where: { appointmentId: appointment.id },
    orderBy: { createdAt: 'desc' },
  });
  res.json(records.map(recordShape));
});

r.get('/:appointmentId/records/:recordId/download', async (req, res) => {
  const appointment = await getAppointmentFor(req.user, req.params.appointmentId);
  if (!appointment) return res.status(404).json({ error: 'Record not found' });
  const record = await prisma.medicalRecord.findFirst({
    where: { id: req.params.recordId, appointmentId: appointment.id, type: 'REPORT' },
  });
  if (!record) return res.status(404).json({ error: 'Report not found' });
  res.json({ fileName: record.fileName, mimeType: record.mimeType, fileData: record.fileData });
});

r.post('/:appointmentId/reports', async (req, res) => {
  if (req.user.role !== 'PATIENT') return res.status(403).json({ error: 'Only the patient can upload reports' });
  const appointment = await prisma.appointment.findFirst({
    where: { id: req.params.appointmentId, patientId: req.user.id, payment: { status: 'PAID' }, status: { notIn: ['CANCELLED', 'REFUNDED'] } },
  });
  if (!appointment) return res.status(404).json({ error: 'Paid appointment not found' });
  const parsed = reportInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { title, fileName, mimeType, fileData } = parsed.data;
  const prefix = `data:${mimeType};base64,`;
  if (!fileData.startsWith(prefix) || fileData.length > MAX_FILE_CHARS || !/^[A-Za-z0-9+/]+=*$/.test(fileData.slice(prefix.length))) {
    return res.status(400).json({ error: 'Invalid file data or unsupported file type' });
  }
  const record = await prisma.medicalRecord.create({
    data: { appointmentId: appointment.id, uploadedById: req.user.id, type: 'REPORT', title, fileName: fileName.replace(/[\\/\\r\\n]/g, '_'), mimeType, fileData },
  });
  await audit(req.user.id, 'MEDICAL_REPORT_UPLOADED', 'MedicalRecord', record.id, { appointmentId: appointment.id });
  res.status(201).json(recordShape(record));
});

r.post('/:appointmentId/prescriptions', async (req, res) => {
  if (req.user.role !== 'DOCTOR') return res.status(403).json({ error: 'Only the treating doctor can issue a prescription' });
  const appointment = await prisma.appointment.findFirst({
    where: { id: req.params.appointmentId, doctor: { userId: req.user.id }, status: { in: ['IN_PROGRESS', 'COMPLETED'] }, payment: { status: 'PAID' } },
  });
  if (!appointment) return res.status(404).json({ error: 'Eligible appointment not found' });
  const parsed = prescriptionInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const details = { ...parsed.data, issuedAt: new Date().toISOString() };
  const record = await prisma.medicalRecord.create({
    data: {
      appointmentId: appointment.id, uploadedById: req.user.id, type: 'PRESCRIPTION',
      title: 'Prescription', mimeType: 'application/json', fileName: 'prescription.json',
      fileData: '', details,
    },
  });
  await audit(req.user.id, 'PRESCRIPTION_ISSUED', 'MedicalRecord', record.id, { appointmentId: appointment.id });
  res.status(201).json(recordShape(record));
});

export default r;
