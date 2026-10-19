import { useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { api } from '../api';
import { useAuth } from '../auth.jsx';
import { Modal, toast } from '../ui.jsx';

export default function Chat({ appointmentId, onClose }) {
  const { user } = useAuth();
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const sock = useRef(null);
  const box = useRef(null);

  useEffect(() => {
    api(`/appointments/${appointmentId}/messages`).then(setMsgs).catch((e) => toast(e.message));
    const s = io({ withCredentials: true });
    sock.current = s;
    s.on('connect', () => s.emit('join', appointmentId, (r) => r?.error && toast(r.error)));
    s.on('message', (m) => setMsgs((x) => [...x, m]));
    return () => s.disconnect();
  }, [appointmentId]);

  useEffect(() => { box.current?.scrollTo(0, 1e9); }, [msgs]);

  const send = () => {
    if (!text.trim()) return;
    sock.current.emit('message', { appointmentId, body: text }, (r) => r?.error && toast(r.error));
    setText('');
  };

  return (
    <Modal>
      <h3>Private consultation chat</h3>
      <div className="ms" ref={box}>
        {!msgs.length && <p className="m">No messages yet. Only this patient and the assigned doctor can read this chat.</p>}
        {msgs.map((m) => (
          <p key={m.id} className={'mg ' + (m.senderId === user.id ? 'me' : '')}><small>{m.senderName}</small><br />{m.body}</p>
        ))}
      </div>
      <div className="row">
        <input style={{ flex: 1 }} value={text} placeholder="Type a message" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} />
        <button className="p" onClick={send}>Send</button>
      </div>
      <p className="m">Chat does not replace emergency care. Call 112 if it is urgent.</p>
      <button onClick={onClose}>Close chat</button>
    </Modal>
  );
}
