import { useState, useEffect } from 'react';
import ExportButton from '../components/ExportButton.jsx';

export default function Adventure() {
  const [form, setForm] = useState({ input: '', branches: 3 });
  const [branches, setBranches] = useState([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [progress, setProgress] = useState('');

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
        setForm(f => ({ ...f, input: data.session.title || '', branches: data.scenes.length }));
        setBranches(data.scenes.map(s => ({ branch: s.index, text: s.text })));
      }
    } catch (err) { console.error('Failed to load session:', err); }
  }

  async function handleGenerate(e) {
    e.preventDefault();
    setBranches([]); setError(''); setProgress('Connecting…');
    setRunning(true);

    try {
      const res = await fetch('/api/stream/adventure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: form.input, branches: Number(form.branches), sessionId }),
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

          if (event === 'start') { setSessionId(data.sessionId); setProgress(`Generating ${data.total} branches…`); }
          if (event === 'progress') setProgress(data.status || `Branch ${data.scene} of ${data.total}…`);
          if (event === 'scene') setBranches(b => [...b, { branch: data.branch, text: data.text }]);
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

      {sessionId && <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#666' }}>Session: {sessionId.slice(0,8)}… <a href={`?session=${sessionId}`} style={{color:'#4a4aff'}}>permalink</a></div>}
      {error && <div className="error-msg">{error}</div>}
      {progress && <p className="progress">{progress}</p>}

      {branches.length > 0 && (
        <div className="output">
          <div className="output-header"><h2>{branches.length} branch(es)</h2></div>
          <div className="scene-list">
            {branches.map((b, i) => (
              <div key={i} className="scene">
                <div className="scene-label">Branch {b.branch}</div>
                <div className="scene-text">{b.text}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
