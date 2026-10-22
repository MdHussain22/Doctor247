import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, inr } from '../api';

const popularSpecialties = [
  { name: 'General Physician', icon: '🩺', description: 'Everyday health and common illnesses' },
  { name: 'Dermatologist', icon: '✦', description: 'Skin, hair and nail care' },
  { name: 'Cardiologist', icon: '♡', description: 'Heart and blood pressure care' },
  { name: 'Pediatrician', icon: '♧', description: 'Care for babies and children' },
  { name: 'Gynecologist', icon: '✿', description: "Women's health" },
  { name: 'Psychiatrist', icon: '☼', description: 'Mental health support' },
  { name: 'ENT Specialist', icon: '◖', description: 'Ear, nose and throat care' },
  { name: 'Orthopedic', icon: '⌁', description: 'Bones, joints and mobility' },
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
      api('/doctors?' + p).then((d) => { setList(d); setErr(''); }).catch(() => setErr('Cannot reach the server. Please try again in a moment.'));
    }, 250);
    return () => clearTimeout(t);
  }, [q, sp, mx]);

  function chooseSpecialty(name) {
    setSp((current) => current === name ? '' : name);
    setQ('');
    document.getElementById('doctor-search')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <>
      <section className="hero premium-hero">
        <div className="hero-copy">
          <p className="eyebrow"><span className="eyebrow-dot" /> CARE THAT COMES TO YOU</p>
          <h1>The right doctor.<br /><span>Right when you need one.</span></h1>
          <p className="hero-description">Find trusted specialists, compare consultation fees and book an online appointment — all in one place.</p>
          <form className="hero-search" onSubmit={(e) => { e.preventDefault(); document.getElementById('doctor-search')?.scrollIntoView({ behavior: 'smooth' }); }}>
            <span aria-hidden="true">⌕</span>
            <input aria-label="Search doctor or specialty" placeholder="Doctor, specialty or condition" value={q} onChange={(e) => setQ(e.target.value)} />
            <button type="submit" className="p">Find a doctor <span aria-hidden="true">→</span></button>
          </form>
          <div className="hero-trust">
            <span><b aria-hidden="true">✓</b> Doctor profiles reviewed</span>
            <span><b aria-hidden="true">✓</b> Clear consultation fees</span>
          </div>
        </div>
        <div className="hero-art" aria-label="Doctor247 care at your convenience">
          <div className="hero-art-orbit orbit-one" />
          <div className="hero-art-orbit orbit-two" />
          <div className="hero-art-main">
            <div className="hero-medical-symbol">✚</div>
            <div className="hero-art-title">Your health,<br />in good hands.</div>
            <p>Care made simpler, one appointment at a time.</p>
            <div className="hero-art-bottom"><span className="hero-pulse" /> Your care journey starts here</div>
          </div>
          <div className="floating-care-card"><span className="floating-care-icon">♡</span><span><b>Care that fits your day</b><small>Choose a time that works for you</small></span></div>
          <div className="hero-art-leaf leaf-one" />
          <div className="hero-art-leaf leaf-two" />
        </div>
      </section>

      <div className="em premium-em"><span aria-hidden="true">!</span><p><b>Medical emergency?</b> Doctor247 is not an emergency service. Call 112 or go to the nearest hospital.</p></div>

      <section className="specialty-section premium-section" aria-labelledby="specialty-heading">
        <div className="section-heading">
          <div>
            <p className="eyebrow">PERSONALISED FOR YOU</p>
            <h2 id="specialty-heading">Find care by specialty</h2>
            <p className="m">Start with what you need. We'll help you find the right care.</p>
          </div>
          {sp && <button type="button" onClick={() => setSp('')}>Clear selection ×</button>}
        </div>
        <div className="specialty-grid">
          {popularSpecialties.map((s, i) => (
            <button type="button" className={`specialty-card premium-specialty specialty-tone-${i % 4}${sp === s.name ? ' selected' : ''}`} key={s.name} aria-pressed={sp === s.name} onClick={() => chooseSpecialty(s.name)}>
              <span className="specialty-icon" aria-hidden="true">{s.icon}</span>
              <span className="specialty-name">{s.name}</span>
              <span className="specialty-description">{s.description}</span>
              <span className="specialty-arrow" aria-hidden="true">↗</span>
            </button>
          ))}
        </div>
      </section>

      <section className="doctor-search premium-section" id="doctor-search" aria-label="Search doctors">
        <div className="section-heading doctor-heading">
          <div>
            <p className="eyebrow">MEET YOUR CARE TEAM</p>
            <h2>{sp ? `Find a ${sp}` : 'Doctors ready to help'}</h2>
            <p className="m">Explore doctor profiles and choose an appointment that suits you.</p>
          </div>
          <span className="doctor-count">{list ? `${list.length} ${list.length === 1 ? 'doctor' : 'doctors'} found` : 'Finding doctors…'}</span>
        </div>
        <div className="fl premium-filters">
          <label className="search-input-wrap"><span aria-hidden="true">⌕</span><input aria-label="Search" placeholder="Search by doctor name or specialty" value={q} onChange={(e) => setQ(e.target.value)} /></label>
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

        {err && <p className="wn" role="alert">{err}</p>}
        {list && !list.length && !err && (
          <div className="empty-state premium-empty">
            <span className="empty-state-icon" aria-hidden="true">⌕</span>
            <h3>{sp ? `No ${sp.toLowerCase()}s available just yet` : 'No doctors match your search yet'}</h3>
            <p className="m">Try another specialty or remove a filter. Public doctor profiles appear after administrator verification.</p>
            {(sp || q || mx) && <button type="button" className="p" onClick={() => { setSp(''); setQ(''); setMx(''); }}>Clear filters</button>}
          </div>
        )}
        <div className="g premium-doctor-grid">
          {(list || []).map((d) => (
            <article className="c doctor-card premium-doctor-card" key={d.id}>
              <div className="doctor-card-top">
                <div className="av premium-avatar">{d.profileImage ? <img src={d.profileImage} alt={d.name} loading="lazy" /> : <span>{d.name.replace(/^Dr\.\s*/i, '').split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span>}</div>
                <span className="doctor-verified"><span aria-hidden="true">✓</span> Verified profile</span>
              </div>
              <h3>{d.name}</h3>
              <p className="doctor-specialty">{d.specialty}</p>
              <p className="doctor-qualification">{d.qualification}</p>
              <div className="doctor-meta"><span aria-hidden="true">◷</span> {d.experienceYears} years' experience</div>
              {d.languages && <div className="doctor-languages">Speaks {d.languages}</div>}
              <div className="doctor-card-footer">
                <div className="doctor-fee"><small>Consultation fee</small><strong>{inr(d.fee)}</strong></div>
                <Link className="p doctor-link" to={'/doctors/' + d.id}>View profile <span aria-hidden="true">→</span></Link>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="how-it-works" aria-labelledby="how-heading">
        <div><p className="eyebrow">SIMPLE FROM START TO FINISH</p><h2 id="how-heading">Your next appointment, in three steps</h2><p className="m">Getting care should feel straightforward.</p></div>
        <div className="how-steps">
          <article><span>01</span><h3>Find your doctor</h3><p>Browse specialties and review doctor profiles and fees.</p></article>
          <article><span>02</span><h3>Choose a time</h3><p>Select an available date and consultation slot that works for you.</p></article>
          <article><span>03</span><h3>Book with confidence</h3><p>Complete booking and find your appointment details in your account.</p></article>
        </div>
      </section>
    </>
  );
}
