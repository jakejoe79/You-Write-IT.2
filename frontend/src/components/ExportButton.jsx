import { useState } from 'react';

export default function ExportButton({ scenes, title = 'Untitled', disabled }) {
  const [status, setStatus] = useState('idle'); // idle | loading | done | error

  async function handleExport() {
    if (!scenes?.length) return;
    setStatus('loading');
    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format: 'epub',
          content: scenes,
          metadata: { title, author: 'ai-book-factory', balanceChapters: true },
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setStatus('done');
      // Show path — user opens it in Calibre
      alert(`EPUB saved to:\n${data.output?.path || data.path}`);
    } catch (err) {
      setStatus('error');
      alert(`Export failed: ${err.message}`);
    }
  }

  return (
    <button
      className="btn btn-secondary"
      onClick={handleExport}
      disabled={disabled || status === 'loading' || !scenes?.length}
    >
      {status === 'loading' ? 'Exporting…' : status === 'done' ? 'Exported ✓' : 'Export EPUB'}
    </button>
  );
}
