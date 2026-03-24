// BranchManager - orchestrates branch generation and state management
// Handles branch creation, state snapshots, and recompute operations

const { getBranch, getBranchTree, getBranchLineage, getCheckpointState } = require('../../db/sqlite');

class BranchManager {
  constructor() {
    this.branches = new Map();
  }

  async createBranch({ sessionId, parentBranchId, forkChapterIndex, name, stateSnapshot }) {
    const branchId = await createBranch({
      sessionId,
      parentBranchId,
      forkChapterIndex,
      name,
      stateSnapshot,
    });
    
    this.branches.set(branchId, {
      id: branchId,
      sessionId,
      parentBranchId,
      forkChapterIndex,
      name,
      stateSnapshot,
      createdAt: new Date(),
    });
    
    return branchId;
  }

  async getBranchState(branchId) {
    const branch = await getBranch(branchId);
    if (!branch) return null;
    
    return {
      ...branch,
      state_snapshot: branch.state_snapshot ? JSON.parse(branch.state_snapshot) : null,
    };
  }

  async getBranchTree(sessionId) {
    const branches = await getBranchTree(sessionId);
    return branches.map(b => ({
      ...b,
      state_snapshot: b.state_snapshot ? JSON.parse(b.state_snapshot) : null,
    }));
  }

  async getAncestorChain(branchId) {
    return await getBranchLineage(branchId);
  }

  async getCheckpointAtDepth(branchId, targetDepth) {
    return await getCheckpointState(branchId, targetDepth);
  }

  async propagateAncestorEdit(sessionId, ancestorBranchId, ancestorIndex, newContent) {
    // Get all descendant branches
    const branches = await getBranchTree(sessionId);
    const affectedBranches = branches.filter(b => {
      const lineage = await getBranchLineage(b.id);
      return lineage.some(l => l.id === ancestorBranchId && l.fork_chapter_index <= ancestorIndex);
    });
    
    return affectedBranches.map(b => ({
      branchId: b.id,
      needsRecompute: true,
    }));
  }
}

module.exports = new BranchManager();
