const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const { Pool } = require('pg');

let dbInstance = null;
let dbType = 'sqlite';

async function getDb() {
  if (dbInstance) return dbInstance;

  if (process.env.DATABASE_URL) {
    dbType = 'postgres';
    dbInstance = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
    // Test connection
    try {
      await dbInstance.query('SELECT 1');
      console.log('Connected to PostgreSQL');
    } catch (err) {
      console.error('PostgreSQL connection failed:', err);
      throw err;
    }
  } else {
    dbType = 'sqlite';
    dbInstance = await open({
      filename: path.join(__dirname, '..', 'database.sqlite'),
      driver: sqlite3.Database
    });
    console.log('Connected to SQLite');
  }

  await initSchema(dbInstance, dbType);
  return dbInstance;
}

async function initSchema(db, type) {
  const isPg = type === 'postgres';
  const serial = isPg ? 'SERIAL' : 'INTEGER';
  const autoInc = isPg ? '' : 'AUTOINCREMENT'; // SQLite uses INTEGER PRIMARY KEY AUTOINCREMENT
  const text = 'TEXT';

  // Helper to run raw SQL
  const run = async (sql) => {
    if (isPg) return db.query(sql);
    return db.exec(sql);
  };

  // Users
  await run(`CREATE TABLE IF NOT EXISTS users (
        id ${serial} PRIMARY KEY ${autoInc},
        email ${text} UNIQUE,
        password_hash ${text},
        created_at ${text},
        reset_token ${text},
        reset_token_expiry ${isPg ? 'BIGINT' : 'INTEGER'}
    )`);

  // Trials
  await run(`CREATE TABLE IF NOT EXISTS trials (
        nctId ${text} PRIMARY KEY,
        lastUpdated ${text},
        title ${text},
        sponsor ${text},
        status ${text},
        primaryCompletionDate ${text},
        lastChecked ${text}
    )`);

  // Settings
  await run(`CREATE TABLE IF NOT EXISTS settings (
        key ${text} PRIMARY KEY,
        value ${text}
    )`);

  // Sponsors
  await run(`CREATE TABLE IF NOT EXISTS sponsors (
        name ${text} PRIMARY KEY,
        lastChecked ${text}
    )`);

  // User Trials
  await run(`CREATE TABLE IF NOT EXISTS user_trials (
        user_id INTEGER,
        nctId ${text},
        PRIMARY KEY (user_id, nctId),
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(nctId) REFERENCES trials(nctId)
    )`);

  // User Sponsors
  await run(`CREATE TABLE IF NOT EXISTS user_sponsors (
        user_id INTEGER,
        sponsor_name ${text},
        PRIMARY KEY (user_id, sponsor_name),
        FOREIGN KEY(user_id) REFERENCES users(id),
        FOREIGN KEY(sponsor_name) REFERENCES sponsors(name)
    )`);

  // Migration: Add primaryCompletionDate column if it doesn't exist
  try {
    await run('ALTER TABLE trials ADD COLUMN primaryCompletionDate TEXT');
  } catch (e) {
    // Ignore error if column already exists
  }
}

// --- DAO Methods ---

async function query(sql, params = []) {
  const db = await getDb();
  if (dbType === 'postgres') {
    // Convert ? to $1, $2, etc.
    let i = 1;
    const pgSql = sql.replace(/\?/g, () => `$${i++}`);
    const res = await db.query(pgSql, params);
    return res.rows;
  } else {
    return db.all(sql, params);
  }
}

async function getOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0];
}

async function run(sql, params = []) {
  const db = await getDb();
  if (dbType === 'postgres') {
    let i = 1;
    const pgSql = sql.replace(/\?/g, () => `$${i++}`);
    const res = await db.query(pgSql, params);
    return { lastID: res.rows[0]?.id, changes: res.rowCount };
  } else {
    return db.run(sql, params);
  }
}

// Specific Operations handling Dialect Differences

async function createUser(email, passwordHash) {
  const db = await getDb();
  const createdAt = new Date().toISOString();
  if (dbType === 'postgres') {
    const res = await db.query(
      'INSERT INTO users (email, password_hash, created_at) VALUES ($1, $2, $3) RETURNING id',
      [email, passwordHash, createdAt]
    );
    return { id: res.rows[0].id };
  } else {
    const res = await db.run(
      'INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)',
      email, passwordHash, createdAt
    );
    return { id: res.lastID };
  }
}

async function upsertTrial(trial) {
  const db = await getDb();
  const { nctId, lastUpdated, title, status, sponsor, primaryCompletionDate } = trial;
  const lastChecked = new Date().toISOString();

  if (dbType === 'postgres') {
    await db.query(`
            INSERT INTO trials (nctId, lastUpdated, title, status, sponsor, primaryCompletionDate, lastChecked)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (nctId) DO UPDATE SET
                lastUpdated = EXCLUDED.lastUpdated,
                title = EXCLUDED.title,
                status = EXCLUDED.status,
                sponsor = EXCLUDED.sponsor,
                primaryCompletionDate = EXCLUDED.primaryCompletionDate,
                lastChecked = EXCLUDED.lastChecked
        `, [nctId, lastUpdated, title, status, sponsor, primaryCompletionDate, lastChecked]);
  } else {
    await db.run(`
            INSERT OR REPLACE INTO trials (nctId, lastUpdated, title, status, sponsor, primaryCompletionDate, lastChecked)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `, nctId, lastUpdated, title, status, sponsor, primaryCompletionDate, lastChecked);
  }
}

async function upsertSponsor(name) {
  const db = await getDb();
  const lastChecked = new Date().toISOString();

  if (dbType === 'postgres') {
    await db.query(`
            INSERT INTO sponsors (name, lastChecked)
            VALUES ($1, $2)
            ON CONFLICT (name) DO UPDATE SET lastChecked = EXCLUDED.lastChecked
        `, [name, lastChecked]);
  } else {
    await db.run(`
            INSERT OR REPLACE INTO sponsors (name, lastChecked)
            VALUES (?, ?)
        `, name, lastChecked);
  }
}

async function linkUserTrial(userId, nctId) {
  const db = await getDb();
  if (dbType === 'postgres') {
    await db.query(`
            INSERT INTO user_trials (user_id, nctId) VALUES ($1, $2)
            ON CONFLICT DO NOTHING
        `, [userId, nctId]);
  } else {
    await db.run(`
            INSERT OR IGNORE INTO user_trials (user_id, nctId) VALUES (?, ?)
        `, userId, nctId);
  }
}

async function linkUserSponsor(userId, sponsorName) {
  const db = await getDb();
  if (dbType === 'postgres') {
    await db.query(`
            INSERT INTO user_sponsors (user_id, sponsor_name) VALUES ($1, $2)
            ON CONFLICT DO NOTHING
        `, [userId, sponsorName]);
  } else {
    await db.run(`
            INSERT OR IGNORE INTO user_sponsors (user_id, sponsor_name) VALUES (?, ?)
        `, userId, sponsorName);
  }
}

module.exports = {
  initDb: getDb, // Export getDb as initDb for compatibility
  query,
  getOne,
  run,
  createUser,
  upsertTrial,
  upsertSponsor,
  linkUserTrial,
  linkUserSponsor
};
