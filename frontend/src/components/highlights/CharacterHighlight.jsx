// CharacterHighlight - Highlights character names with role-based colors

export default function CharacterHighlight({ name, role }) {
  const roleColors = {
    protagonist: '#3b82f6', // blue
    antagonist: '#ef4444',  // red
    mentor: '#10b981',      // green
    other: '#6b7280',       // gray
  };
  
  const color = roleColors[role] || roleColors.other;
  
  return (
    <span 
      className="character-highlight"
      style={{ 
        color,
        fontWeight: role === 'protagonist' || role === 'antagonist' ? 'bold' : 'normal',
        cursor: 'pointer',
      }}
      title={`Character: ${name} (${role})`}
    >
      {name}
    </span>
  );
}
