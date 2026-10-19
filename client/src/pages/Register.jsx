import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { toast } from '../ui.jsx';

export default function Register() {
  const { register } = useAuth();
  const nav = useNavigate();
  const [role, setRole] = useState('PATIENT');
  const [f, setF] = useState({ name: '', email: '', password: '', phone: '' });
  const [d, setD] = useState({ specialty: '', qualification: '', registrationNo: '', fee: 500, experienceYears: 0, languages: 'English' });
  const [busy, setBusy] = useState(false);
  const set = (o, fn) => (k) => (e) => fn({ ...o, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await register({ ...f, role, ...(role === 'DOCTOR' ? { doctor: d } : {}) });
      toast(role === 'DOCTOR' ? 'Submitted. Your profile goes live after verification.' : 'Welcome to Doctor247');
      nav(role === 'DOCTOR' ? '/doctor' : '/');
    } catch (e) { toast(e.message); setBusy(false); }
  }

  const onF = set(f, setF), onD = set(d, setD);
  return (
    <form className="c narrow" onSubmit={submit}>
      <h2>Create your account</h2>
      <div className="sl">
        <button type="button" className={role === 'PATIENT' ? 'p' : ''} onClick={() => setRole('PATIENT')}>I am a patient</button>
        <button type="button" className={role === 'DOCTOR' ? 'p' : ''} onClick={() => setRole('DOCTOR')}>I am a doctor</button>
      </div>
      <label>Full name<input required value={f.name} onChange={onF('name')} /></label>
      <label>Email<input type="email" required value={f.email} onChange={onF('email')} /></label>
      <label>Phone number {role === 'DOCTOR' ? '(required, include country code)' : '(optional)'}<input type="tel" required={role === 'DOCTOR'} placeholder="+919876543210" value={f.phone} onChange={onF('phone')} /></label>
      <label>Password (8+ characters)<input type="password" minLength={8} required value={f.password} onChange={onF('password')} /></label>
      {role === 'DOCTOR' && (
        <>
          <label>Specialty<input required value={d.specialty} onChange={onD('specialty')} placeholder="e.g. Dermatologist" /></label>
          <label>Qualifications<input required value={d.qualification} onChange={onD('qualification')} placeholder="e.g. MBBS, MD (Medicine)" /></label>
          <label>Medical registration number<input required value={d.registrationNo} onChange={onD('registrationNo')} /></label>
          <label>Years of experience<input type="number" min="0" value={d.experienceYears} onChange={onD('experienceYears')} /></label>
          <label>Languages<input value={d.languages} onChange={onD('languages')} /></label>
          <label>Consultation fee (₹)<input type="number" min="1" required value={d.fee} onChange={onD('fee')} /></label>
          <p className="wn">Your profile stays hidden from patients until an admin verifies your registration number.</p>
        </>
      )}
      <button className="p" disabled={busy}>Sign up</button>
      <p className="m">Already registered? <Link className="ln" to="/login">Log in</Link></p>
    </form>
  );
}
