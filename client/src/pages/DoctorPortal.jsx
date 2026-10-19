import { useEffect, useState } from 'react';
import { api, inr, when } from '../api';
import { Badge, toast } from '../ui.jsx';
import Chat from './Chat.jsx';

export default function DoctorPortal() {
  const [me, setMe] = useState(null);
  const [slots, setSlots] = useState([]);
  const [appts, setAppts] = useState([]);
  const [at, setAt] = useState('');
  const [notes, setNotes] = useState({});
  const [chat, setChat] = useState(null);

  const load = async () => {
    const [m, s, a] = await Promise.all([api('/doctor/me'), api('/doctor/slots'), api('/doctor/appointments')]);
    setMe(m); setSlots(s); setAppts(a);
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
        <form className="c" key={me.id + me.fee} onSubmit={(e) => { e.preventDefault(); run(() => api('/doctor/me', { method: 'PATCH', body: Object.fromEntries(new FormData(e.target)) }), 'Profile saved'); }}>
          <h3>Profile and fee</h3>
          <label>Consultation fee (₹)<input name="fee" type="number" min="1" defaultValue={me.fee} /></label>
          <label>Contact phone (include country code)<input name="phone" type="tel" required defaultValue={me.phone || ''} placeholder="+919876543210" /></label>
          <label>Languages<input name="languages" defaultValue={me.languages} /></label>
          <label>About you<textarea name="bio" rows="3" defaultValue={me.bio || ''} /></label>
          <button className="p">Save profile</button>
        </form>
        <div className="c">
          <h3>Availability</h3>
          <label>Add a slot<input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} /></label>
          <button className="p" disabled={!at} onClick={() => run(() => api('/doctor/slots', { method: 'POST', body: { times: [new Date(at).toISOString()] } }).then(() => setAt('')), 'Slot added')}>Add slot</button>
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
