// SQLite via sql.js — pure JS, no native compilation required
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { SystemError } = require('../services/core/errors');

const DB_PATH = path.resolve(__dirname, '../../data/factory.db');

let db = null;

async function getDb() {
  if (db) return db;

  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  const schema = fs.readFileSync(path.resolve(__dirname, 'schema.sql'), 'utf8');
  db.run(schema);

  return db;
}

function save() {
  if (!db) return;
  const data = db.export();
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

// --- Session helpers ---

function generateId() {
  return crypto.randomUUID?.() || crypto.randomBytes(8).toString('hex');
}

async function createSession({ mode, title, genre, authorStyle, protagonist, state }) {
  const database = await getDb();
  const id = generateId();
  database.run(
    `INSERT INTO sessions (id, title, mode, genre, author_style, protagonist, state) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, title || null, mode, genre || null, authorStyle || null, protagonist || null, JSON.stringify(state || {})]
  );
  
  // Create root branch for this session
  database.run(
    `INSERT INTO branches (id, session_id, parent_branch_id, fork_chapter_index, name, state_snapshot, is_checkpoint, checkpoint_depth) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ['root', id, null, 0, 'Root Branch', JSON.stringify(state || {}), 0, 0]
  );
  
  save();
  return id;
}

async function getSession(id) {
  const database = await getDb();
  const stmt = database.prepare(`SELECT * FROM sessions WHERE id = ?`);
  stmt.bind([id]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return { 
      ...row, 
      state: JSON.parse(row.state || '{}'),
      last_event: row.last_event ? JSON.parse(row.last_event) : null,
      streaming: Boolean(row.streaming)
    };
  }
  stmt.free();
  return null;
}

async function updateSession(id, updates) {
  const database = await getDb();
  const fields = [];
  const values = [];
  
  if (updates.state !== undefined) {
    fields.push('state = ?');
    values.push(JSON.stringify(updates.state));
  }
  if (updates.last_event !== undefined) {
    fields.push('last_event = ?');
    values.push(JSON.stringify(updates.last_event));
  }
  if (updates.streaming !== undefined) {
    fields.push('streaming = ?');
    values.push(updates.streaming ? 1 : 0);
  }
  if (updates.last_activity !== undefined) {
    fields.push('last_activity = ?');
    values.push(updates.last_activity);
  }
  
  if (fields.length === 0) return;
  
  values.push(id);
  database.run(`UPDATE sessions SET ${fields.join(', ')} WHERE id = ?`, values);
  save();
}

async function updateSessionState(id, state) {
  const database = await getDb();
  database.run(`UPDATE sessions SET state = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [JSON.stringify(state), id]);
  save();
}

// --- Branch helpers ---

async function createBranch({ sessionId, parentBranchId, forkChapterIndex, name, stateSnapshot, isCheckpoint = false, checkpointDepth = 0 }) {
  const database = await getDb();
  const id = generateId();
  database.run(
    `INSERT INTO branches (id, session_id, parent_branch_id, fork_chapter_index, name, state_snapshot, is_checkpoint, checkpoint_depth) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, sessionId, parentBranchId, forkChapterIndex, name || null, JSON.stringify(stateSnapshot || {}), isCheckpoint ? 1 : 0, checkpointDepth]
  );
  save();
  return id;
}

async function getBranch(branchId) {
  const database = await getDb();
  const stmt = database.prepare(`SELECT * FROM branches WHERE id = ?`);
  stmt.bind([branchId]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return {
      ...row,
      state_snapshot: row.state_snapshot ? JSON.parse(row.state_snapshot) : null,
      emotion_trajectory: row.emotion_trajectory ? JSON.parse(row.emotion_trajectory) : null,
    };
  }
  stmt.free();
  return null;
}

async function updateBranch(branchId, updates) {
  const database = await getDb();
  const fields = [];
  const values = [];
  
  if (updates.state_snapshot !== undefined) {
    fields.push('state_snapshot = ?');
    values.push(JSON.stringify(updates.state_snapshot));
  }
  if (updates.emotion_trajectory !== undefined) {
    fields.push('emotion_trajectory = ?');
    values.push(JSON.stringify(updates.emotion_trajectory));
  }
  if (updates.personality !== undefined) {
    fields.push('personality = ?');
    values.push(updates.personality);
  }
  if (updates.is_checkpoint !== undefined) {
    fields.push('is_checkpoint = ?');
    values.push(updates.is_checkpoint ? 1 : 0);
  }
  
  if (fields.length === 0) return;
  
  values.push(branchId);
  database.run(`UPDATE branches SET ${fields.join(', ')} WHERE id = ?`, values);
  save();
}

async function getBranchTree(sessionId) {
  const database = await getDb();
  const stmt = database.prepare(`SELECT * FROM branches WHERE session_id = ? ORDER BY created_at`);
  stmt.bind([sessionId]);
  const branches = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    branches.push({
      ...row,
      state_snapshot: row.state_snapshot ? JSON.parse(row.state_snapshot) : null,
      emotion_trajectory: row.emotion_trajectory ? JSON.parse(row.emotion_trajectory) : null,
    });
  }
  stmt.free();
  return branches;
}

async function getBranchLineage(branchId) {
  const database = await getDb();
  const lineage = [];
  let currentId = branchId;
  let depth = 0;
  
  while (currentId) {
    const stmt = database.prepare(`SELECT * FROM branches WHERE id = ?`);
    stmt.bind([currentId]);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      lineage.unshift({
        ...row,
        state_snapshot: row.state_snapshot ? JSON.parse(row.state_snapshot) : null,
        emotion_trajectory: row.emotion_trajectory ? JSON.parse(row.emotion_trajectory) : null,
        depth: depth++,
      });
      currentId = row.parent_branch_id;
    } else {
      currentId = null;
    }
    stmt.free();
  }
  
  return lineage;
}

async function getBranchStateAtFork(branchId) {
  const branch = await getBranch(branchId);
  if (!branch) return null;
  
  // If this is root branch, return null (no fork)
  if (!branch.parent_branch_id) return null;
  
  return branch.state_snapshot;
}

async function getCheckpointState(sessionId, branchId, targetDepth) {
  const lineage = await getBranchLineage(branchId);
  
  // Find checkpoint at or before target depth
  for (let i = lineage.length - 1; i >= 0; i--) {
    if (lineage[i].checkpoint_depth <= targetDepth && lineage[i].is_checkpoint) {
      return {
        branch: lineage[i],
        state: lineage[i].state_snapshot,
        fromDepth: lineage[i].checkpoint_depth,
      };
    }
  }
  
  // No checkpoint found, return root state
  return {
    branch: lineage[0],
    state: lineage[0]?.state_snapshot || {},
    fromDepth: 0,
  };
}

// --- Chapter helpers ---

async function addChapter(sessionId, branchId, chapterIndex, content, emotion, validation, derivedFrom = null, extractedState = null) {
  const database = await getDb();
  database.run(
    `INSERT INTO chapters (session_id, branch_id, chapter_index, content, emotion, validation, derived_from, extracted_state) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [sessionId, branchId, chapterIndex, content, JSON.stringify(emotion || {}), validation || '', derivedFrom, extractedState ? JSON.stringify(extractedState) : null]
  );
  save();
}

async function getChapters(sessionId, branchId = null) {
  const database = await getDb();
  let query = `SELECT * FROM chapters WHERE session_id = ?`;
  const params = [sessionId];
  
  if (branchId !== undefined) {
    query += branchId ? ` AND branch_id = ?` : ` AND branch_id IS NULL`;
    params.push(branchId);
  }
  
  query += ` ORDER BY chapter_index`;
  
  const stmt = database.prepare(query);
  stmt.bind(params);
  const chapters = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    chapters.push(mapChapter(row));
  }
  stmt.free();
  return chapters;
}

// Centralized row mapping - ONE function, ONE truth
function mapChapter(row) {
  // DB → Domain validation boundary
  if (row.chapter_index === undefined) {
    throw new SystemError('Missing chapter_index in DB row', { row });
  }
  
  if (typeof row.content !== 'string' || !row.content.trim()) {
    throw new SystemError('Invalid chapter content from DB', {
      index: row.chapter_index,
      content: row.content,
    });
  }
  
  // Status validation
  const VALID_STATUS = new Set(['generated', 'edited', 'stale', 'recomputing', 'error']);
  if (row.status && !VALID_STATUS.has(row.status)) {
    throw new SystemError('Invalid chapter status', {
      index: row.chapter_index,
      status: row.status,
    });
  }
  
  return {
    id: row.id,
    session_id: row.session_id,
    branch_id: row.branch_id,
    index: row.chapter_index,
    content: row.content,
    emotion: JSON.parse(row.emotion || '{}'),
    validation: row.validation,
    status: row.status || 'generated',
    last_edited: row.last_edited,
    derived_from: row.derived_from,
    extracted_state: row.extracted_state ? JSON.parse(row.extracted_state) : null,
    created_at: row.created_at,
  };
}

// Get scenes with guaranteed ordering - NEVER forget ORDER BY
function getOrderedScenes(db, sessionId, branchId) {
  return db.all(
    `SELECT * FROM chapters WHERE session_id = ? AND branch_id = ? ORDER BY chapter_index ASC`,
    [sessionId, branchId]
  );
}

async function getChapter(sessionId, branchId, index) {
  const chapters = await getChapters(sessionId, branchId);
  const chapter = chapters.find(c => c.index === index) || null;
  if (chapter) {
    const database = await getDb();
    const stmt = database.prepare(`SELECT derived_from, extracted_state FROM chapters WHERE session_id = ? AND branch_id = ? AND chapter_index = ?`);
    stmt.bind([sessionId, branchId, index]);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      chapter.derived_from = row.derived_from;
      chapter.extracted_state = row.extracted_state ? JSON.parse(row.extracted_state) : null;
    }
    stmt.free();
  }
  return chapter;
}

async function updateChapterContent(sessionId, branchId, index, content, extractedState = null, derivedFrom = null) {
  const database = await getDb();
  const stmt = database.prepare(
    `UPDATE chapters SET content = ?, status = 'edited', last_edited = CURRENT_TIMESTAMP, extracted_state = ?, derived_from = ? WHERE session_id = ? AND branch_id = ? AND chapter_index = ?`
  );
  stmt.bind([content, extractedState ? JSON.stringify(extractedState) : null, derivedFrom, sessionId, branchId, index]);
  stmt.step();
  stmt.free();
  save();
}

async function getChapterState(sessionId, branchId, upToIndex) {
  const lineage = await getBranchLineage(branchId);
  
  const state = {
    characters: [],
    inventory: [],
    deadCharacters: [],
    removedInventory: [],
    worldRules: [],
    events: [],
  };
  
  for (const branch of lineage) {
    const chapters = await getChapters(sessionId, branch.id);
    const relevantChapters = chapters.filter(c => c.index < upToIndex);
    
    for (const chapter of relevantChapters) {
      const charMatches = chapter.content.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || [];
      state.characters.push(...charMatches);
      
      const deathMatches = chapter.content.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*).*?(?:died|dead|killed|passed away)/gi) || [];
      for (const match of deathMatches) {
        const name = match.replace(/.*?([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*).*/i, '$1');
        if (!state.deadCharacters.includes(name)) {
          state.deadCharacters.push(name);
        }
      }
      
      const invPatterns = [
        /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:carries|has|holds|wields|owns)/g,
      ];
      for (const pattern of invPatterns) {
        let match;
        while ((match = pattern.exec(chapter.content)) !== null) {
          if (!state.inventory.includes(match[1])) {
            state.inventory.push(match[1]);
          }
        }
      }
    }
  }
  
  state.characters = [...new Set(state.characters)];
  state.inventory = [...new Set(state.inventory)];
  
  return state;
}

// --- Revision helpers (5-revision FIFO) ---

async function addRevision(chapterId, content, emotion) {
  const database = await getDb();
  database.run(
    `INSERT INTO revisions (chapter_id, content, emotion) VALUES (?, ?, ?)`,
    [chapterId, content, JSON.stringify(emotion || {})]
  );
  
  const stmt = database.prepare(`
    SELECT id FROM revisions WHERE chapter_id = ? ORDER BY created_at DESC LIMIT 5 OFFSET 4
  `);
  stmt.bind([chapterId]);
  const toDelete = [];
  while (stmt.step()) {
    toDelete.push(stmt.getAsObject().id);
  }
  stmt.free();
  
  for (const revId of toDelete) {
    database.run(`DELETE FROM revisions WHERE id = ?`, [revId]);
  }
  
  save();
}

async function getRevisions(chapterId) {
  const database = await getDb();
  const stmt = database.prepare(`SELECT * FROM revisions WHERE chapter_id = ? ORDER BY created_at DESC`);
  stmt.bind([chapterId]);
  const revisions = [];
  while (stmt.step()) {
    const row = stmt.getAsObject();
    revisions.push({
      id: row.id,
      content: row.content,
      emotion: JSON.parse(row.emotion || '{}'),
      created_at: row.created_at,
    });
  }
  stmt.free();
  return revisions;
}

async function getChapterId(sessionId, branchId, index) {
  const database = await getDb();
  const stmt = database.prepare(`SELECT id FROM chapters WHERE session_id = ? AND branch_id = ? AND chapter_index = ?`);
  stmt.bind([sessionId, branchId, index]);
  
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row.id;
  }
  
  stmt.free();
  return null;
}

// --- Legacy scene helpers (for compatibility) ---

async function addScene(sessionId, index, content, emotion, validation, branchId = null) {
  return addChapter(sessionId, branchId || 'root', index, content, emotion, validation);
}

async function getScenes(sessionId, branchId = null) {
  return getChapters(sessionId, branchId);
}

async function updateSceneContent(sessionId, index, content, branchId = null) {
  return updateChapterContent(sessionId, branchId || 'root', index, content);
}

module.exports = {
  getDb, save,
  createSession, getSession, updateSession, updateSessionState,
  createBranch, getBranch, getBranchTree, getBranchLineage, getBranchStateAtFork, getCheckpointState, updateBranch,
  addChapter, getChapters, getChapter, updateChapterContent, getChapterState,
  addRevision, getRevisions, getChapterId,
  addScene, getScenes, updateSceneContent,
  mapChapter,
  getOrderedScenes,
};