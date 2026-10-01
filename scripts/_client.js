const apiBase = process.env.E2E_API || 'https://api.mypreprx.com/api';
const webUrl = process.env.E2E_WEB || 'https://www.mypreprx.com';

const jar = new Map();
let token = null;

const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');

function saveCookies(res) {
  const raw = res.headers.getSetCookie?.() ?? [];
  for (const c of raw) {
    const [pair] = c.split(';');
    const i = pair.indexOf('=');
    const name = pair.slice(0, i).trim();
    const value = pair.slice(i + 1).trim();
    if (value === '' ) jar.delete(name);
    else jar.set(name, value);
  }
}

function saveToken(res) {
  const t = res.headers.get('authorization');
  if (t) token = t.replace(/^Bearer\s+/i, '');
}

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (jar.size) headers.Cookie = cookieHeader();

  const res = await fetch(`${apiBase}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  saveCookies(res);
  saveToken(res);

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data };
}

export const webClient = {
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b),
  put: (p, b) => request('PUT', p, b),
  delete: (p) => request('DELETE', p),
};

export { apiBase, webUrl };