import { useEffect, useState } from 'react';
import { api, inr, when } from '../api';
import { Badge, toast } from '../ui.jsx';
import Chat from './Chat.jsx';
import AppointmentRecords from './AppointmentRecords.jsx';

async function compressProfileImage(file) {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
  const image = new Image();
  const source = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => { image.onload = () => resolve(image); image.onerror = reject; image.src = reader.result; };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const maxSide = 512;
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(source.width * scale);
  canvas.height = Math.round(source.height * scale);
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  const result = canvas.toDataURL('image/jpeg', 0.78);
  if (result.length > 950000) throw new Error('Image is too large. Choose a smaller photo.');
  return result;
}

export default function DoctorPortal() {
  const [me, setMe] = useState(null);
  const [profileImage, setProfileImage] = useState('');
  const [imageBusy, setImageBusy] = useState(false);
  const [slots, setSlots] = useState([]);
  const [appts, setAppts] = useState([]);
  const [at, setAt] = useState('');
  const [days, setDays] = useState([1, 2, 3, 4, 5]);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [durationMinutes, setDurationMinutes] = useState(15);
  const [notes, setNotes] = useState({});
  const [chat, setChat] = useState(null);

  const load = async () => {
    const [m, s, a] = await Promise.all([api('/doctor/me'), api('/doctor/slots'), api('/doctor/appointments')]);
    setMe(m); setProfileImage(m.profileImage || ''); setSlots(s); setAppts(a);
    if (Array.isArray(m.weeklySchedule) && m.weeklySchedule.length) {
      setDays([...new Set(m.weeklySchedule.map((rule) => rule.weekday))]);
      setStartTime(m.weeklySchedule[0].start || '09:00');
      setEndTime(m.weeklySchedule[0].end || '17:00');
      setDurationMinutes(m.slotDurationMinutes || 15);
    }
  };
  useEffect(() => { load().catch((e) => toast(e.message)); }, []);
  const run = async (fn, msg) => { try { await fn(); msg && toast(msg); await load(); } catch (e) { toast(e.message); } };

  if (!me) return <p className="m">Loading…</p>;
  return (
    <>
      <h2>Doctor portal</h2>
      {me.status === 'PENDING' && <p className="wn">Under review. Your profile is hidden from patients until an admin verifies your registration number ({me.registrationNo}).</p>}
      {me.status === 'REJECTED' && <p className="wn">Verification was not approved: {me.rejectionReason}. Contact support to resubmit.</p>}
      {me.status === 'APPROVED' && <p className="m">Your profile is live and patients can book your open slots.</p>}

      <div className="g">
        <form className="c" key={me.id + me.fee} onSubmit={(e) => { e.preventDefault(); const body = Object.fromEntries(new FormData(e.target)); body.profileImage = profileImage || null; run(() => api('/doctor/me', { method: 'PATCH', body }), 'Profile saved'); }}>
          <h3>Profile and fee</h3>
          <div className="doctor-photo-editor">
            <div className="doctor-photo-preview">
              {profileImage ? <img src={profileImage} alt="Your profile" /> : <span aria-hidden="true">{me.name?.[0] || 'D'}</span>}
            </div>
            <div className="doctor-photo-controls">
              <label>Profile photo (optional)<input type="file" accept="image/png,image/jpeg,image/webp" onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setImageBusy(true);
                try { setProfileImage(await compressProfileImage(file)); }
                catch (error) { toast(error.message || 'Could not read that image.'); e.target.value = ''; }
                finally { setImageBusy(false); }
              }} /></label>
              <p className="m">Optional. JPG, PNG or WebP; cropped to a small square automatically.</p>
              {profileImage && <button type="button" disabled={imageBusy} onClick={() => setProfileImage('')}>Remove photo</button>}
            </div>
          </div>
          <label>Consultation fee (₹)<input name="fee" type="number" min="1" defaultValue={me.fee} /></label>
          <label>Contact phone (include country code)<input name="phone" type="tel" required defaultValue={me.phone || ''} placeholder="+919876543210" /></label>
          <label>Languages<input name="languages" defaultValue={me.languages} /></label>
          <label>About you<textarea name="bio" rows="3" defaultValue={me.bio || ''} /></label>
          <button className="p" disabled={imageBusy}>{imageBusy ? "Preparing photo…" : "Save profile"}</button>
        </form>
        <div className="c">
          <h3>Weekly availability</h3>
          <p className="m">Set your regular consultation hours once. Doctor247 will create bookable slots for the next 30 days and keep extending the schedule automatically. A booked time is never offered to another patient.</p>
          <div className="sl" aria-label="Working days">
            {[['Sun',0],['Mon',1],['Tue',2],['Wed',3],['Thu',4],['Fri',5],['Sat',6]].map(([label, day]) => (
              <label key={day} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, margin: 0, padding: '6px 8px', border: '1px solid var(--bd)', borderRadius: 8 }}>
                <input type="checkbox" checked={days.includes(day)} onChange={(e) => setDays((current) => e.target.checked ? [...current, day].sort() : current.filter((value) => value !== day))} />
                {label}
              </label>
            ))}
          </div>
          <div className="g">
            <label>Start time<input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} /></label>
            <label>End time<input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} /></label>
            <label>Consultation length<select value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))}><option value={10}>10 minutes</option><option value={15}>15 minutes</option><option value={20}>20 minutes</option><option value={30}>30 minutes</option><option value={45}>45 minutes</option><option value={60}>60 minutes</option></select></label>
          </div>
          <button className="p" disabled={!days.length || !startTime || !endTime || endTime <= startTime} onClick={() => run(() => api('/doctor/availability', { method: 'PUT', body: { weeklySchedule: days.map((weekday) => ({ weekday, start: startTime, end: endTime })), durationMinutes } }), 'Weekly schedule saved; upcoming slots generated')}>Save weekly schedule</button>
          <details style={{ marginTop: 12 }}>
            <summary>Need a one-off appointment time?</summary>
            <label>Add a single slot<input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} /></label>
            <button disabled={!at} onClick={() => run(() => api('/doctor/slots', { method: 'POST', body: { times: [new Date(at).toISOString()] } }).then(() => setAt('')), 'Slot added')}>Add one-off slot</button>
          </details>
          <div className="sl" style={{ marginTop: 12 }}>
            {slots.map((s) => (
              <span key={s.id} className="b">
                {when(s.startsAt)} ({s.status.toLowerCase()})
                {s.status === 'FREE' && <button className="ln" aria-label="Remove slot" onClick={() => run(() => api('/doctor/slots/' + s.id, { method: 'DELETE' }))}> remove</button>}
              </span>
            ))}
            {!slots.length && <span className="m">No upcoming slots yet.</span>}
          </div>
        </div>
      </div>

      <h3>My appointments</h3>
      {!appts.length && <p className="m">No paid appointments yet.</p>}
      {appts.map((a) => (
        <div className="c" key={a.id}>
          <div className="row"><b>{a.patientName}</b><Badge s={a.status} /></div>
          <p className="m">{when(a.startsAt)}, {inr(a.fee)}</p>
          {a.meetUrl && <p><b>Google Meet:</b> <a href={a.meetUrl} target="_blank" rel="noreferrer">Join consultation</a></p>}
          {a.notes && <p><b>Notes:</b> {a.notes}</p>}
          {['IN_PROGRESS', 'COMPLETED'].includes(a.status) && <AppointmentRecords appointment={a} role="DOCTOR" />}
          <div className="row">
            {(a.status === 'CONFIRMED' || a.status === 'IN_PROGRESS') && <button onClick={() => setChat(a.id)}>Open chat</button>}
            {a.status === 'CONFIRMED' && <button className="p" onClick={() => run(() => api(`/doctor/appointments/${a.id}/start`, { method: 'POST' }), 'Consultation started')}>Start consultation</button>}
            {a.status === 'IN_PROGRESS' && (
              <>
                <input placeholder="Consultation notes" value={notes[a.id] || ''} onChange={(e) => setNotes({ ...notes, [a.id]: e.target.value })} style={{ flex: 1 }} />
                <button className="p" onClick={() => run(() => api(`/doctor/appointments/${a.id}/complete`, { method: 'POST', body: { notes: notes[a.id] } }), 'Consultation completed')}>Complete</button>
              </>
            )}
          </div>
        </div>
      ))}
      {chat && <Chat appointmentId={chat} onClose={() => setChat(null)} />}
    </>
  );
}
