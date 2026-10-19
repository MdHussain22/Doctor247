import { Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import { Guard } from './ui.jsx';
import Home from './pages/Home.jsx';
import DoctorProfile from './pages/DoctorProfile.jsx';
import MyAppointments from './pages/MyAppointments.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import DoctorPortal from './pages/DoctorPortal.jsx';
import Admin from './pages/Admin.jsx';

function Header() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const theme = () => {
    const e = document.documentElement;
    const dark = e.dataset.theme ? e.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme:dark)').matches;
    e.dataset.theme = dark ? 'light' : 'dark';
  };
  return (
    <header className="top">
      <NavLink to="/" className="lg">✚ Doctor247</NavLink>
      <nav>
        {(!user || user.role === 'PATIENT') && <NavLink to="/" end>Find doctors</NavLink>}
        {user?.role === 'PATIENT' && <NavLink to="/appointments">My appointments</NavLink>}
        {user?.role === 'DOCTOR' && <NavLink to="/doctor">Doctor portal</NavLink>}
        {user?.role === 'ADMIN' && <NavLink to="/admin">Admin</NavLink>}
        {user ? (
          <button onClick={async () => { await logout(); nav('/'); }}>Log out ({user.name.split(' ')[0]})</button>
        ) : (
          <>
            <NavLink to="/login">Log in</NavLink>
            <NavLink to="/register" className="p">Sign up</NavLink>
          </>
        )}
        <button onClick={theme} aria-label="Switch light or dark theme">◐</button>
      </nav>
    </header>
  );
}

export default function App() {
  return (
    <>
      <Header />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/doctors/:id" element={<DoctorProfile />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/appointments" element={<Guard roles={['PATIENT']}><MyAppointments /></Guard>} />
          <Route path="/doctor" element={<Guard roles={['DOCTOR']}><DoctorPortal /></Guard>} />
          <Route path="/admin" element={<Guard roles={['ADMIN']}><Admin /></Guard>} />
          <Route path="*" element={<p className="m">Page not found.</p>} />
        </Routes>
      </main>
      <p className="foot">Doctor247 connects patients with registered doctors. It is not for emergencies: call 112.</p>
    </>
  );
}
