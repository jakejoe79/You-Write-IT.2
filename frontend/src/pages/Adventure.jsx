import { useState } from 'react';
import ExportButton from '../components/ExportButton.jsx';

export default function Adventure() {
  const [form, setForm]       = useState({ input: '', branches: 3 });
  const [branches, setBranches] = useState([]);
  const [running, setRunning] = useState(false);
  const [error, setError]     = useState('');

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleGenerate(e) {
    e.preventDefault();
    setBranches([]); setError(''); setRunning(true);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'adventure',
          input: form.input,
          options: { branches: Number(form.branches) },
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const raw = data.result?.branches || data.result;
      setBranches(Array.isArray(raw) ? raw : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      <form className="form" onSubmit={handleGenerate}>
        <div className="field">
          <label>Story setup</label>
          <textarea
            value={form.input}
            onChange={e => set('input', e.target.value)}
            placeholder="A traveller arrives at a crossroads in a forest that shouldn't exist…"
            required
          />
        </div>
        <div className="form-row">
          <div className="field">
            <label>Branches</label>
            <input type="number" min={2} max={7} value={form.branches} onChange={e => set('branches', e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <button className="btn btn-primary" type="submit" disabled={running}>
            {running ? 'Branching…' : 'Generate branches'}
          </button>
          <ExportButton
            scenes={branches.map(b => `Branch ${b.branch}\n\n${b.text}`)}
            title="Adventure Branches"
            disabled={running}
          />
        </div>
      </form>

      {error && <div className="error-msg">{error}</div>}

      {branches.length > 0 && (
        <div className="output">
          <div className="scene-list">
            {branches.map((b, i) => {
              const emotion = b.emotion?.protagonist;
              const topEmotion = emotion
                ? Object.entries(emotion).sort(([,a],[,b]) => b-a).slice(0,2).map(([e,v]) => `${e} ${Math.round(v*100)}%`).join(' · ')
                : null;
              return (
                <div key={i} className="scene">
                  <div className="scene-label">Branch {b.branch}</div>
                  <div className="scene-text">{b.text}</div>
                  {topEmotion && <div className="scene-emotion">{topEmotion}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
