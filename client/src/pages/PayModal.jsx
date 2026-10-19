import { useState } from 'react';
import { api, inr, when } from '../api';
import { Modal, toast } from '../ui.jsx';

const loadScript = (src) =>
  new Promise((ok, fail) => {
    if (window.Razorpay) return ok();
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = () => fail(new Error('Could not load Razorpay'));
    document.body.appendChild(s);
  });

export default function PayModal({ data, doctorName, onDone, onCancel }) {
  const { appointment: a, order } = data;
  const [busy, setBusy] = useState(false);

  async function pay() {
    setBusy(true);
    try {
      if (order.mock) {
        await api('/payments/mock-pay', { method: 'POST', body: { appointmentId: a.id } });
        toast('Booking confirmed');
        return onDone();
      }
      await loadScript('https://checkout.razorpay.com/v1/checkout.js');
      new window.Razorpay({
        key: order.keyId, amount: order.amount, currency: order.currency, order_id: order.orderId,
        name: 'Doctor247', description: 'Consultation with ' + doctorName,
        handler: async (r) => {
          try { await api('/payments/verify', { method: 'POST', body: r }); toast('Booking confirmed'); onDone(); }
          catch (e) { toast(e.message); setBusy(false); }
        },
        modal: { ondismiss: () => setBusy(false) },
      }).open();
    } catch (e) { toast(e.message); setBusy(false); }
  }

  async function cancel() {
    await api('/appointments/' + a.id + '/cancel', { method: 'POST' }).catch(() => {});
    onCancel();
  }

  return (
    <Modal>
      <h3>Pay {inr(a.fee)}</h3>
      <p>{doctorName}, {when(a.startsAt)}</p>
      <p className="m">{order.mock ? 'Test mode: no real money moves. ' : ''}Your booking is confirmed only after the server verifies the payment.</p>
      <div className="row">
        <button onClick={cancel} disabled={busy}>Cancel</button>
        <button className="p" onClick={pay} disabled={busy}>{order.mock ? `Pay ${inr(a.fee)} (test)` : `Pay ${inr(a.fee)}`}</button>
      </div>
    </Modal>
  );
}
