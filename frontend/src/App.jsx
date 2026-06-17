import React, { useState, useEffect, useCallback } from 'react';
import io from 'socket.io-client';
import Sidebar from './components/Sidebar';
import ChatWindow from './components/ChatWindow';
import LoginRegister from './components/LoginRegister';
import CallOverlay from './components/CallOverlay';
import useWebRTC from './hooks/useWebRTC';
import { Shield, MessageSquare, PhoneCall } from 'lucide-react';

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('whatsapp_token'));
  const [currentUser, setCurrentUser] = useState(null);
  const [socket, setSocket] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);

  // Fetch current user details on start
  const fetchCurrentUser = useCallback(async (authToken) => {
    try {
      const res = await fetch('http://localhost:5000/auth/me', {
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
      const res = await fetch('http://localhost:5000/users/contacts', {
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
      const newSocket = io('http://localhost:5000', {
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
        <p style={{ marginTop: '16px', color: '#94a3b8' }}>Restoring secure session...</p>
      </div>
    );
  }

  return (
    <div style={styles.appContainer}>
      {!currentUser ? (
        <LoginRegister onLogin={handleLogin} />
      ) : (
        <div style={styles.dashboard}>
          {/* Sidebar controls */}
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
          />

          {/* Chat Panel / Main body */}
          {activeChat ? (
            <ChatWindow
              activeChat={activeChat}
              token={token}
              socket={socket}
              onlineUsers={onlineUsers}
              onInitiateCall={webrtc.initiateCall}
            />
          ) : (
            <div style={styles.welcomePanel}>
              <div style={styles.welcomeIconRing}>
                <Shield size={44} style={{ color: '#10b981' }} />
              </div>
              <h2 style={styles.welcomeTitle}>HeroChat Dashboard</h2>
              <p style={styles.welcomeText}>Select an active contact or search above to initiate a secure encrypted message or peer-to-peer call.</p>
              <div style={styles.badgeRow}>
                <span style={styles.badge}><MessageSquare size={12} style={{ marginRight: '4px' }} /> WebSocket Messages</span>
                <span style={styles.badge}><PhoneCall size={12} style={{ marginRight: '4px' }} /> WebRTC P2P Call</span>
              </div>
            </div>
          )}

          {/* Global calling UI overlay */}
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
    height: '100vh',
    width: '100vw',
    display: 'flex',
    overflow: 'hidden',
    backgroundColor: 'var(--bg-main)'
  },
  loadingContainer: {
    height: '100vh',
    width: '100vw',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0b0f19',
    color: '#ffffff'
  },
  loader: {
    width: '40px',
    height: '40px',
    border: '3px solid rgba(16, 185, 129, 0.2)',
    borderTop: '3px solid #10b981',
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
    padding: '40px',
    textAlign: 'center',
    backgroundColor: 'var(--bg-chat)',
    background: 'radial-gradient(circle at 50% 50%, #0e131f 0%, #07090e 100%)'
  },
  welcomeIconRing: {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    border: '1px solid rgba(16, 185, 129, 0.25)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '24px',
    boxShadow: '0 0 20px rgba(16, 185, 129, 0.1)'
  },
  welcomeTitle: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#ffffff',
    marginBottom: '8px'
  },
  welcomeText: {
    fontSize: '14px',
    color: '#94a3b8',
    maxWidth: '460px',
    lineHeight: '1.6',
    marginBottom: '28px'
  },
  badgeRow: {
    display: 'flex',
    gap: '16px'
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    fontSize: '12px',
    color: '#cbd5e1',
    background: 'rgba(255, 255, 255, 0.05)',
    border: '1px solid var(--border-glass)',
    padding: '6px 14px',
    borderRadius: '20px'
  }
};
