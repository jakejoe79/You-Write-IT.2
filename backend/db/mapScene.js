/**
 * Centralized DB mapping - Ensures consistent data transformation
 */

function mapScene(row) {
  // Validate required fields
  if (row.chapter_index === undefined || row.chapter_index === null) {
    throw new Error('Invalid DB row: missing chapter_index');
  }

  if (typeof row.content !== 'string') {
    throw new Error('Invalid DB row: content must be string');
  }

  return {
    index: row.chapter_index,
    content: row.content,
    status: row.status || 'generated',
    emotion: row.emotion ? JSON.parse(row.emotion) : {},
    validation: row.validation || '',
    branch_id: row.branch_id || null,
    created_at: row.created_at || null,
  };
}

function mapSession(row) {
  if (!row.id) {
    throw new Error('Invalid DB row: missing session id');
  }

  return {
    id: row.id,
    created_at: row.created_at || null,
    mode: row.mode || 'story',
    title: row.title || '',
    genre: row.genre || null,
    author_style: row.author_style || null,
    protagonist: row.protagonist || null,
    state: row.state ? JSON.parse(row.state) : {},
  };
}

function mapBranch(row) {
  if (!row.id) {
    throw new Error('Invalid DB row: missing branch id');
  }

  return {
    id: row.id,
    session_id: row.session_id,
    parent_branch_id: row.parent_branch_id || null,
    created_at: row.created_at || null,
    name: row.name || null,
    state_snapshot: row.state_snapshot ? JSON.parse(row.state_snapshot) : null,
    is_checkpoint: row.is_checkpoint === 1,
    checkpoint_depth: row.checkpoint_depth || 0,
  };
}

module.exports = {
  mapScene,
  mapSession,
  mapBranch,
};
