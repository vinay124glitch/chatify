const express = require('express');
const router = express.Router();
const db = require('../database');
const { hashPassword, comparePassword, generateToken, authenticateToken } = require('../auth');

// Register endpoint
router.post('/register', async (req, res) => {
  const { email, firebase_uid, display_name } = req.body;

  if (!email || !firebase_uid) {
    return res.status(400).json({ error: 'Email and Firebase UID are required' });
  }

  const cleanEmail = email.trim().toLowerCase();
  // Generate a username from the email handle
  const generatedUsername = cleanEmail.split('@')[0] + Math.floor(Math.random() * 10000);

  try {
    // Check if user already exists
    const existingUser = await db.get('SELECT id FROM users WHERE email = ?', [cleanEmail]);
    if (existingUser) {
      return res.status(409).json({ error: 'Email is already registered' });
    }

    const displayName = display_name ? display_name.trim() : generatedUsername;
    
    // Default avatar URL (using UI initials or placeholder)
    const avatarUrl = `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(displayName)}`;

    const result = await db.run(
      'INSERT INTO users (username, password_hash, display_name, avatar_url, email, firebase_uid) VALUES (?, ?, ?, ?, ?, ?)',
      [generatedUsername, 'FIREBASE_AUTH', displayName, avatarUrl, cleanEmail, firebase_uid]
    );

    const user = { 
      id: result.id, 
      username: generatedUsername, 
      display_name: displayName, 
      avatar_url: avatarUrl,
      about: 'Hey there! I am using HeroChat.' 
    };
    const token = generateToken(user);

    res.status(201).json({ token, user });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Internal server error during registration' });
  }
});

// Login endpoint
router.post('/login', async (req, res) => {
  const { firebase_uid } = req.body;

  if (!firebase_uid) {
    return res.status(400).json({ error: 'Firebase UID is required' });
  }

  try {
    const user = await db.get('SELECT * FROM users WHERE firebase_uid = ?', [firebase_uid]);
    if (!user) {
      return res.status(401).json({ error: 'User not found in local database' });
    }

    const userResponse = {
      id: user.id,
      username: user.username,
      display_name: user.display_name,
      avatar_url: user.avatar_url,
      about: user.about
    };
    const token = generateToken(userResponse);

    res.json({ token, user: userResponse });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

// Get current user (token validation)
router.get('/me', authenticateToken, async (req, res) => {
  try {
    const user = await db.get('SELECT id, username, display_name, avatar_url, about FROM users WHERE id = ?', [req.user.id]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    console.error('Fetch me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reset password endpoint
router.post('/reset-password', async (req, res) => {
  const { username, newPassword } = req.body;

  if (!username || !newPassword) {
    return res.status(400).json({ error: 'Username and new password are required' });
  }

  const cleanUsername = username.trim().toLowerCase();

  try {
    const user = await db.get('SELECT id FROM users WHERE username = ?', [cleanUsername]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const hash = await hashPassword(newPassword);
    
    await db.run(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [hash, user.id]
    );

    res.json({ success: true, message: 'Password reset successfully' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Internal server error during password reset' });
  }
});

module.exports = router;
