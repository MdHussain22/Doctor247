# Doctor247: full-stack doctor consultation platform

React (Vite) frontend + Node/Express API + PostgreSQL (Prisma) + Socket.IO chat + Razorpay payments.

| Part | Folder | What it does |
|---|---|---|
| Patient site, doctor portal, admin dashboard | `client/` | React pages, one login for all three roles |
| API | `server/src` | Auth, doctors, booking, payments, webhooks, chat, admin |
| Database | `server/prisma/schema.prisma` | Users, doctors, slots, appointments, payments, messages, audit log |

## 1. Run it locally

You need Node 18+ and a PostgreSQL database.

**Database (pick one)**
- Docker: `docker compose up -d` (uses the default `DATABASE_URL` below)
- Free hosted: create a project on Neon or Supabase and copy its connection string

```bash
npm run install:all
cp server/.env.example server/.env      # then edit DATABASE_URL and JWT_SECRET
cd server
npx prisma db push                      # creates the tables
npm run seed                            # admin + demo doctors + demo patient
cd ..
npm run dev:server                      # terminal 1 -> http://localhost:5000
npm run dev:client                      # terminal 2 -> http://localhost:5173
```

Open http://localhost:5173.

## 2. How do doctors become visible?

Doctors are **never hardcoded**. The patient site only shows rows in the `Doctor` table with `status = APPROVED`.

1. A doctor signs up (Sign up, "I am a doctor") and enters their registration number. Their status is `PENDING` and they are **hidden**.
2. An admin opens Admin, checks the registration number on the official medical register, and clicks **Approve**.
3. The doctor is now public. They add slots in the Doctor portal, and patients can book them.

`npm run seed` also inserts 4 approved **demo** doctors (registration numbers start with `DEMO-`) and 1 pending one, so the site is not empty while you develop. Before a real launch run `npm run demo:clear` in `server/` to delete all demo doctors, patients and their bookings.

## 3. Demo logins (created by the seed)

| Role | Email | Password |
|---|---|---|
| Admin | `admin@mediconnect.local` | `ChangeMe@123` (change it in `server/.env` before seeding) |
| Patient | `patient@demo.mediconnect.local` | `Patient@123` |
| Doctor | `meera.kapoor@demo.mediconnect.local` | `Doctor@123` |

Try the full journey: log in as the patient, book a slot, pay (test mode), open chat. Then log in as the doctor to start and complete the consultation.

## 4. Payments

- `PAYMENT_MODE=mock` (default): the Pay button simulates a successful payment. No money moves.
- `PAYMENT_MODE=razorpay`: set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` (use **test** keys first).
  - In the Razorpay dashboard, add a webhook to `https://YOUR-DOMAIN/api/payments/webhook` with events `payment.captured` and `order.paid`, using the same secret.
  - Turn on automatic capture so `payment.captured` fires.

Safety built in: the server confirms bookings only after verifying the Razorpay signature (browser callback) or webhook signature; duplicate webhooks are ignored; the same payment can never confirm twice; late payments after a slot hold expires are refunded automatically.

## 5. Booking confirmations, Google Meet and email

After a verified payment, Doctor247 attempts to create a Google Calendar event with a Google Meet link and invite both the patient and doctor. The link appears in both portals, and the patient's appointment view shows the doctor's contact number only for a paid, non-cancelled appointment. The doctor's phone is not exposed on public doctor listings.

Configure these Render environment variables to enable automatic meeting creation and email notifications:
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, and optionally `GOOGLE_CALENDAR_ID=primary` for Google Calendar/Meet. The OAuth account needs permission to create Calendar events and send invitations.
- `RESEND_API_KEY` and `RESEND_FROM_EMAIL` for booking confirmation emails. Verify the sender domain/address with Resend first.

If Google Calendar credentials are absent, the booking still confirms after payment, but no Meet URL can be created automatically. If Resend credentials are absent, email confirmations are not sent. Google/Resend secrets must be configured in Render, never committed to GitHub.

## 6. What the backend enforces

- **No double booking:** a slot is claimed with one atomic database update. Held slots expire after `SLOT_HOLD_MINUTES`.
- **Privacy:** patients see only their own appointments; doctors see only theirs; chat history and the live socket are limited to the appointment's patient and doctor. Admins cannot read chats.
- **Status flow:** `PENDING_PAYMENT -> CONFIRMED -> IN_PROGRESS -> COMPLETED`, plus `CANCELLED` and `REFUNDED`.
- **Security basics:** bcrypt passwords, httpOnly cookie login, rate-limited auth routes, Helmet headers, input validation (zod), audit log of sensitive actions.
- **Refunds:** patients can cancel until `REFUND_CUTOFF_HOURS` before the visit and get a full refund.

## Medical reports and digital prescriptions

Patients can attach a PDF or image (JPG/PNG/WebP, up to 4 MB) to a paid appointment. The assigned doctor can view the reports and issue a structured digital prescription from an in-progress or completed consultation. The patient can view and print the prescription from My appointments. Access is restricted to the appointment's patient and doctor.

**Launch caution:** this first version stores report payloads in PostgreSQL to avoid relying on Render's ephemeral filesystem. Before using real patient data publicly, migrate the file payloads to private object storage (for example, a private S3/R2 bucket with short-lived signed URLs), configure encryption, access logging, backups, retention/deletion, and review the medical-data workflow with qualified privacy/compliance counsel. Do not treat the current MVP storage design as final production-grade medical records storage. The new Prisma model must be applied to the database before using these screens. After pulling this branch, run the local commands below from the project root; do not run them against production until you have a verified backup and have confirmed the `DATABASE_URL` target.

## Recurring doctor availability and date-first booking

Doctors can save a weekly schedule (days, start/end time, and appointment duration). The backend generates the next 30 days of slots, refreshes the rolling window every six hours, and ensures upcoming slots when a patient opens a doctor profile. Slot uniqueness and conditional holds still protect against double booking; booked/held slots are not reset by schedule generation. All schedule times are interpreted as India Standard Time (Asia/Kolkata). Doctors can still add a one-off slot for exceptions. The schema adds `Doctor.weeklySchedule` (JSON) and `Doctor.slotDurationMinutes`, so apply the Prisma schema before using recurring schedules.

## 8. Applying the schema locally

From the repository root after pulling the feature branch:

```powershell
cd server
npx prisma validate
npx prisma generate
npx prisma db push
```

`db push` updates the database named by `server/.env`'s `DATABASE_URL` to match `server/prisma/schema.prisma`; it does not migrate data to a different database. Before running it, verify the host/database name in that connection string and use a disposable or backed-up development database. Do not paste the connection string into chat or commit `.env`. If `db push` fails, stop and share the error with secrets removed. Then restart the backend with `npm run dev` in `server/` and retry the report upload. This schema step is likely necessary because Prisma Client generation alone does not create database tables.

## 9. Deploy

1. `npm run install:all && npm run build` (builds `client/dist`).
2. Back up the production database and confirm the production `DATABASE_URL` before applying schema changes. Use a controlled migration process; do not point a local `.env` at production casually.
3. Set `NODE_ENV=production`, `DATABASE_URL`, a long random `JWT_SECRET` and existing payment environment variables on your host. Payment code and settings are not changed by this feature branch. Add the optional Google Calendar and Resend variables above to enable Meet links and email confirmations.
4. Run `cd server && npm run seed:admin` only if the production admin has not already been created, then start the service.

In production Express serves the built React app and the API from one URL, so cookies and sockets just work. Use a host that supports long-running Node servers and websockets (Render, Railway, Fly.io, a VPS). Vercel serverless will not run the Socket.IO chat. Use HTTPS only.

## 10. Not included yet (your next steps)

- **OTP / email verification** and password reset (needs an SMS or email provider)
- **Credential document uploads**, **private object storage migration** for report files, and stronger medical-record retention/deletion controls
- **Video calls** (Agora or similar), **email/SMS reminders**, **doctor payouts and settlement** (needs a legally approved fee model first)
- **Prescription PDF export** (the current prescription can be printed from the patient or doctor portal), patient consent records, automated tests, and production monitoring
- Automated tests, database migrations (`npm run db:migrate` instead of `db:push`), monitoring and backups

## 11. Legal and compliance (important)

This is software, not legal clearance. Before real patients use it:
- Verify every doctor's registration on the official register and keep the evidence.
- Percentage commissions and fee-splitting between platforms and doctors may conflict with India's medical ethics rules. Keep the platform fee at 0% and get a healthcare lawyer to approve your model before you charge it or automate payouts.
- Telemedicine, consent, privacy (DPDP Act) and emergency-handling rules apply. Review terms, privacy notice and refund policy with counsel.

## Project layout

```
mediconnect/
  client/src/        App.jsx, auth.jsx, api.js, pages/ (Home, DoctorProfile, PayModal, Chat, MyAppointments, Login, Register, DoctorPortal, Admin)
  server/src/        index.js, socket.js, config.js, db.js, middleware/auth.js, services/payments.js, routes/ (auth, doctors, appointments, payments, doctorPortal, admin)
  server/prisma/     schema.prisma, seed.js
```
