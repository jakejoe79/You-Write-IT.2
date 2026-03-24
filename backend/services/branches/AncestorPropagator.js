// AncestorPropagator - handles state propagation from ancestor branches to descendants
// Ensures edits in shared ancestor scenes propagate correctly to all descendant branches

const { getBranchLineage, getBranchTree } = require('../../db/sqlite');

class AncestorPropagator {
  constructor() {
    this.propagationQueue = new Map();
  }

  async propagateEdit(sessionId, ancestorBranchId, ancestorIndex, newContent) {
    // Get all branches in this session
    const branches = await getBranchTree(sessionId);
    
    // Find branches that share this ancestor
    const affectedBranches = [];
    
    for (const branch of branches) {
      const lineage = await getBranchLineage(branch.id);
      const ancestorInLineage = lineage.find(l => l.id === ancestorBranchId);
      
      if (ancestorInLineage && ancestorInLineage.fork_chapter_index <= ancestorIndex) {
        affectedBranches.push({
          branchId: branch.id,
          lineageDepth: lineage.length,
          needsRecompute: true,
        });
      }
    }
    
    // Sort by lineage depth (shallowest first)
    affectedBranches.sort((a, b) => a.lineageDepth - b.lineageDepth);
    
    return {
      affectedBranches,
      propagationCount: affectedBranches.length,
    };
  }

  async getBranchStateAtAncestor(branchId, ancestorBranchId) {
    const lineage = await getBranchLineage(branchId);
    const ancestorIndex = lineage.findIndex(l => l.id === ancestorBranchId);
    
    if (ancestorIndex === -1) {
      return null; // Branch doesn't share this ancestor
    }
    
    // Get state at fork point
    const ancestorBranch = lineage[ancestorIndex];
    return ancestorBranch.state_snapshot || {};
  }

  async mergeAncestorState(branchId, ancestorBranchId, newContent) {
    const currentState = await this.getBranchStateAtAncestor(branchId, ancestorBranchId);
    
    // Extract new state from content
    const { extractState } = require('../validators/ConstraintValidator');
    const newState = extractState(newContent);
    
    // Merge states
    const mergedState = {
      ...currentState,
      characters: {
        ...currentState.characters,
        ...newState.characters,
      },
      inventory: [...new Set([...(currentState.inventory || []), ...newState.inventory])],
    };
    
    return mergedState;
  }
}

module.exports = new AncestorPropagator();
