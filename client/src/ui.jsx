import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';

export function toast(message) {
  const e = document.getElementById('toast');
  e.textContent = message;
  e.style.opacity = 1;
  clearTimeout(toast.h);
  toast.h = setTimeout(() => (e.style.opacity = 0), 2800);
}

export const Badge = ({ s }) => (
  <span className={'b ' + (/PENDING/.test(s) ? 'w' : /CANC|REFU|REJ/.test(s) ? 'x' : '')}>{s}</span>
);

export const Modal = ({ children }) => (
  <div className="ov"><div className="md">{children}</div></div>
);

// Wrap a page in <Guard roles={['ADMIN']}> to require login + role.
export function Guard({ roles, children }) {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <p className="m">Loading…</p>;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (!roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}
