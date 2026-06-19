const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  // Prevent hanging forever on Supabase free tier connection limits
  max: 5,                        // max 5 concurrent connections (free tier safe)
  connectionTimeoutMillis: 8000, // fail after 8 seconds if no connection available
  idleTimeoutMillis: 30000,      // release idle connections after 30 seconds
  query_timeout: 10000           // cancel any query running more than 10 seconds
});

// Handle pool-level errors (avoids unhandled promise rejections on stale connections)
pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err.message);
});

// Helper to convert ? parameters to $1, $2, etc for pg
function convertSql(sql) {
  let count = 1;
  return sql.replace(/\?/g, () => `$${count++}`);
}

async function run(sql, params = []) {
  const pgSql = convertSql(sql);
  let finalSql = pgSql;
  if (finalSql.trim().toUpperCase().startsWith('INSERT') &&
    !finalSql.toUpperCase().includes('RETURNING') &&
    !finalSql.toUpperCase().includes('INTO CONTACTS')) {
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
      reply_to_message_id INTEGER,
      reply_to_sender_id INTEGER,
      reply_to_sender_name TEXT,
      reply_to_text TEXT,
      is_view_once BOOLEAN DEFAULT FALSE,
      is_opened BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (reply_to_message_id) REFERENCES messages(id) ON DELETE SET NULL
    )
  `);

  await run(`
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_message_id INTEGER;
  `);
  await run(`
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_sender_id INTEGER;
  `);
  await run(`
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_sender_name TEXT;
  `);
  await run(`
    ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_text TEXT;
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

  await run(`
    CREATE TABLE IF NOT EXISTS message_reactions (
      id SERIAL PRIMARY KEY,
      message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      emoji TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT unique_message_user_reaction UNIQUE (message_id, user_id)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS fcm_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT unique_user_fcm_token UNIQUE (user_id, token)
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
