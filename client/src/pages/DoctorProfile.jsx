import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, inr, timeOnly } from '../api';
import { useAuth } from '../auth.jsx';
import { toast } from '../ui.jsx';
import PayModal from './PayModal.jsx';

export default function DoctorProfile() {
  const { id } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const [pay, setPay] = useState(null);
  const [busy, setBusy] = useState('');

  const load = () => api('/doctors/' + id).then(setD).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [id]);

  async function book(slot) {
    if (!user) return nav('/login', { state: { from: loc.pathname } });
    if (user.role !== 'PATIENT') return toast('Only patient accounts can book.');
    setBusy(slot.id);
    try { setPay(await api('/appointments', { method: 'POST', body: { slotId: slot.id } })); }
    catch (e) { toast(e.message); load(); }
    finally { setBusy(''); }
  }

  if (err) return <p className="m">{err}</p>;
  if (!d) return <p className="m">Loading…</p>;

  const days = {};
  d.slots.forEach((s) => {
    const k = new Date(s.startsAt).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });
    (days[k] = days[k] || []).push(s);
  });

  return (
    <>
      <Link className="ln" to="/">Back to doctors</Link>
      <div className="c">
        <h2>{d.name} <span className="b">Verified</span></h2>
        <p className="m">{d.specialty}, {d.experienceYears} years of experience</p>
        <p>{d.qualification}. Registration no. {d.registrationNo}</p>
        <p className="m">Speaks {d.languages}</p>
        {d.bio && <p>{d.bio}</p>}
        <h3>Consultation fee {inr(d.fee)}</h3>
        <h3>Available times</h3>
        {!d.slots.length && <p className="m">No open slots right now. Check back soon.</p>}
        {Object.entries(days).map(([day, slots]) => (
          <div key={day}>
            <p className="m">{day}</p>
            <div className="sl">
              {slots.map((s) => <button className="slot-button" key={s.id} disabled={busy === s.id} onClick={() => book(s)} aria-label={`Book appointment for ${timeOnly(s.startsAt)}`}>
                <span className="slot-time">{timeOnly(s.startsAt)}</span>
                <span className="slot-action">{busy === s.id ? "Reserving…" : "Book this slot"} <span aria-hidden="true">→</span></span>
              </button>)}
            </div>
          </div>
        ))}
        <p className="m">Your slot is held for a few minutes while you pay, so nobody else can book it.</p>
      </div>
      {pay && (
        <PayModal
          data={pay}
          doctorName={d.name}
          onDone={() => nav('/appointments')}
          onCancel={() => { setPay(null); load(); }}
        />
      )}
    </>
  );
}
