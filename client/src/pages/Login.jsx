import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { api } from '../api';
import { toast } from '../ui.jsx';

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const from = useLocation().state?.from;
  const [f, setF] = useState({ email: '', password: '' });
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await login(f.email, f.password);
      const me = await api('/auth/me');
      nav(from || (me.role === 'ADMIN' ? '/admin' : me.role === 'DOCTOR' ? '/doctor' : '/'));
    } catch (e) { toast(e.message); setBusy(false); }
  }

  return (
    <form className="c narrow" onSubmit={submit}>
      <h2>Log in</h2>
      <label>Email<input type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
      <label>Password<input type="password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></label>
      <button className="p" disabled={busy}>Log in</button>
      <p className="m">New here? <Link className="ln" to="/register">Create an account</Link></p>
    </form>
  );
}
