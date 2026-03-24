// EmotionBadge - Shows emotion levels as inline badges

export default function EmotionBadge({ emotions }) {
  if (!emotions || Object.keys(emotions).length === 0) {
    return null;
  }
  
  return (
    <div className="emotion-badges">
      {Object.entries(emotions).map(([emotion, value]) => (
        <span 
          key={emotion} 
          className={`emotion-badge emotion-${emotion}`}
          title={`${emotion}: ${Math.round(value * 100)}%`}
        >
          {getEmotionIcon(emotion)} {emotion} {Math.round(value * 100)}%
        </span>
      ))}
    </div>
  );
}

function getEmotionIcon(emotion) {
  const icons = {
    fear: '😱',
    hope: '✨',
    anger: '😠',
    joy: '😊',
    sadness: '😢',
    surprise: '😲',
    disgust: '🤢',
    trust: '🤝',
    anticipation: '👀',
  };
  
  return icons[emotion] || 'emotion';
}
