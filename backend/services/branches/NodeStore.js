/**
 * NodeStore - Immutable branching with versioned nodes
 */

const crypto = require('crypto');

function hashVersion(chapters) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(chapters))
    .digest('hex');
}

class NodeStore {
  constructor() {
    this.nodes = new Map();
  }

  /**
   * Create a new node from chapters
   * Returns node with hash-based ID
   */
  createNode(parentId, chapters) {
    const id = hashVersion(chapters);

    const node = {
      id,
      parentId,
      chapters,
      createdAt: Date.now(),
    };

    this.nodes.set(id, node);
    return node;
  }

  /**
   * Get a node by ID
   */
  getNode(id) {
    return this.nodes.get(id);
  }

  /**
   * Get all descendants of a node
   */
  getDescendants(nodeId) {
    const descendants = [];
    const toProcess = [nodeId];

    while (toProcess.length > 0) {
      const currentId = toProcess.pop();
      const node = this.nodes.get(currentId);

      if (node) {
        const children = Array.from(this.nodes.values()).filter(
          (n) => n.parentId === currentId
        );
        descendants.push(...children);
        toProcess.push(...children.map((c) => c.id));
      }
    }

    return descendants;
  }

  /**
   * Get the full lineage from root to node
   */
  getLineage(nodeId) {
    const lineage = [];
    let currentId = nodeId;

    while (currentId) {
      const node = this.nodes.get(currentId);
      if (!node) break;

      lineage.unshift(node);
      currentId = node.parentId;
    }

    return lineage;
  }
}

module.exports = new NodeStore();
