import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api('/auth/me').then(setUser).catch(() => setUser(null)).finally(() => setReady(true));
  }, []);

  const login = async (email, password) => setUser(await api('/auth/login', { method: 'POST', body: { email, password } }));
  const register = async (body) => setUser(await api('/auth/register', { method: 'POST', body }));
  const logout = async () => { await api('/auth/logout', { method: 'POST' }); setUser(null); };

  return <Ctx.Provider value={{ user, ready, login, register, logout }}>{children}</Ctx.Provider>;
}
