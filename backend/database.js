const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// Helper to convert ? parameters to $1, $2, etc for pg
function convertSql(sql) {
  let count = 1;
  return sql.replace(/\?/g, () => `$${count++}`);
}

async function run(sql, params = []) {
  const pgSql = convertSql(sql);
  let finalSql = pgSql;
  if (finalSql.trim().toUpperCase().startsWith('INSERT') && !finalSql.toUpperCase().includes('RETURNING')) {
    finalSql += ' RETURNING id';
  }
  try {
    const res = await pool.query(finalSql, params);
    return { 
      id: res.rows && res.rows.length > 0 ? res.rows[0].id : null,
      changes: res.rowCount 
    };
  } catch (err) {
    throw err;
  }
}

async function get(sql, params = []) {
  const pgSql = convertSql(sql);
  const result = await pool.query(pgSql, params);
  return result.rows[0] || null;
}

async function all(sql, params = []) {
  const pgSql = convertSql(sql);
  const result = await pool.query(pgSql, params);
  return result.rows;
}

// Initialize tables
async function initDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      avatar_url TEXT,
      about TEXT DEFAULT 'Hey there! I am using HeroChat.',
      email TEXT,
      firebase_uid TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS contacts (
      user_id INTEGER,
      contact_id INTEGER,
      PRIMARY KEY (user_id, contact_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (contact_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      sender_id INTEGER,
      receiver_id INTEGER,
      content TEXT,
      status TEXT DEFAULT 'sent',
      attachment_url TEXT,
      attachment_type TEXT,
      attachment_name TEXT,
      is_view_once BOOLEAN DEFAULT FALSE,
      is_opened BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS call_logs (
      id SERIAL PRIMARY KEY,
      caller_id INTEGER,
      receiver_id INTEGER,
      type TEXT,
      status TEXT,
      duration INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (caller_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS statuses (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      type TEXT,
      content TEXT,
      media_url TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS user_stickers (
      id SERIAL PRIMARY KEY,
      user_id INTEGER,
      url TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
}

module.exports = {
  initDb,
  run,
  get,
  all,
  pool
};
