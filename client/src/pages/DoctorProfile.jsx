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
  const [selectedDay, setSelectedDay] = useState('');

  const dayKey = (date) => new Date(date).toLocaleDateString('en-CA');
  const load = () => api('/doctors/' + id).then((data) => {
    setD(data);
    setSelectedDay((current) => current && data.slots.some((slot) => dayKey(slot.startsAt) === current) ? current : data.slots.length ? dayKey(data.slots[0].startsAt) : '');
    setErr('');
  }).catch((e) => setErr(e.message));
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
  d.slots.forEach((slot) => {
    const key = dayKey(slot.startsAt);
    (days[key] = days[key] || []).push(slot);
  });
  const dayLabel = (key) => new Date(`${key}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  const selectedSlots = days[selectedDay] || [];

  return (
    <>
      <Link className="ln" to="/">Back to doctors</Link>
      <div className="c">
        <div className="doctor-profile-heading">
          <div className="doctor-profile-photo">{d.profileImage ? <img src={d.profileImage} alt={d.name} /> : <span aria-hidden="true">{d.name.replace('Dr. ', '')[0]}</span>}</div>
          <div><h2>{d.name} <span className="b">Verified</span></h2>
          <p className="m">{d.specialty}, {d.experienceYears} years of experience</p></div>
        </div>
        <p>{d.qualification}. Registration no. {d.registrationNo}</p>
        <p className="m">Speaks {d.languages}</p>
        {d.bio && <p>{d.bio}</p>}
        <h3>Consultation fee {inr(d.fee)}</h3>
        <h3>Choose a date and time</h3>
        <p className="m">Select a date to see available consultation times.</p>
        {!d.slots.length && <p className="m">No open slots right now. Check back soon.</p>}
        {!!Object.keys(days).length && <div className="booking-date-strip" role="group" aria-label="Available dates">
          {Object.keys(days).sort().map((day) => (
            <button type="button" key={day} className={`booking-date${selectedDay === day ? ' selected' : ''}`} aria-pressed={selectedDay === day} onClick={() => setSelectedDay(day)}>
              <span>{new Date(`${day}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'short' })}</span>
              <strong>{new Date(`${day}T12:00:00`).getDate()}</strong>
              <small>{new Date(`${day}T12:00:00`).toLocaleDateString('en-IN', { month: 'short' })}</small>
            </button>
          ))}
        </div>}
        {selectedDay && <div className="booking-times">
          <div className="row"><b>{dayLabel(selectedDay)}</b><span className="b">{selectedSlots.length} available</span></div>
          <div className="sl">
            {selectedSlots.map((s) => <button className="slot-button" key={s.id} disabled={busy === s.id} onClick={() => book(s)} aria-label={`Book appointment for ${timeOnly(s.startsAt)}`}>
              <span className="slot-time">{timeOnly(s.startsAt)}</span>
              <span className="slot-action">{busy === s.id ? "Reserving…" : "Book this time"} <span aria-hidden="true">→</span></span>
            </button>)}
          </div>
        </div>}
        <p className="m">A selected time is held briefly during checkout. Once booked, it disappears from availability.</p>
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
