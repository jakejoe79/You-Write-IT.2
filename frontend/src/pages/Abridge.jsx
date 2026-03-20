import { useState, useEffect } from 'react';
import ExportButton from '../components/ExportButton.jsx';

const LEVELS = ['adult', 'high_school', 'middle_school', 'esl'];

export default function Abridge() {
  const [form, setForm] = useState({ input: '', reading_level: 'adult', chunkSize: 2000, chapterHooks: true });
  const [chunks, setChunks] = useState([]);
  const [progress, setProgress] = useState('');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [sessionId, setSessionId] = useState(null);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get('session');
    if (sid) loadSession(sid);
  }, []);

  async function loadSession(id) {
    try {
      const res = await fetch(`/api/stream/session/${id}`);
      const data = await res.json();
      if (data.session) {
        setSessionId(id);
        setForm(f => ({
          ...f,
          input: data.session.title || '',
          reading_level: data.session.genre || 'adult',
        }));
        setChunks(data.scenes.map(s => ({ text: s.text })));
      }
    } catch (err) { console.error('Failed to load session:', err); }
  }

  async function handleGenerate(e) {
    e.preventDefault();
    setChunks([]); setError(''); setProgress('Connecting…');
    setRunning(true);

    try {
      const res = await fetch('/api/stream/abridge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: form.input,
          reading_level: form.reading_level,
          chunkSize: Number(form.chunkSize),
          chapterHooks: form.chapterHooks,
          sessionId,
        }),
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop();

        for (const block of events) {
          const eventLine = block.split('\n').find(l => l.startsWith('event:'));
          const dataLine = block.split('\n').find(l => l.startsWith('data:'));
          if (!eventLine || !dataLine) continue;

          const event = eventLine.replace('event:', '').trim();
          const data = JSON.parse(dataLine.replace('data:', '').trim());

          if (event === 'start') { setSessionId(data.sessionId); setProgress(`Abridging ${data.total} chunks…`); }
          if (event === 'progress') setProgress(data.status || `Chunk ${data.scene} of ${data.total}…`);
          if (event === 'scene') setChunks(c => [...c, { text: data.text }]);
          if (event === 'done') {
            setProgress('');
            const url = new URL(window.location);
            url.searchParams.set('session', data.sessionId);
            window.history.replaceState({}, '', url);
          }
          if (event === 'error') setError(data.message);
        }
      }
    } catch (err) { setError(err.message); }
    finally { setRunning(false); setProgress(''); }
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
          <ExportButton scenes={chunks.map(c => c.text)} title="Abridged Edition" disabled={running} />
        </div>
      </form>

      {sessionId && <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#666' }}>Session: {sessionId.slice(0,8)}… <a href={`?session=${sessionId}`} style={{color:'#4a4aff'}}>permalink</a></div>}
      {error && <div className="error-msg">{error}</div>}
      {progress && <p className="progress">{progress}</p>}

      {chunks.length > 0 && (
        <div className="output">
          <div className="output-header"><h2>{chunks.length} chunk(s)</h2></div>
          <div className="scene-list">
            {chunks.map((c, i) => (
              <div key={i} className="scene">
                <div className="scene-label">Chunk {i + 1}</div>
                <div className="scene-text">{c.text}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
