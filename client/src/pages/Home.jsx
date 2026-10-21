import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, inr } from '../api';

const popularSpecialties = [
  { name: 'General Physician', icon: '🩺', description: 'Fever, infections and everyday health' },
  { name: 'Dermatologist', icon: '🧴', description: 'Skin, hair and nail concerns' },
  { name: 'Cardiologist', icon: '❤️', description: 'Heart and blood pressure care' },
  { name: 'Pediatrician', icon: '🧸', description: 'Healthcare for children' },
  { name: 'Gynecologist', icon: '🌸', description: "Women's health" },
  { name: 'Psychiatrist', icon: '🧠', description: 'Mental health consultations' },
  { name: 'ENT Specialist', icon: '👂', description: 'Ear, nose and throat concerns' },
  { name: 'Orthopedic', icon: '🦴', description: 'Bones, joints and mobility' },
];

export default function Home() {
  const [q, setQ] = useState('');
  const [sp, setSp] = useState('');
  const [mx, setMx] = useState('');
  const [list, setList] = useState(null);
  const [specs, setSpecs] = useState([]);
  const [err, setErr] = useState('');

  useEffect(() => { api('/doctors/specialties').then(setSpecs).catch(() => {}); }, []);

  const allSpecialties = useMemo(
    () => [...new Set([...popularSpecialties.map((s) => s.name), ...specs])].sort((a, b) => a.localeCompare(b)),
    [specs]
  );

  useEffect(() => {
    const t = setTimeout(() => {
      const p = new URLSearchParams({ q, specialty: sp, maxFee: mx });
      api('/doctors?' + p).then((d) => { setList(d); setErr(''); }).catch(() => setErr('Cannot reach the server. Is the backend running on port 5000?'));
    }, 250);
    return () => clearTimeout(t);
  }, [q, sp, mx]);

  function chooseSpecialty(name) {
    setSp((current) => current === name ? '' : name);
    setQ('');
  }

  return (
    <>
      <section className="hero">
        <p className="eyebrow">ONLINE DOCTOR CONSULTATIONS</p>
        <h1>Healthcare, made easier.</h1>
        <p>Find a verified doctor, compare consultation fees, choose an available time and book online. Every public profile must be approved by our verification team.</p>
      </section>

      <div className="em">Emergency? Doctor247 is not an emergency service. Call 112 or go to the nearest hospital now.</div>

      <section className="specialty-section" aria-labelledby="specialty-heading">
        <div className="section-heading">
          <div>
            <h2 id="specialty-heading">Find care by specialty</h2>
            <p className="m">Choose the type of doctor you need.</p>
          </div>
          {sp && <button type="button" onClick={() => setSp('')}>Clear selection</button>}
        </div>
        <div className="specialty-grid">
          {popularSpecialties.map((s) => (
            <button
              type="button"
              className={`specialty-card${sp === s.name ? ' selected' : ''}`}
              key={s.name}
              aria-pressed={sp === s.name}
              onClick={() => chooseSpecialty(s.name)}
            >
              <span className="specialty-icon" aria-hidden="true">{s.icon}</span>
              <span className="specialty-name">{s.name}</span>
              <span className="specialty-description">{s.description}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="doctor-search" aria-label="Search doctors">
        <h2>{sp ? `Doctors in ${sp}` : 'Available doctors'}</h2>
        <div className="fl">
          <input aria-label="Search" placeholder="Search by doctor name or specialty" value={q} onChange={(e) => setQ(e.target.value)} />
          <select aria-label="Specialty" value={sp} onChange={(e) => setSp(e.target.value)}>
            <option value="">All specialties</option>
            {allSpecialties.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select aria-label="Fee" value={mx} onChange={(e) => setMx(e.target.value)}>
            <option value="">Any fee</option>
            <option value="500">Up to ₹500</option>
            <option value="700">Up to ₹700</option>
            <option value="1000">Up to ₹1,000</option>
          </select>
        </div>

        {err && <p className="wn">{err}</p>}
        {list && !list.length && !err && (
          <div className="empty-state">
            <h3>{sp ? `No verified ${sp.toLowerCase()}s available yet` : 'No verified doctors available yet'}</h3>
            <p className="m">Doctors appear here only after an administrator approves their medical registration. Try another specialty or check back after more doctors join.</p>
            {sp && <button type="button" className="p" onClick={() => setSp('')}>Browse all doctors</button>}
          </div>
        )}
        <div className="g">
          {(list || []).map((d) => (
            <div className="c doctor-card" key={d.id}>
              <div className="av">{d.profileImage ? <img src={d.profileImage} alt={d.name} /> : d.name.replace('Dr. ', '')[0]}</div>
              <h3>{d.name}</h3>
              <p className="m">{d.specialty} · {d.experienceYears} years' experience</p>
              <p className="m">{d.qualification}</p>
              <p className="m">Speaks {d.languages}</p>
              <div className="row">
                <strong>{inr(d.fee)}</strong>
                <Link className="p doctor-link" to={'/doctors/' + d.id}>View profile & book</Link>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
