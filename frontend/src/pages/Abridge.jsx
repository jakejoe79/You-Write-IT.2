import { useState } from 'react';
import OutputViewer from '../components/OutputViewer.jsx';
import ExportButton from '../components/ExportButton.jsx';

const LEVELS = ['adult', 'high_school', 'middle_school', 'esl'];

export default function Abridge() {
  const [form, setForm] = useState({ input: '', reading_level: 'adult', chunkSize: 2000, chapterHooks: true });
  const [result, setResult]   = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError]     = useState('');

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleGenerate(e) {
    e.preventDefault();
    setResult(''); setError(''); setRunning(true);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'abridged',
          input: form.input,
          options: {
            reading_level: form.reading_level,
            chunkSize: Number(form.chunkSize),
            chapterHooks: form.chapterHooks,
          },
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data.result?.text || data.result || '');
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
          <label>Source text</label>
          <textarea
            value={form.input}
            onChange={e => set('input', e.target.value)}
            placeholder="Paste a classic novel excerpt or any long-form text…"
            style={{ minHeight: 160 }}
            required
          />
        </div>
        <div className="form-row">
          <div className="field">
            <label>Reading level</label>
            <select value={form.reading_level} onChange={e => set('reading_level', e.target.value)}>
              {LEVELS.map(l => <option key={l} value={l}>{l.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Chunk size (chars)</label>
            <input type="number" min={500} max={5000} step={500} value={form.chunkSize} onChange={e => set('chunkSize', e.target.value)} />
          </div>
          <div className="field" style={{ justifyContent: 'flex-end' }}>
            <label>
              <input type="checkbox" checked={form.chapterHooks} onChange={e => set('chapterHooks', e.target.checked)} />
              {' '}Chapter hooks
            </label>
          </div>
        </div>
        <div className="form-row">
          <button className="btn btn-primary" type="submit" disabled={running}>
            {running ? 'Abridging…' : 'Abridge'}
          </button>
          <ExportButton scenes={result ? [result] : []} title="Abridged Edition" disabled={running} />
        </div>
      </form>

      {error && <div className="error-msg">{error}</div>}
      {result && (
        <div className="output">
          <div className="scene">
            <div className="scene-label">Abridged output — {form.reading_level.replace('_', ' ')}</div>
            <div className="scene-text">{result}</div>
          </div>
        </div>
      )}
    </div>
  );
}
