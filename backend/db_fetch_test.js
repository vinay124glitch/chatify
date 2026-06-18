const { Pool } = require('pg');
require('dotenv').config({ path: 'c:/Users/vinay/Documents/MY HERO/backend/.env' });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function test() {
  try {
    const res = await pool.query(`
      SELECT DISTINCT u.id, u.username, u.display_name, u.avatar_url, u.about,
        (SELECT COUNT(*) FROM messages WHERE sender_id = u.id AND receiver_id = $1 AND status != 'read') as unread_count
      FROM users u
      WHERE u.id != $2 AND (
        u.id IN (SELECT contact_id FROM contacts WHERE user_id = $3)
        OR u.id IN (SELECT sender_id FROM messages WHERE receiver_id = $4)
        OR u.id IN (SELECT receiver_id FROM messages WHERE sender_id = $5)
      )
    `, [1, 1, 1, 1, 1]);
    console.log("Fetch success!", res.rows);
  } catch (err) {
    console.error("Test failed:", err.message);
  } finally {
    await pool.end();
  }
}

test();
