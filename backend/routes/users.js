const express = require('express');
const router = express.Router();
const db = require('../database');
const { authenticateToken } = require('../auth');

// Search users
router.get('/search', authenticateToken, async (req, res) => {
  const query = req.query.q ? `%${req.query.q.trim().toLowerCase()}%` : '%';
  try {
    const users = await db.all(
      'SELECT id, username, display_name, avatar_url FROM users WHERE id != ? AND (username LIKE ? OR display_name LIKE ?)',
      [req.user.id, query, query]
    );
    res.json(users);
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: 'Internal server error during search' });
  }
});

// Get contacts (explicit contacts + people messaged)
router.get('/contacts', authenticateToken, async (req, res) => {
  try {
    // Return all users who are either added as contact, or have messaged the current user
    const query = `
      SELECT DISTINCT u.id, u.username, u.display_name, u.avatar_url, u.about,
        (SELECT COUNT(*) FROM messages WHERE sender_id = u.id AND receiver_id = ? AND status != 'read') as unread_count
      FROM users u
      WHERE u.id != ? AND (
        u.id IN (SELECT contact_id FROM contacts WHERE user_id = ?)
        OR u.id IN (SELECT sender_id FROM messages WHERE receiver_id = ?)
        OR u.id IN (SELECT receiver_id FROM messages WHERE sender_id = ?)
      )
    `;
    const contacts = await db.all(query, [req.user.id, req.user.id, req.user.id, req.user.id, req.user.id]);
    res.json(contacts);
  } catch (err) {
    console.error('Get contacts error:', err);
    res.status(500).json({ error: 'Internal server error retrieving contacts' });
  }
});

// Add a contact
router.post('/contacts/add', authenticateToken, async (req, res) => {
  const { contact_id } = req.body;
  if (!contact_id) {
    return res.status(400).json({ error: 'Contact ID is required' });
  }

  if (Number(contact_id) === req.user.id) {
    return res.status(400).json({ error: 'Cannot add yourself as a contact' });
  }

  try {
    // Check if user exists
    const contactUser = await db.get('SELECT id FROM users WHERE id = ?', [contact_id]);
    if (!contactUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Add contact relation (insert or do nothing if exists)
    await db.run(
      'INSERT INTO contacts (user_id, contact_id) VALUES (?, ?) ON CONFLICT (user_id, contact_id) DO NOTHING',
      [req.user.id, contact_id]
    );
    // Also add reciprocal relation for easier chatting
    await db.run(
      'INSERT INTO contacts (user_id, contact_id) VALUES (?, ?) ON CONFLICT (user_id, contact_id) DO NOTHING',
      [contact_id, req.user.id]
    );

    res.json({ success: true, message: 'Contact added successfully' });
  } catch (err) {
    console.error('Add contact error:', err);
    res.status(500).json({ error: 'Internal server error adding contact' });
  }
});

// Get messages history with another user
router.get('/messages/:otherUserId', authenticateToken, async (req, res) => {
  const otherUserId = req.params.otherUserId;
  try {
    const messages = await db.all(
      `SELECT * FROM messages 
       WHERE (sender_id = ? AND receiver_id = ?) 
          OR (sender_id = ? AND receiver_id = ?)
       ORDER BY created_at ASC`,
      [req.user.id, otherUserId, otherUserId, req.user.id]
    );
    res.json(messages);
  } catch (err) {
    console.error('Get messages error:', err);
    res.status(500).json({ error: 'Internal server error retrieving message history' });
  }
});

// Get call history
router.get('/calls', authenticateToken, async (req, res) => {
  try {
    const callLogs = await db.all(
      `SELECT c.*, 
              u1.display_name as caller_name, u1.avatar_url as caller_avatar,
              u2.display_name as receiver_name, u2.avatar_url as receiver_avatar
       FROM call_logs c
       JOIN users u1 ON c.caller_id = u1.id
       JOIN users u2 ON c.receiver_id = u2.id
       WHERE c.caller_id = ? OR c.receiver_id = ?
       ORDER BY c.created_at DESC`,
      [req.user.id, req.user.id]
    );
    res.json(callLogs);
  } catch (err) {
    console.error('Get calls error:', err);
    res.status(500).json({ error: 'Internal server error retrieving call logs' });
  }
});

// Update Profile endpoint
router.post('/profile', authenticateToken, async (req, res) => {
  const { display_name, about, avatar_url } = req.body;
  console.log('--- Profile Update Request Received ---');
  console.log('User ID:', req.user.id);
  console.log('Parameters:', { display_name, about, avatar_url });

  if (!display_name) {
    console.log('Validation failed: display name is missing');
    return res.status(400).json({ error: 'Display name is required' });
  }
  try {
    const result = await db.run(
      'UPDATE users SET display_name = ?, about = ?, avatar_url = ? WHERE id = ?',
      [display_name.trim(), about ? about.trim() : '', avatar_url || null, req.user.id]
    );
    console.log('Update query finished successfully. Row count:', result.changes);
    res.json({ success: true, message: 'Profile updated successfully' });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// Post a status update (story)
router.post('/status', authenticateToken, async (req, res) => {
  const { type, content, media_url } = req.body;
  if (!type || (!content && !media_url)) {
    return res.status(400).json({ error: 'Status content or media is required' });
  }
  try {
    await db.run(
      'INSERT INTO statuses (user_id, type, content, media_url) VALUES (?, ?, ?, ?)',
      [req.user.id, type, content || '', media_url || null]
    );
    res.json({ success: true, message: 'Status posted successfully' });
  } catch (err) {
    console.error('Post status error:', err);
    res.status(500).json({ error: 'Failed to post status update' });
  }
});

// Fetch active status updates from user and contacts (past 24 hours)
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const statuses = await db.all(
      `SELECT s.*, u.display_name, u.avatar_url, u.username
       FROM statuses s
       JOIN users u ON s.user_id = u.id
       WHERE s.created_at >= NOW() - INTERVAL '24 HOURS'
         AND (s.user_id = ? OR s.user_id IN (SELECT contact_id FROM contacts WHERE user_id = ?))
       ORDER BY s.created_at DESC`,
      [req.user.id, req.user.id]
    );
    res.json(statuses);
  } catch (err) {
    console.error('Fetch statuses error:', err);
    res.status(500).json({ error: 'Failed to fetch status updates' });
  }
});


// Fetch user's custom stickers
router.get('/stickers', authenticateToken, async (req, res) => {
  try {
    const stickers = await db.all(
      'SELECT id, url FROM user_stickers WHERE user_id = ? ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json(stickers);
  } catch (err) {
    console.error('Fetch stickers error:', err);
    res.status(500).json({ error: 'Failed to fetch stickers' });
  }
});

// Add a custom sticker
router.post('/stickers', authenticateToken, async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: 'Sticker URL is required' });
  }
  try {
    const result = await db.run(
      'INSERT INTO user_stickers (user_id, url) VALUES (?, ?)',
      [req.user.id, url]
    );
    res.json({ success: true, sticker: { id: result.id, url } });
  } catch (err) {
    console.error('Add sticker error:', err);
    res.status(500).json({ error: 'Failed to add sticker' });
  }
});

module.exports = router;
