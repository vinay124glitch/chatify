const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const db = require('./database');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const { verifyToken } = require('./auth');

const path = require('path');
const multer = require('multer');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname.replace(/[^a-zA-Z0-9.]/g, '_'));
  }
});

const upload = multer({ storage });

// Serve static uploads folder
app.use('/uploads', express.static(uploadsDir));

// Local file upload endpoint
app.post('/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const fileUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  res.json({ success: true, url: fileUrl });
});

// Routes
app.use('/auth', authRoutes);
app.use('/users', userRoutes);

const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Map of userId (Number) -> Set of socketIds (String)
const userSockets = new Map();
// Set of online userIds (Number)
const onlineUsers = new Set();

// Helper to send to a user
function sendToUser(userId, event, data) {
  const sockets = userSockets.get(Number(userId));
  if (sockets) {
    sockets.forEach(socketId => {
      io.to(socketId).emit(event, data);
    });
    return true; // Sent successfully (online)
  }
  return false; // User is offline
}

// Socket authentication middleware
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication error: Token missing'));
  }
  const decoded = verifyToken(token);
  if (!decoded) {
    return next(new Error('Authentication error: Invalid token'));
  }
  socket.userId = decoded.id;
  socket.username = decoded.username;
  next();
});

io.on('connection', async (socket) => {
  const userId = Number(socket.userId);
  console.log(`User connected: ${socket.username} (ID: ${userId})`);

  // Add socket to map
  if (!userSockets.has(userId)) {
    userSockets.set(userId, new Set());
  }
  userSockets.get(userId).add(socket.id);
  onlineUsers.add(userId);

  // Broadcast presence status: online
  socket.broadcast.emit('presence_change', { userId, status: 'online' });

  // Handle catching up on offline messages (mark 'sent' messages to 'delivered' and notify senders)
  try {
    const offlineMsgs = await db.all(
      `SELECT DISTINCT sender_id FROM messages WHERE receiver_id = ? AND status = 'sent'`,
      [userId]
    );
    
    if (offlineMsgs.length > 0) {
      // Mark as delivered in DB
      await db.run(
        `UPDATE messages SET status = 'delivered' WHERE receiver_id = ? AND status = 'sent'`,
        [userId]
      );
      
      // Notify senders
      offlineMsgs.forEach(item => {
        sendToUser(item.sender_id, 'message_status_update', {
          receiverId: userId,
          status: 'delivered'
        });
      });
    }
  } catch (err) {
    console.error('Error handling offline message sync:', err);
  }

  // Get active users presence list for this socket
  socket.on('get_presence_list', () => {
    socket.emit('presence_list', Array.from(onlineUsers));
  });

  // Handle messages
  socket.on('send_message', async (data, callback) => {
    const { receiverId, content, attachmentUrl, attachmentType, attachmentName, isViewOnce } = data;
    if (!receiverId || (!content && !attachmentUrl)) return;

    try {
      const targetUserId = Number(receiverId);
      const isOnline = userSockets.has(targetUserId);
      const status = isOnline ? 'delivered' : 'sent';
      const viewOnceVal = isViewOnce ? true : false;

      const result = await db.run(
        'INSERT INTO messages (sender_id, receiver_id, content, status, attachment_url, attachment_type, attachment_name, is_view_once) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [userId, targetUserId, content || '', status, attachmentUrl || null, attachmentType || null, attachmentName || null, viewOnceVal]
      );

      const message = {
        id: result.id,
        sender_id: userId,
        receiver_id: targetUserId,
        content: content || '',
        status,
        attachment_url: attachmentUrl || null,
        attachment_type: attachmentType || null,
        attachment_name: attachmentName || null,
        is_view_once: viewOnceVal,
        is_opened: false,
        created_at: new Date().toISOString()
      };

      // Send to recipient
      if (isOnline) {
        sendToUser(targetUserId, 'receive_message', message);
      }

      // Confirm to sender (using socket callback or custom event)
      if (callback) {
        callback(message);
      } else {
        socket.emit('message_ack', message);
      }
    } catch (err) {
      console.error('Save message error:', err);
    }
  });

  // Typing indicators
  socket.on('typing', (data) => {
    const { receiverId, isTyping } = data;
    sendToUser(receiverId, 'typing_status', { senderId: userId, isTyping });
  });

  // Mark messages as read
  socket.on('mark_read', async (data) => {
    const { senderId } = data; // the user who sent messages
    try {
      const senderUserId = Number(senderId);
      await db.run(
        `UPDATE messages SET status = 'read' 
         WHERE sender_id = ? AND receiver_id = ? AND status != 'read'`,
        [senderUserId, userId]
      );

      // Notify the sender that their messages were read
      sendToUser(senderUserId, 'message_status_update', {
        receiverId: userId,
        status: 'read'
      });
    } catch (err) {
      console.error('Mark read error:', err);
    }
  });

  // Mark view once image as opened
  socket.on('open_view_once', async (data) => {
    const { messageId, senderId } = data;
    try {
      await db.run(
        `UPDATE messages SET is_opened = TRUE WHERE id = ? AND receiver_id = ?`,
        [messageId, userId]
      );
      
      // Notify the sender that it was opened
      sendToUser(Number(senderId), 'view_once_opened', {
        messageId,
        receiverId: userId
      });
    } catch (err) {
      console.error('Open view once error:', err);
    }
  });

  // React to a message with an emoji
  socket.on('react_message', async (data) => {
    const { messageId, emoji } = data;
    if (!messageId || !emoji) return;

    try {
      // Get the message to find the other participant
      const msg = await db.get('SELECT sender_id, receiver_id FROM messages WHERE id = ?', [messageId]);
      if (!msg) return;

      // Verify the reacting user is a participant
      const senderId = Number(msg.sender_id);
      const receiverId = Number(msg.receiver_id);
      if (userId !== senderId && userId !== receiverId) return;

      // Check if user already has a reaction on this message
      const existing = await db.get(
        'SELECT id, emoji FROM message_reactions WHERE message_id = ? AND user_id = ?',
        [messageId, userId]
      );

      if (existing && existing.emoji === emoji) {
        // Same emoji → toggle off (delete)
        await db.run('DELETE FROM message_reactions WHERE id = ?', [existing.id]);
      } else if (existing) {
        // Different emoji → update
        await db.run('UPDATE message_reactions SET emoji = ? WHERE id = ?', [emoji, existing.id]);
      } else {
        // No existing reaction → insert
        await db.run(
          'INSERT INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)',
          [messageId, userId, emoji]
        );
      }

      // Fetch updated reactions for this message
      const reactions = await db.all(
        'SELECT user_id, emoji FROM message_reactions WHERE message_id = ?',
        [messageId]
      );

      const reactionUpdate = {
        messageId,
        reactions: reactions || []
      };

      // Broadcast to both participants
      sendToUser(senderId, 'reaction_update', reactionUpdate);
      if (senderId !== receiverId) {
        sendToUser(receiverId, 'reaction_update', reactionUpdate);
      }
    } catch (err) {
      console.error('React message error:', err);
    }
  });

  // WebRTC Calling signaling
  socket.on('call_request', (data) => {
    const { receiverId, sdpOffer, type } = data;
    const targetUserId = Number(receiverId);
    console.log(`Call request from ${userId} to ${targetUserId} (Type: ${type})`);
    
    const isOnline = sendToUser(targetUserId, 'incoming_call', {
      callerId: userId,
      callerName: socket.username,
      sdpOffer,
      type
    });

    if (!isOnline) {
      socket.emit('call_error', { error: 'User is offline' });
      // Log missed call
      db.run(
        'INSERT INTO call_logs (caller_id, receiver_id, type, status, duration) VALUES (?, ?, ?, ?, ?)',
        [userId, targetUserId, type, 'missed', 0]
      ).catch(err => console.error(err));
    }
  });

  socket.on('call_accepted', (data) => {
    const { callerId, sdpAnswer } = data;
    const targetUserId = Number(callerId);
    console.log(`Call accepted by ${userId} for caller ${targetUserId}`);
    sendToUser(targetUserId, 'call_accepted', {
      calleeId: userId,
      sdpAnswer
    });
  });

  socket.on('call_rejected', (data) => {
    const { callerId, type } = data;
    const targetUserId = Number(callerId);
    console.log(`Call rejected by ${userId} for caller ${targetUserId}`);
    sendToUser(targetUserId, 'call_rejected', { calleeId: userId });
    
    // Log rejected call
    db.run(
      'INSERT INTO call_logs (caller_id, receiver_id, type, status, duration) VALUES (?, ?, ?, ?, ?)',
      [targetUserId, userId, type || 'video', 'rejected', 0]
    ).catch(err => console.error(err));
  });

  socket.on('ice_candidate', (data) => {
    const { targetId, candidate } = data;
    sendToUser(targetId, 'ice_candidate', {
      senderId: userId,
      candidate
    });
  });

  socket.on('hangup', (data) => {
    const { targetId, duration, status, type } = data;
    const targetUserId = Number(targetId);
    console.log(`Call hangup by ${userId} with target ${targetUserId}`);
    sendToUser(targetUserId, 'call_ended', { senderId: userId });

    // Log call duration
    if (duration !== undefined && status) {
      // If status is connected, it was an active call. Log the details.
      db.run(
        'INSERT INTO call_logs (caller_id, receiver_id, type, status, duration) VALUES (?, ?, ?, ?, ?)',
        [userId, targetUserId, type || 'video', status, duration]
      ).catch(err => console.error(err));
    }
  });

  // Disconnection
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.username} (ID: ${userId})`);
    const sockets = userSockets.get(userId);
    if (sockets) {
      sockets.delete(socket.id);
      if (sockets.size === 0) {
        userSockets.delete(userId);
        onlineUsers.delete(userId);
        // Broadcast presence status: offline
        socket.broadcast.emit('presence_change', { userId, status: 'offline' });
      }
    }
  });
});

const PORT = process.env.PORT || 5000;
db.initDb().then(() => {
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}).catch(err => {
  console.error('Database initialization failed:', err);
});
