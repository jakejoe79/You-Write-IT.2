import { useState } from 'react';
import Story from './pages/Story.jsx';
import Abridge from './pages/Abridge.jsx';
import Adventure from './pages/Adventure.jsx';
import './app.css';

const TABS = ['Story', 'Abridge', 'Adventure'];

export default function App() {
  const [tab, setTab] = useState('Story');

  return (
    <div className="app">
      <header className="header">
        <h1>AI Book Factory</h1>
        <nav className="tabs">
          {TABS.map(t => (
            <button
              key={t}
              className={`tab ${tab === t ? 'active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </nav>
      </header>
      <main className="main">
        {tab === 'Story'     && <Story />}
        {tab === 'Abridge'   && <Abridge />}
        {tab === 'Adventure' && <Adventure />}
      </main>
    </div>
  );
}
