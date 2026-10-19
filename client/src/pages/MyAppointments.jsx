import { useEffect, useState } from 'react';
import { api, inr, when } from '../api';
import { Badge, toast } from '../ui.jsx';
import Chat from './Chat.jsx';

export default function MyAppointments() {
  const [list, setList] = useState(null);
  const [chat, setChat] = useState(null);
  const load = () => api('/appointments').then(setList).catch((e) => toast(e.message));
  useEffect(() => { load(); }, []);

  async function cancel(a) {
    if (!confirm('Cancel this appointment? You will be refunded.')) return;
    try { await api(`/appointments/${a.id}/cancel`, { method: 'POST' }); toast('Cancelled. Refund started.'); load(); }
    catch (e) { toast(e.message); }
  }

  return (
    <>
      <h2>My appointments</h2>
      {list && !list.length && <p className="m">No appointments yet. Find a doctor to book one.</p>}
      {(list || []).map((a) => {
        const live = a.status === 'CONFIRMED' || a.status === 'IN_PROGRESS';
        return (
          <div className="c" key={a.id}>
            <div className="row"><b>{a.doctor.name}</b><Badge s={a.status} /></div>
            <p className="m">{a.doctor.specialty}, {when(a.startsAt)}, {inr(a.fee)}</p>
            {a.notes && <p><b>Consultation notes:</b> {a.notes}</p>}
            <div className="row">
              {live && <button onClick={() => setChat(a.id)}>Open chat</button>}
              {a.status === 'CONFIRMED' && <button onClick={() => cancel(a)}>Cancel and refund</button>}
            </div>
          </div>
        );
      })}
      {chat && <Chat appointmentId={chat} onClose={() => setChat(null)} />}
    </>
  );
}
