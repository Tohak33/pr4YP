// Все запросы приложения проходят через единый клиент: токен, ошибки и технические работы.
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
export const getToken = () => localStorage.getItem('furniture_token');
export const setToken = (token) =>
  token
    ? localStorage.setItem('furniture_token', token)
    : localStorage.removeItem('furniture_token');

export async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
        ...options.headers
      }
    });
  } catch {
    window.dispatchEvent(new Event('furniture:offline'));
    throw new Error('Сервер временно недоступен');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Ошибка запроса (${response.status})`);
  return data;
}
