export default function OutputViewer({ scenes, continuityReport, progress }) {
  if (!scenes?.length && !progress) return null;

  return (
    <div className="output">
      <div className="output-header">
        <h2>{scenes?.length ? `${scenes.length} scene(s) generated` : 'Generating…'}</h2>
      </div>

      {progress && <p className="progress">{progress}</p>}

      <div className="scene-list">
        {scenes?.map((scene, i) => {
          const text   = typeof scene === 'string' ? scene : scene.text;
          const emotion = scene.emotion?.protagonist;
          const topEmotion = emotion
            ? Object.entries(emotion).sort(([,a],[,b]) => b-a).slice(0,2).map(([e,v]) => `${e} ${Math.round(v*100)}%`).join(' · ')
            : null;

          return (
            <div key={i} className="scene">
              <div className="scene-label">Scene {i + 1}</div>
              <div className="scene-text">{text}</div>
              {topEmotion && <div className="scene-emotion">{topEmotion}</div>}
            </div>
          );
        })}
      </div>

      {continuityReport?.length > 0 && (
        <div className="continuity-report">
          <h3>Continuity check</h3>
          {continuityReport.map((r, i) => (
            <div key={i} className={`continuity-item ${/no issues/i.test(r.issues) ? 'clean' : ''}`}>
              Scene {r.scene}: {r.issues}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
