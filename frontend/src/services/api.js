const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

export async function generate(mode, input, options = {}) {
  const res = await fetch(`${BASE_URL}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, input, options }),
  });
  return res.json();
}

export async function exportBook(format, content, metadata = {}) {
  const res = await fetch(`${BASE_URL}/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ format, content, metadata }),
  });
  return res.json();
}
