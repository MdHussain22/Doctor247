import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const flag = (f) => process.argv.includes(f);
const DEMO = '@demo.mediconnect.local';

const demoDoctors = [
  { name: 'Dr. Meera Kapoor', sp: 'General Physician', exp: 12, fee: 400, lg: 'English, Hindi', reg: 'DEMO-UP-48213', q: 'MBBS, MD (Medicine)', ok: true },
  { name: 'Dr. Arjun Rao', sp: 'Dermatologist', exp: 9, fee: 600, lg: 'English, Telugu, Hindi', reg: 'DEMO-KA-77102', q: 'MBBS, MD (Dermatology)', ok: true },
  { name: 'Dr. Sana Siddiqui', sp: 'Pediatrician', exp: 15, fee: 500, lg: 'English, Hindi, Urdu', reg: 'DEMO-DL-30991', q: 'MBBS, DCH', ok: true },
  { name: 'Dr. Vikram Nair', sp: 'ENT Specialist', exp: 7, fee: 700, lg: 'English, Malayalam', reg: 'DEMO-KL-55120', q: 'MBBS, MS (ENT)', ok: true },
  { name: 'Dr. Isha Verma', sp: 'Gynecologist', exp: 11, fee: 800, lg: 'English, Hindi', reg: 'DEMO-UP-61844', q: 'MBBS, MS (OBG)', ok: false }, // stays pending so the admin queue has something
];

// Slot times are built in IST (UTC+5:30) for the next 3 days.
function demoSlots() {
  const ist = new Date(Date.now() + 330 * 60000);
  const out = [];
  for (let d = 1; d <= 3; d++)
    for (const [h, m] of [[10, 0], [10, 30], [11, 0], [16, 0], [16, 30]])
      out.push(new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + d, h, m) - 330 * 60000));
  return out;
}

async function clearDemo() {
  const ids = (await prisma.user.findMany({ where: { email: { endsWith: DEMO } }, select: { id: true } })).map((u) => u.id);
  const aid = (await prisma.appointment.findMany({ where: { OR: [{ patientId: { in: ids } }, { doctor: { userId: { in: ids } } }] }, select: { id: true } })).map((a) => a.id);
  await prisma.message.deleteMany({ where: { appointmentId: { in: aid } } });
  await prisma.payment.deleteMany({ where: { appointmentId: { in: aid } } });
  await prisma.appointment.deleteMany({ where: { id: { in: aid } } });
  await prisma.slot.deleteMany({ where: { doctor: { userId: { in: ids } } } });
  await prisma.doctor.deleteMany({ where: { userId: { in: ids } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  console.log('Demo doctors, patients and their bookings removed.');
}

async function main() {
  if (flag('--clear-demo')) return clearDemo();

  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@mediconnect.local').toLowerCase();
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: { name: 'Platform Admin', email: adminEmail, passwordHash: await bcrypt.hash(process.env.ADMIN_PASSWORD || 'ChangeMe@123', 11), role: 'ADMIN' },
  });
  await prisma.setting.upsert({ where: { key: 'platformFeePercent' }, update: {}, create: { key: 'platformFeePercent', value: '0' } });
  console.log('Admin ready:', adminEmail);
  if (flag('--admin-only')) return;

  const pw = await bcrypt.hash('Doctor@123', 11);
  for (const d of demoDoctors) {
    const email = d.name.toLowerCase().replace(/[^a-z]+/g, '.').replace(/^dr\./, '').replace(/\.$/, '') + DEMO;
    const user = await prisma.user.upsert({ where: { email }, update: {}, create: { name: d.name, email, passwordHash: pw, role: 'DOCTOR' } });
    const doc = await prisma.doctor.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id, specialty: d.sp, qualification: d.q, registrationNo: d.reg, experienceYears: d.exp, languages: d.lg, fee: d.fee,
        status: d.ok ? 'APPROVED' : 'PENDING', verifiedAt: d.ok ? new Date() : null,
      },
    });
    await prisma.slot.createMany({ data: demoSlots().map((startsAt) => ({ doctorId: doc.id, startsAt })), skipDuplicates: true });
    console.log('Demo doctor:', email, '(password Doctor@123)');
  }
  await prisma.user.upsert({
    where: { email: 'patient' + DEMO },
    update: {},
    create: { name: 'Demo Patient', email: 'patient' + DEMO, passwordHash: await bcrypt.hash('Patient@123', 11), role: 'PATIENT' },
  });
  console.log('Demo patient: patient' + DEMO + ' (password Patient@123)');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
