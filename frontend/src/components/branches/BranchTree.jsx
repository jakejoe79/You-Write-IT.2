// BranchTree - Visualizes the branch hierarchy

export default function BranchTree({ 
  branches, 
  currentBranchId, 
  onSelect, 
  onRecompute,
}) {
  const renderBranch = (branch, depth = 0) => {
    const isActive = branch.id === currentBranchId;
    
    return (
      <div 
        key={branch.id} 
        className="branch-node" 
        style={{ marginLeft: depth * 20 }}
      >
        <button
          className={`branch-btn ${isActive ? 'active' : ''}`}
          onClick={() => onSelect(branch.id)}
        >
          {branch.name || `Branch ${branch.id.slice(0, 4)}`}
          {branch.hasEdits && <span className="edit-indicator">✎</span>}
        </button>
        
        {branch.children?.map(child => renderBranch(child, depth + 1))}
        
        <button
          className="recompute-btn"
          onClick={() => onRecompute(branch.id)}
        >
          ↻ Recompute
        </button>
      </div>
    );
  };
  
  return (
    <div className="branch-tree">
      {Object.values(branches).map(branch => renderBranch(branch))}
    </div>
  );
}
