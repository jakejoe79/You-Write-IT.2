// branchStore - Manages branch tree state
// Handles branch creation, switching, and ancestor propagation

import { create } from 'zustand';

const branchStore = create((set, get) => ({
  // State
  branches: {},
  currentBranchId: 'root',
  
  // Actions
  addBranch: (branch) => {
    set(state => ({
      branches: {
        ...state.branches,
        [branch.id]: {
          ...branch,
          createdAt: new Date(),
        },
      },
    }));
  },
  
  updateBranch: (branchId, updates) => {
    set(state => ({
      branches: {
        ...state.branches,
        [branchId]: {
          ...state.branches[branchId],
          ...updates,
          updatedAt: new Date(),
        },
      },
    }));
  },
  
  setCurrentBranch: (branchId) => {
    set({ currentBranchId: branchId });
  },
  
  getBranchLineage: (branchId) => {
    const { branches } = get();
    const lineage = [];
    let currentId = branchId;
    
    while (currentId) {
      const branch = branches[currentId];
      if (!branch) break;
      
      lineage.unshift({
        ...branch,
        id: currentId,
      });
      
      currentId = branch.parentBranchId;
    }
    
    return lineage;
  },
  
  getDescendantBranches: (ancestorBranchId) => {
    const { branches } = get();
    return Object.values(branches).filter(branch => {
      const lineage = get().getBranchLineage(branch.id);
      return lineage.some(l => l.id === ancestorBranchId);
    });
  },
  
  clearAll: () => {
    set({ branches: {}, currentBranchId: 'root' });
  },
}));

export default branchStore;
