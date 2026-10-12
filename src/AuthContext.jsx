import { useEffect, useState } from 'react';
import { api, getToken, setToken } from './api';
import { AuthContext } from './contexts';

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!getToken());
  useEffect(() => {
    let active = true;
    const refresh = () => {
      const token = getToken();
      if (!token) {
        setUser(null);
        setReady(true);
        return;
      }
      setReady(false);
      api('/auth/me')
        .then((data) => {
          if (active && getToken() === token) setUser(data.user);
        })
        .catch((error) => {
          if (
            active &&
            getToken() === token &&
            /Сессия истекла|Требуется вход/.test(error.message)
          ) {
            setToken(null);
            setUser(null);
          }
        })
        .finally(() => {
          if (active) setReady(true);
        });
    };
    refresh();
    window.addEventListener('furniture:online', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      active = false;
      window.removeEventListener('furniture:online', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  const login = (data) => {
    setToken(data.token);
    setUser(data.user);
    setReady(true);
  };
  const logout = async () => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
    }
    setToken(null);
    setUser(null);
  };
  return (
    <AuthContext.Provider value={{ user, ready, login, logout, updateUser: setUser }}>
      {children}
    </AuthContext.Provider>
  );
}
