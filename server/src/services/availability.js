const TIME_ZONE = 'Asia/Kolkata';

function indiaDateParts(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
}

function dateKey(parts) {
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addCalendarDays(parts, count) {
  const d = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day) + count));
  return { year: String(d.getUTCFullYear()), month: String(d.getUTCMonth() + 1).padStart(2, '0'), day: String(d.getUTCDate()).padStart(2, '0') };
}

export async function ensureUpcomingSlots(prisma, doctorId, schedule, durationMinutes = 15, horizonDays = 30) {
  if (!Array.isArray(schedule) || !schedule.length) return 0;
  const duration = Number(durationMinutes);
  if (!Number.isInteger(duration) || duration < 5 || duration > 120) return 0;

  const now = new Date();
  const today = indiaDateParts(now);
  const times = [];
  for (let offset = 0; offset < horizonDays; offset += 1) {
    const parts = addCalendarDays(today, offset);
    const day = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day))).getUTCDay();
    for (const rule of schedule) {
      if (Number(rule.weekday) !== day || !/^([01]\d|2[0-3]):[0-5]\d$/.test(rule.start || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(rule.end || '')) continue;
      const [sh, sm] = rule.start.split(':').map(Number);
      const [eh, em] = rule.end.split(':').map(Number);
      const start = sh * 60 + sm;
      const end = eh * 60 + em;
      if (end <= start) continue;
      for (let minute = start; minute + duration <= end; minute += duration) {
        const hh = String(Math.floor(minute / 60)).padStart(2, '0');
        const mm = String(minute % 60).padStart(2, '0');
        const at = new Date(`${dateKey(parts)}T${hh}:${mm}:00+05:30`);
        if (at > now) times.push(at);
      }
    }
  }
  if (!times.length) return 0;
  const out = await prisma.slot.createMany({
    data: [...new Map(times.map((startsAt) => [startsAt.toISOString(), { doctorId, startsAt }])).values()],
    skipDuplicates: true,
  });
  return out.count;
}
