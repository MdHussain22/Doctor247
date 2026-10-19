import { useEffect, useState } from 'react';
import { api, inr, when } from '../api';
import { Badge, toast } from '../ui.jsx';

export default function Admin() {
  const [s, setS] = useState(null);
  const [queue, setQueue] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [log, setLog] = useState([]);
  const [pct, setPct] = useState(0);

  const load = async () => {
    const [a, b, c, d] = await Promise.all([api('/admin/summary'), api('/admin/doctors?status=PENDING'), api('/admin/appointments'), api('/admin/audit')]);
    setS(a); setPct(a.platformFeePercent); setQueue(b); setBookings(c); setLog(d);
  };
  useEffect(() => { load().catch((e) => toast(e.message)); }, []);
  const run = async (fn, msg) => { try { await fn(); msg && toast(msg); await load(); } catch (e) { toast(e.message); } };

  if (!s) return <p className="m">Loading…</p>;
  const stats = [['Verified doctors', s.verifiedDoctors], ['Awaiting verification', s.pendingDoctors], ['Bookings', s.bookings], ['Collected', inr(s.collected)], ['Refunded', inr(s.refunded)]];

  return (
    <>
      <h2>Admin dashboard</h2>
      <div className="g">{stats.map(([k, v]) => <div className="c" key={k}><p className="m">{k}</p><h2>{v}</h2></div>)}</div>

      <h3>Doctor verification queue</h3>
      {!queue.length && <p className="m">The queue is clear.</p>}
      {queue.map((d) => (
        <div className="c" key={d.id}>
          <div className="row">
            <div>
              <b>{d.name}</b> <span className="m">({d.email})</span>
              <p className="m">{d.specialty}, {d.qualification}, {d.experienceYears} yrs, fee {inr(d.fee)}</p>
              <p>Registration no. <b>{d.registrationNo}</b></p>
              <p className="m">Check this number on the National Medical Register / state council before approving.</p>
            </div>
            <div className="sl">
              <button className="p" onClick={() => run(() => api(`/admin/doctors/${d.id}/approve`, { method: 'POST' }), 'Doctor is now live')}>Approve</button>
              <button onClick={() => { const reason = prompt('Reason for rejecting?'); if (reason !== null) run(() => api(`/admin/doctors/${d.id}/reject`, { method: 'POST', body: { reason } }), 'Doctor rejected'); }}>Reject</button>
            </div>
          </div>
        </div>
      ))}

      <h3>Bookings</h3>
      <div className="c tw">
        {bookings.length ? (
          <table>
            <thead><tr><th>When</th><th>Patient</th><th>Doctor</th><th>Status</th><th>Payment</th><th>Amount</th></tr></thead>
            <tbody>{bookings.map((a) => <tr key={a.id}><td>{when(a.startsAt)}</td><td>{a.patient}</td><td>{a.doctor}</td><td><Badge s={a.status} /></td><td>{a.paymentStatus || '-'}</td><td>{inr(a.fee)}</td></tr>)}</tbody>
          </table>
        ) : <p className="m">No bookings yet.</p>}
      </div>

      <h3>Fee model</h3>
      <div className="c">
        <label>Platform fee (%)<input type="number" min="0" max="30" value={pct} onChange={(e) => setPct(e.target.value)} /></label>
        <button className="p" onClick={() => run(() => api('/admin/settings/fee', { method: 'PUT', body: { percent: pct } }), 'Fee updated')}>Save</button>
        <p>Platform share {inr(s.platformShare)}. Doctor share {inr(s.doctorShare)}. This only reports numbers: nothing is deducted or paid out automatically.</p>
        <p className="wn">The default is 0%. India’s medical ethics code restricts commissions and fee-splitting, so get legal review before you charge doctors a percentage.</p>
      </div>

      <h3>Audit log</h3>
      <div className="c tw">
        {log.length ? (
          <table>
            <thead><tr><th>Time</th><th>Action</th><th>Entity</th></tr></thead>
            <tbody>{log.map((l) => <tr key={l.id}><td>{when(l.createdAt)}</td><td>{l.action}</td><td>{l.entity}</td></tr>)}</tbody>
          </table>
        ) : <p className="m">Sensitive actions will appear here.</p>}
      </div>
    </>
  );
}
