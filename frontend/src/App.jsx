import React, { useState, useEffect, useCallback } from 'react';
import io from 'socket.io-client';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';
import LoginRegister from './components/LoginRegister';
import CallOverlay from './components/CallOverlay';
import useWebRTC from './hooks/useWebRTC';
import { Zap, MessageSquare, PhoneCall } from 'lucide-react';
import { API_BASE_URL } from './config';

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('whatsapp_token'));
  const [currentUser, setCurrentUser] = useState(null);
  const [socket, setSocket] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [theme, setTheme] = useState(() => localStorage.getItem('chatify_theme') || 'dark');

  // Apply theme to html element
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('chatify_theme', theme);
    // Update mobile browser chrome color
    const meta = document.getElementById('theme-color-meta');
    if (meta) meta.setAttribute('content', theme === 'dark' ? '#0F172A' : '#F1F5F9');
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  // Fetch current user details on start
  const fetchCurrentUser = useCallback(async (authToken) => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${authToken}` }
      });
      if (res.ok) {
        const user = await res.json();
        setCurrentUser(user);
      } else {
        throw new Error('Unauthorized');
      }
    } catch (err) {
      console.error(err);
      localStorage.removeItem('whatsapp_token');
      setToken(null);
      setCurrentUser(null);
    }
  }, []);

  useEffect(() => {
    if (token) {
      fetchCurrentUser(token);
    }
  }, [token, fetchCurrentUser]);

  // Lifted contact fetching
  const fetchContacts = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/users/contacts`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setContacts(data);
      }
    } catch (err) {
      console.error('Failed to fetch contacts:', err);
    }
  }, [token]);

  useEffect(() => {
    if (token && currentUser) {
      fetchContacts();
    }
  }, [token, currentUser, fetchContacts]);

  // Reset unread count locally when activeChat is selected
  useEffect(() => {
    if (activeChat) {
      setContacts((prev) =>
        prev.map((c) =>
          Number(c.id) === Number(activeChat.id) ? { ...c, unread_count: 0 } : c
        )
      );
    }
  }, [activeChat]);

  // Connect to Socket.io when authenticated
  useEffect(() => {
    if (token && currentUser) {
      const newSocket = io(API_BASE_URL, {
        auth: { token }
      });

      setSocket(newSocket);

      newSocket.on('connect', () => {
        console.log('Socket.io connected');
        newSocket.emit('get_presence_list');
      });

      newSocket.on('presence_list', (list) => {
        setOnlineUsers(list);
      });

      newSocket.on('presence_change', (data) => {
        setOnlineUsers((prev) => {
          if (data.status === 'online') {
            return prev.includes(Number(data.userId)) ? prev : [...prev, Number(data.userId)];
          } else {
            return prev.filter(id => id !== Number(data.userId));
          }
        });
      });

      // Simple browser notification & unread increment on incoming message
      newSocket.on('receive_message', (msg) => {
        const senderId = Number(msg.sender_id);

        // 1. Play subtle audio notification beep (Web Audio API)
        try {
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          const osc = audioCtx.createOscillator();
          const gainNode = audioCtx.createGain();
          
          osc.connect(gainNode);
          gainNode.connect(audioCtx.destination);
          
          osc.frequency.setValueAtTime(587.33, audioCtx.currentTime); // D5 note
          gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
          
          osc.start();
          osc.stop(audioCtx.currentTime + 0.12);
        } catch (e) {
          console.warn('AudioContext beep failed:', e);
        }

        // 2. Increment count in contacts array state
        setContacts((prevContacts) => {
          const isSenderActive = activeChat && Number(activeChat.id) === senderId;
          const exists = prevContacts.some((c) => Number(c.id) === senderId);

          if (!exists) {
            // New user contacting us - refresh contact list from backend
            fetchContacts();
            return prevContacts;
          }

          return prevContacts.map((contact) => {
            if (Number(contact.id) === senderId) {
              return {
                ...contact,
                unread_count: isSenderActive ? 0 : (Number(contact.unread_count) || 0) + 1
              };
            }
            return contact;
          });
        });

        // 3. Trigger native browser push overlay
        if (Notification.permission === 'granted' && document.hidden) {
          // Look up sender name
          const contact = contacts.find(c => Number(c.id) === senderId);
          const senderName = contact ? contact.display_name : `User ${senderId}`;
          new Notification(senderName, {
            body: msg.content || 'Sent an attachment'
          });
        }
      });

      // Request browser notification permissions
      if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }

      return () => {
        newSocket.disconnect();
      };
    }
  }, [token, currentUser, activeChat, contacts, fetchContacts]);

  const handleLogin = (user, jwtToken) => {
    setToken(jwtToken);
    setCurrentUser(user);
  };

  const handleLogout = () => {
    localStorage.removeItem('whatsapp_token');
    setToken(null);
    setCurrentUser(null);
    if (socket) {
      socket.disconnect();
    }
    setActiveChat(null);
    setContacts([]);
    setOnlineUsers([]);
  };

  const handleProfileUpdate = () => {
    if (token) {
      fetchCurrentUser(token);
      fetchContacts();
    }
  };

  // WebRTC Calling hook
  const webrtc = useWebRTC(socket, currentUser);

  if (token && !currentUser) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.loader} />
        <p style={{ marginTop: '16px', color: 'var(--text-secondary)', fontSize: '14px' }}>Restoring session...</p>
      </div>
    );
  }

  return (
    <div style={styles.appContainer}>
      {!currentUser ? (
        <LoginRegister onLogin={handleLogin} theme={theme} />
      ) : (
        <div style={styles.dashboard}>
          {/* Sidebar */}
          <div className={`sidebar-container ${activeChat ? 'hidden-mobile' : ''}`}>
            <Sidebar
              currentUser={currentUser}
              token={token}
              contacts={contacts}
              setContacts={setContacts}
              activeChat={activeChat}
              setActiveChat={setActiveChat}
              onlineUsers={onlineUsers}
              onLogout={handleLogout}
              onInitiateCall={webrtc.initiateCall}
              fetchContacts={fetchContacts}
              onProfileUpdate={handleProfileUpdate}
              theme={theme}
              toggleTheme={toggleTheme}
            />
          </div>

          {/* Chat Panel */}
          <div className={`chat-container ${!activeChat ? 'hidden-mobile' : ''}`}>
            {activeChat ? (
              <ChatWindow
                activeChat={activeChat}
                token={token}
                socket={socket}
                onlineUsers={onlineUsers}
                onInitiateCall={webrtc.initiateCall}
                onBack={() => setActiveChat(null)}
                theme={theme}
                toggleTheme={toggleTheme}
              />
            ) : (
              <div style={styles.welcomePanel}>
                {/* Animated gradient orb */}
                <div style={styles.welcomeOrb} />
                <div style={styles.welcomeContent}>
                  <div style={styles.welcomeIconRing}>
                    <Zap size={36} style={{ color: '#ffffff' }} />
                  </div>
                  <h2 style={styles.welcomeTitle}>Welcome to Chatify</h2>
                  <p style={styles.welcomeText}>Search for friends to start chatting, or tap a contact to continue a conversation.</p>
                  <div style={styles.badgeRow}>
                    <span style={styles.badge}><MessageSquare size={12} style={{ marginRight: '6px' }} /> Real-time Messages</span>
                    <span style={styles.badge}><PhoneCall size={12} style={{ marginRight: '6px' }} /> HD Voice & Video</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Global call overlay */}
          <CallOverlay
            callState={webrtc.callState}
            callType={webrtc.callType}
            peerName={webrtc.peerName}
            localStream={webrtc.localStream}
            remoteStream={webrtc.remoteStream}
            isMuted={webrtc.isMuted}
            isVideoOff={webrtc.isVideoOff}
            callDuration={webrtc.callDuration}
            onAccept={webrtc.acceptCall}
            onReject={webrtc.rejectCall}
            onEnd={webrtc.endCall}
            onToggleMute={webrtc.toggleMute}
            onToggleVideo={webrtc.toggleVideo}
          />
        </div>
      )}
    </div>
  );
}

const styles = {
  appContainer: {
    height: '100dvh',
    width: '100vw',
    display: 'flex',
    overflow: 'hidden',
    backgroundColor: 'var(--bg-main)'
  },
  loadingContainer: {
    height: '100dvh',
    width: '100vw',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg-main)',
    color: 'var(--text-primary)'
  },
  loader: {
    width: '40px',
    height: '40px',
    border: '3px solid var(--border-subtle)',
    borderTop: '3px solid var(--primary)',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite'
  },
  dashboard: {
    display: 'flex',
    width: '100%',
    height: '100%',
    overflow: 'hidden'
  },
  welcomePanel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 24px',
    textAlign: 'center',
    backgroundColor: 'var(--bg-chat)',
    position: 'relative',
    overflow: 'hidden'
  },
  welcomeOrb: {
    position: 'absolute',
    width: '400px',
    height: '400px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(79,70,229,0.12) 0%, transparent 70%)',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'none'
  },
  welcomeContent: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center'
  },
  welcomeIconRing: {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '24px',
    boxShadow: '0 8px 32px var(--primary-glow)'
  },
  welcomeTitle: {
    fontSize: '26px',
    fontWeight: '700',
    color: 'var(--text-primary)',
    marginBottom: '10px'
  },
  welcomeText: {
    fontSize: '15px',
    color: 'var(--text-secondary)',
    maxWidth: '380px',
    lineHeight: '1.7',
    marginBottom: '32px'
  },
  badgeRow: {
    display: 'flex',
    gap: '12px',
    flexWrap: 'wrap',
    justifyContent: 'center'
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    fontSize: '13px',
    color: 'var(--text-secondary)',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-subtle)',
    padding: '8px 16px',
    borderRadius: 'var(--radius-full)',
    fontWeight: '500'
  }
};
