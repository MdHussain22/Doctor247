import { prisma } from '../db.js';

const env = process.env;

async function googleAccessToken() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN } = env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REFRESH_TOKEN) return null;
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error(data.error_description || data.error || 'Google OAuth token request failed');
  return data.access_token;
}

async function createGoogleMeet(appointment) {
  if (appointment.meetUrl) return appointment.meetUrl;
  const token = await googleAccessToken();
  if (!token) {
    console.warn('Google Meet is not configured; set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN.');
    return null;
  }
  const calendarId = encodeURIComponent(env.GOOGLE_CALENDAR_ID || 'primary');
  const end = new Date(appointment.startsAt.getTime() + 30 * 60 * 1000);
  const attendees = [
    { email: appointment.patient.email, displayName: appointment.patient.name },
    { email: appointment.doctor.user.email, displayName: appointment.doctor.user.name },
  ];
  const response = await fetch('https://www.googleapis.com/calendar/v3/calendars/' + calendarId + '/events?conferenceDataVersion=1&sendUpdates=all', {
    method: 'POST',
    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify({
      summary: 'Doctor247 consultation — ' + appointment.doctor.user.name + ' and ' + appointment.patient.name,
      description: 'Doctor247 appointment ID: ' + appointment.id + '. Please do not share this private meeting link.',
      start: { dateTime: appointment.startsAt.toISOString(), timeZone: 'Asia/Kolkata' },
      end: { dateTime: end.toISOString(), timeZone: 'Asia/Kolkata' },
      attendees,
      conferenceData: {
        createRequest: {
          requestId: 'doctor247-' + appointment.id,
          conferenceSolutionKey: { type: 'hangoutsMeet' },
        },
      },
    }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'Google Calendar event creation failed');
  const meetUrl = data.hangoutLink || data.conferenceData?.entryPoints?.find((p) => p.entryPointType === 'video')?.uri || null;
  if (!meetUrl) throw new Error('Google Calendar created an event but did not return a Meet link');
  await prisma.appointment.update({ where: { id: appointment.id }, data: { meetUrl } });
  return meetUrl;
}

async function sendEmail(to, subject, text) {
  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
    console.warn('Booking email not sent: configure RESEND_API_KEY and RESEND_FROM_EMAIL.');
    return;
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + env.RESEND_API_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ from: env.RESEND_FROM_EMAIL, to: [to], subject, text }),
  });
  if (!response.ok) {
    const message = await response.text();
    throw new Error('Resend email failed (' + response.status + '): ' + message.slice(0, 300));
  }
}

export async function notifyAppointmentConfirmed(appointmentId) {
  try {
    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: { select: { name: true, email: true } },
        doctor: { include: { user: { select: { name: true, email: true, phone: true } } } },
      },
    });
    if (!appointment || !['CONFIRMED', 'IN_PROGRESS'].includes(appointment.status)) return;

    let meetUrl = appointment.meetUrl;
    try {
      meetUrl = await createGoogleMeet(appointment) || meetUrl;
    } catch (error) {
      console.error('Google Meet creation failed for appointment', appointmentId, error.message);
    }

    const when = new Intl.DateTimeFormat('en-IN', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: 'Asia/Kolkata',
    }).format(appointment.startsAt);
    const meetingLine = meetUrl
      ? 'Google Meet: ' + meetUrl
      : 'Your Google Meet link will appear in Doctor247 after the Google Calendar integration is configured.';
    const patientText = [
      'Hello ' + appointment.patient.name + ',',
      '',
      'Your Doctor247 consultation is confirmed.',
      'Doctor: ' + appointment.doctor.user.name + ' (' + appointment.doctor.specialty + ')',
      'Date and time: ' + when + ' (India time)',
      'Consultation fee: INR ' + appointment.fee,
      meetingLine,
      appointment.doctor.user.phone ? 'Doctor contact: ' + appointment.doctor.user.phone : '',
      '',
      'Please keep this appointment information private. For emergencies, call 112.',
    ].filter(Boolean).join('\n');
    const doctorText = [
      'Hello ' + appointment.doctor.user.name + ',',
      '',
      'A Doctor247 consultation has been confirmed.',
      'Patient: ' + appointment.patient.name,
      'Date and time: ' + when + ' (India time)',
      'Consultation fee: INR ' + appointment.fee,
      meetingLine,
      'Please use the Doctor247 portal to manage this appointment.',
    ].join('\n');

    await Promise.all([
      sendEmail(appointment.patient.email, 'Doctor247 booking confirmed', patientText),
      sendEmail(appointment.doctor.user.email, 'New confirmed Doctor247 consultation', doctorText),
    ]);
  } catch (error) {
    // Notification failures must never undo a payment that has already been verified.
    console.error('Appointment confirmation notification failed:', appointmentId, error.message);
  }
}
