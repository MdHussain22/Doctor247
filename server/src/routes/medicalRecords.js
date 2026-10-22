import { Router } from 'express';
import { z } from 'zod';
import { prisma, audit, getAppointmentFor } from '../db.js';
import { auth } from '../middleware/auth.js';

const r = Router();
r.use(auth);

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const MAX_FILE_CHARS = Math.ceil(MAX_FILE_BYTES / 3) * 4 + 100;
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

function isExpectedFileType(buffer, mimeType) {
  if (mimeType === 'application/pdf') return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  if (mimeType === 'image/jpeg') return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === 'image/png') return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mimeType === 'image/webp') return buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';
  return false;
}

r.get('/:appointmentId/records', async (req, res) => {
  const appointment = await getAppointmentFor(req.user, req.params.appointmentId);
  if (!appointment) return res.status(404).json({ error: 'Appointment not found' });
  const records = await prisma.medicalRecord.findMany({
    where: { appointmentId: appointment.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, type: true, title: true, mimeType: true, fileName: true, details: true, createdAt: true },
  });
  res.json(records.map(recordShape));
});

r.get('/:appointmentId/records/:recordId/download', async (req, res) => {
  const appointment = await getAppointmentFor(req.user, req.params.appointmentId);
  if (!appointment) return res.status(404).json({ error: 'Record not found' });
  const record = await prisma.medicalRecord.findFirst({
    where: { id: req.params.recordId, appointmentId: appointment.id, type: 'REPORT' },
    select: { fileName: true, mimeType: true, fileData: true },
  });
  if (!record) return res.status(404).json({ error: 'Report not found' });
  res.json(record);
});

r.post('/:appointmentId/reports', async (req, res) => {
  if (req.user.role !== 'PATIENT') return res.status(403).json({ error: 'Only the patient can upload reports' });
  const appointment = await prisma.appointment.findFirst({
    where: { id: req.params.appointmentId, patientId: req.user.id, payment: { status: 'PAID' }, status: { notIn: ['CANCELLED', 'REFUNDED'] } },
    select: { id: true },
  });
  if (!appointment) return res.status(404).json({ error: 'Paid appointment not found' });
  const parsed = reportInput.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });
  const { title, fileName, mimeType, fileData } = parsed.data;
  const prefix = `data:${mimeType};base64,`;
  if (!fileData.startsWith(prefix)) return res.status(400).json({ error: 'File type does not match the selected format' });
  const encoded = fileData.slice(prefix.length);
  if (!encoded || encoded.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    return res.status(400).json({ error: 'Invalid file encoding' });
  }
  const buffer = Buffer.from(encoded, 'base64');
  if (!buffer.length || buffer.length > MAX_FILE_BYTES) return res.status(400).json({ error: 'File must be 4 MB or smaller' });
  if (!isExpectedFileType(buffer, mimeType)) return res.status(400).json({ error: 'The file content does not match the selected PDF or image type' });

  const safeFileName = fileName.replace(/[\\/\r\n\0]/g, '_').slice(0, 180);
  const record = await prisma.medicalRecord.create({
    data: { appointmentId: appointment.id, uploadedById: req.user.id, type: 'REPORT', title, fileName: safeFileName, mimeType, fileData },
  });
  await audit(req.user.id, 'MEDICAL_REPORT_UPLOADED', 'MedicalRecord', record.id, { appointmentId: appointment.id });
  res.status(201).json(recordShape(record));
});

r.post('/:appointmentId/prescriptions', async (req, res) => {
  if (req.user.role !== 'DOCTOR') return res.status(403).json({ error: 'Only the treating doctor can issue a prescription' });
  const appointment = await prisma.appointment.findFirst({
    where: { id: req.params.appointmentId, doctor: { userId: req.user.id }, status: { in: ['IN_PROGRESS', 'COMPLETED'] }, payment: { status: 'PAID' } },
    select: { id: true },
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
