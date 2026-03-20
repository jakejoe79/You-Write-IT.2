import { useState } from 'react';
import OutputViewer from '../components/OutputViewer.jsx';
import ExportButton from '../components/ExportButton.jsx';

const GENRES      = ['thriller', 'horror', 'fantasy', 'romance', 'mystery', 'literary'];
const STYLES      = ['', 'king_like', 'hemingway_like', 'dickens_like', 'carver_like', 'le_guin_like'];
const STYLE_LABEL = { '': 'None', king_like: 'King-like', hemingway_like: 'Hemingway-like', dickens_like: 'Dickens-like', carver_like: 'Carver-like', le_guin_like: 'Le Guin-like' };

export default function Story() {
  const [form, setForm] = useState({
    input: '', genre: 'thriller', authorStyle: '', scenes: 5, protagonist: 'protagonist',
  });
  const [scenes, setScenes]           = useState([]);
  const [continuity, setContinuity]   = useState([]);
  const [progress, setProgress]       = useState('');
  const [running, setRunning]         = useState(false);
  const [error, setError]             = useState('');

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleGenerate(e) {
    e.preventDefault();
    setScenes([]); setContinuity([]); setError(''); setProgress('Connecting…');
    setRunning(true);

    try {
      const res = await fetch('/api/stream/story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, scenes: Number(form.scenes) }),
      });

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from buffer
        const events = buffer.split('\n\n');
        buffer = events.pop(); // keep incomplete chunk

        for (const block of events) {
          const lines = block.split('\n');
          const eventLine = lines.find(l => l.startsWith('event:'));
          const dataLine  = lines.find(l => l.startsWith('data:'));
          if (!eventLine || !dataLine) continue;

          const event = eventLine.replace('event:', '').trim();
          const data  = JSON.parse(dataLine.replace('data:', '').trim());

          if (event === 'start')    setProgress(`Generating ${data.total} scenes…`);
          if (event === 'progress') setProgress(data.status || `Scene ${data.scene} of ${data.total}…`);
          if (event === 'scene')    setScenes(s => [...s, { text: data.text, emotion: data.emotion }]);
          if (event === 'done')     { setScenes(data.scenes.map(t => ({ text: t }))); setContinuity(data.continuityReport || []); setProgress(''); }
          if (event === 'error')    setError(data.message);
        }
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
      setProgress('');
    }
  }

  return (
    <div>
      <form className="form" onSubmit={handleGenerate}>
        <div className="field">
          <label>Premise</label>
          <textarea
            value={form.input}
            onChange={e => set('input', e.target.value)}
            placeholder="A detective discovers reality resets every time he lies…"
            required
          />
        </div>
        <div className="form-row">
          <div className="field">
            <label>Genre</label>
            <select value={form.genre} onChange={e => set('genre', e.target.value)}>
              {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Author style</label>
            <select value={form.authorStyle} onChange={e => set('authorStyle', e.target.value)}>
              {STYLES.map(s => <option key={s} value={s}>{STYLE_LABEL[s]}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Scenes</label>
            <input type="number" min={1} max={20} value={form.scenes} onChange={e => set('scenes', e.target.value)} />
          </div>
        </div>
        <div className="form-row">
          <button className="btn btn-primary" type="submit" disabled={running}>
            {running ? 'Generating…' : 'Generate'}
          </button>
          <ExportButton scenes={scenes.map(s => s.text)} title={form.input.slice(0, 40)} disabled={running} />
        </div>
      </form>

      {error && <div className="error-msg">{error}</div>}
      <OutputViewer scenes={scenes} continuityReport={continuity} progress={progress} />
    </div>
  );
}
