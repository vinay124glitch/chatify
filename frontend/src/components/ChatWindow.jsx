import React, { useState, useEffect, useRef } from 'react';
import { Phone, Video, Send, Check, CheckCheck, Smile, Paperclip, X, FileText, Plus, Image as ImageIcon } from 'lucide-react';
import EmojiPicker from 'emoji-picker-react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';

export default function ChatWindow({
  activeChat,
  token,
  socket,
  onlineUsers,
  onInitiateCall
}) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isPeerTyping, setIsPeerTyping] = useState(false);

  // View once states
  const [isViewOnce, setIsViewOnce] = useState(false);
  const [viewOnceImage, setViewOnceImage] = useState(null);

  // Attachment states
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [customStickers, setCustomStickers] = useState([]);
  const customStickerInputRef = useRef(null);

  const fetchCustomStickers = async () => {
    try {
      const res = await fetch('http://localhost:5000/users/stickers', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setCustomStickers(data.map(s => s.url));
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchCustomStickers();
  }, [token]);

  const STICKERS = [
    'https://api.dicebear.com/7.x/bottts/svg?seed=happy&backgroundColor=transparent',
    'https://api.dicebear.com/7.x/bottts/svg?seed=love&backgroundColor=transparent',
    'https://api.dicebear.com/7.x/bottts/svg?seed=sad&backgroundColor=transparent',
    'https://api.dicebear.com/7.x/bottts/svg?seed=wow&backgroundColor=transparent',
    'https://api.dicebear.com/7.x/bottts/svg?seed=cool&backgroundColor=transparent',
    'https://api.dicebear.com/7.x/bottts/svg?seed=angry&backgroundColor=transparent',
    'https://api.dicebear.com/7.x/bottts/svg?seed=sleepy&backgroundColor=transparent',
    'https://api.dicebear.com/7.x/bottts/svg?seed=party&backgroundColor=transparent'
  ];

  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const fileInputRef = useRef(null);

  // Load message logs when activeChat updates
  const loadMessageHistory = async () => {
    try {
      const res = await fetch(`http://localhost:5000/users/messages/${activeChat.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setMessages(data);
        // Scroll to bottom
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    } catch (err) {
      console.error('Failed to load message history:', err);
    }
  };

  useEffect(() => {
    if (activeChat) {
      loadMessageHistory();
      handleRemoveFile(); // Clear any unsent attachments when switching chats
      
      // Notify database and contact that we read their messages
      if (socket) {
        socket.emit('mark_read', { senderId: activeChat.id });
      }
    }
  }, [activeChat, socket]);

  // Monitor real-time websocket updates
  useEffect(() => {
    if (!socket || !activeChat) return;

    // Receive message
    const handleReceiveMessage = (msg) => {
      if (Number(msg.sender_id) === Number(activeChat.id)) {
        setMessages((prev) => {
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        socket.emit('mark_read', { senderId: activeChat.id });
        
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 50);
      }
    };

    // Acknowledge message sent from this client
    const handleMessageAck = (msg) => {
      if (Number(msg.receiver_id) === Number(activeChat.id)) {
        setMessages((prev) => {
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 50);
      }
    };

    // Update message status checkmarks
    const handleStatusUpdate = (data) => {
      if (Number(data.receiverId) === Number(activeChat.id)) {
        setMessages((prev) =>
          prev.map((msg) =>
            Number(msg.receiver_id) === Number(activeChat.id)
              ? { ...msg, status: data.status }
              : msg
          )
        );
      }
    };

    // Peer typing indicator status
    const handleTypingStatus = (data) => {
      if (Number(data.senderId) === Number(activeChat.id)) {
        setIsPeerTyping(data.isTyping);
      }
    };

    // View Once opened
    const handleViewOnceOpened = (data) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === data.messageId ? { ...msg, is_opened: 1 } : msg
        )
      );
    };

    socket.on('receive_message', handleReceiveMessage);
    socket.on('message_ack', handleMessageAck);
    socket.on('message_status_update', handleStatusUpdate);
    socket.on('typing_status', handleTypingStatus);
    socket.on('view_once_opened', handleViewOnceOpened);

    return () => {
      socket.off('receive_message', handleReceiveMessage);
      socket.off('message_ack', handleMessageAck);
      socket.off('message_status_update', handleStatusUpdate);
      socket.off('typing_status', handleTypingStatus);
      socket.off('view_once_opened', handleViewOnceOpened);
    };
  }, [socket, activeChat]);

  // Handle key typing triggers
  const handleTyping = () => {
    if (!socket || !activeChat) return;

    socket.emit('typing', { receiverId: activeChat.id, isTyping: true });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    typingTimeoutRef.current = setTimeout(() => {
      socket.emit('typing', { receiverId: activeChat.id, isTyping: false });
    }, 1500);
  };

  // Handle file picker selection
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setSelectedFile(file);

    // Generate object URL preview for images/videos
    if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
      const previewUrl = URL.createObjectURL(file);
      setFilePreview(previewUrl);
    } else {
      setFilePreview(null);
    }
  };

  // Clear selected file
  const handleRemoveFile = () => {
    if (filePreview) {
      URL.revokeObjectURL(filePreview);
    }
    setSelectedFile(null);
    setFilePreview(null);
    setIsViewOnce(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCustomStickerUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      setUploading(true);
      const uniqueName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
      const storageRef = ref(storage, `stickers/${uniqueName}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);

      const saveRes = await fetch('http://localhost:5000/users/stickers', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ url })
      });
      if (saveRes.ok) {
        fetchCustomStickers();
      }
    } catch (err) {
      console.error('Failed to upload custom sticker:', err);
      alert('Failed to upload custom sticker');
    } finally {
      setUploading(false);
      if (customStickerInputRef.current) {
        customStickerInputRef.current.value = '';
      }
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() && !selectedFile) return;
    if (!socket || !activeChat) return;

    let attachmentUrl = null;
    let attachmentType = null;
    let attachmentName = null;

    // 1. If file selected, upload first
    if (selectedFile) {
      setUploading(true);
      try {
        const uniqueName = `${Date.now()}-${selectedFile.name.replace(/[^a-zA-Z0-9.]/g, '_')}`;
        const storageRef = ref(storage, `attachments/${uniqueName}`);
        await uploadBytes(storageRef, selectedFile);
        const downloadUrl = await getDownloadURL(storageRef);

        attachmentUrl = downloadUrl;
        
        const mime = selectedFile.type;
        if (mime.startsWith('image/')) {
          attachmentType = 'image';
        } else if (mime.startsWith('video/')) {
          attachmentType = 'video';
        } else {
          attachmentType = 'document';
        }
        attachmentName = selectedFile.name;
      } catch (err) {
        console.error('Upload failed:', err);
        alert(`Failed to send attachment: ${err.message}`);
        setUploading(false);
        return;
      }
    }

    // 2. Emit WebSocket message
    socket.emit('send_message', {
      receiverId: activeChat.id,
      content: newMessage.trim(),
      attachmentUrl,
      attachmentType,
      attachmentName,
      isViewOnce: isViewOnce && attachmentType === 'image'
    }, (ackMsg) => {
      if (ackMsg) {
        setMessages((prev) => {
          if (prev.some(m => m.id === ackMsg.id)) return prev;
          return [...prev, ackMsg];
        });
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 50);
      }
    });

    // Clear typing indicator
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    socket.emit('typing', { receiverId: activeChat.id, isTyping: false });

    // Reset UI states
    setNewMessage('');
    handleRemoveFile();
    setUploading(false);
    setShowStickers(false);
    setShowEmojiPicker(false);
  };

  const handleSendSticker = (url) => {
    setShowStickers(false);
    if (!socket || !activeChat) return;

    socket.emit('send_message', {
      receiverId: activeChat.id,
      content: '', // no text
      attachmentUrl: url,
      attachmentType: 'sticker',
      attachmentName: 'Sticker'
    }, (ackMsg) => {
      if (ackMsg) {
        setMessages((prev) => {
          if (prev.some(m => m.id === ackMsg.id)) return prev;
          return [...prev, ackMsg];
        });
        setTimeout(() => {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 50);
      }
    });
  };

  // Render message status checkmarks
  const renderStatus = (status) => {
    if (status === 'sent') return <Check size={14} style={{ color: '#94a3b8' }} />;
    if (status === 'delivered') return <CheckCheck size={14} style={{ color: '#94a3b8' }} />;
    if (status === 'read') return <CheckCheck size={14} style={{ color: '#10b981' }} />;
    return null;
  };

  // Format timestamp helper
  const formatTime = (isoString) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return '';
    }
  };

  const isOnline = onlineUsers.includes(Number(activeChat.id));

  return (
    <div style={styles.chatWindow}>
      {/* Top Header */}
      <div style={styles.chatHeader} className="glass-panel">
        <div style={styles.userInfo}>
          <div style={styles.avatarWrapper}>
            <img src={activeChat.avatar_url} alt={activeChat.display_name} style={styles.avatar} />
            <div
              className={`status-indicator ${isOnline ? 'status-online' : 'status-offline'}`}
              style={styles.presenceBadge}
            />
          </div>
          <div style={{ marginLeft: '12px' }}>
            <h4 style={styles.displayName}>{activeChat.display_name}</h4>
            <span style={{
              ...styles.statusText,
              color: isPeerTyping ? '#10b981' : '#94a3b8'
            }}>
              {isPeerTyping ? 'typing...' : isOnline ? 'online' : 'offline'}
            </span>
          </div>
        </div>

        <div style={styles.headerActions}>
          <button
            onClick={() => onInitiateCall(activeChat.id, activeChat.display_name, 'audio')}
            style={styles.actionBtn}
            className="glass-btn"
            title="Voice Call"
            disabled={uploading}
          >
            <Phone size={18} />
          </button>
          <button
            onClick={() => onInitiateCall(activeChat.id, activeChat.display_name, 'video')}
            style={styles.actionBtn}
            className="glass-btn"
            title="Video Call"
            disabled={uploading}
          >
            <Video size={18} />
          </button>
        </div>
      </div>

      {/* Message Feed Area */}
      <div style={styles.messageFeed}>
        {messages.length === 0 ? (
          <div style={styles.emptyState}>
            <div style={styles.welcomeCircle}>
              <Smile size={32} style={{ color: '#10b981' }} />
            </div>
            <p style={{ fontWeight: '500', color: '#ffffff' }}>Say Hello!</p>
            <span style={{ fontSize: '12px', color: '#64748b' }}>Start a fresh secure chat with {activeChat.display_name}</span>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isMe = Number(msg.sender_id) !== Number(activeChat.id);
            const isSticker = msg.attachment_type === 'sticker';
            return (
              <div
                key={msg.id || index}
                style={{
                  ...styles.msgRow,
                  justifyContent: isMe ? 'flex-end' : 'flex-start'
                }}
              >
                <div
                  style={{
                    ...styles.msgBubble,
                    backgroundColor: isSticker ? 'transparent' : (isMe ? 'var(--msg-sent)' : 'var(--msg-received)'),
                    borderTopRightRadius: isMe ? '2px' : '12px',
                    borderTopLeftRadius: isMe ? '12px' : '2px',
                    border: isSticker ? 'none' : (isMe ? '1px solid rgba(16, 185, 129, 0.2)' : '1px solid var(--border-glass)'),
                    boxShadow: isSticker ? 'none' : '0 2px 5px rgba(0,0,0,0.15)',
                    padding: isSticker ? '0' : '10px 14px 6px 14px'
                  }}
                >
                  {msg.attachment_url && (
                    <div style={styles.attachmentContainer}>
                      {msg.attachment_type === 'sticker' && (
                        <img
                          src={msg.attachment_url.startsWith('http') ? msg.attachment_url : `http://localhost:5000${msg.attachment_url}`}
                          alt="sticker"
                          style={{ width: '120px', height: '120px', display: 'block' }}
                        />
                      )}

                      {msg.attachment_type === 'image' && (
                        msg.is_view_once ? (
                          <div 
                            style={{ 
                              ...styles.viewOnceBubble, 
                              opacity: msg.is_opened ? 0.5 : 1, 
                              cursor: (!isMe && !msg.is_opened) ? 'pointer' : 'default' 
                            }}
                            onClick={() => {
                              if (!isMe && !msg.is_opened) {
                                const fullUrl = msg.attachment_url.startsWith('http') ? msg.attachment_url : `http://localhost:5000${msg.attachment_url}`;
                                setViewOnceImage({ id: msg.id, url: fullUrl });
                              }
                            }}
                          >
                            <ImageIcon size={20} style={{ marginRight: '8px' }} />
                            <span style={{ fontWeight: '500' }}>
                              {msg.is_opened ? 'Opened' : 'Photo'}
                            </span>
                          </div>
                        ) : (
                          <img
                            src={msg.attachment_url.startsWith('http') ? msg.attachment_url : `http://localhost:5000${msg.attachment_url}`}
                            alt={msg.attachment_name}
                            style={styles.bubbleImage}
                            onClick={() => {
                              const fullUrl = msg.attachment_url.startsWith('http') ? msg.attachment_url : `http://localhost:5000${msg.attachment_url}`;
                              window.open(fullUrl, '_blank');
                            }}
                          />
                        )
                      )}
                      
                      {msg.attachment_type === 'video' && (
                        <video
                          src={msg.attachment_url.startsWith('http') ? msg.attachment_url : `http://localhost:5000${msg.attachment_url}`}
                          controls
                          style={styles.bubbleVideo}
                        />
                      )}

                      {msg.attachment_type === 'document' && (
                        <a
                          href={msg.attachment_url.startsWith('http') ? msg.attachment_url : `http://localhost:5000${msg.attachment_url}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={styles.bubbleDoc}
                        >
                          <FileText size={24} style={{ marginRight: '8px', color: '#10b981' }} />
                          <div style={{ flex: 1, overflow: 'hidden' }}>
                            <div style={styles.docName} className="truncate-text">
                              {msg.attachment_name}
                            </div>
                            <span style={styles.docSize}>Download document</span>
                          </div>
                        </a>
                      )}
                    </div>
                  )}

                  {/* Message content text */}
                  {msg.content && msg.content.trim() !== '' && (
                    <p style={styles.msgText}>{msg.content}</p>
                  )}

                  <div style={styles.msgMeta}>
                    <span style={styles.msgTime}>{formatTime(msg.created_at)}</span>
                    {isMe && <span style={styles.msgStatus}>{renderStatus(msg.status)}</span>}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message Input & File preview bar */}
      <div style={styles.bottomBarContainer} className="glass-panel">
        
        {/* Selected file preview tray */}
        {selectedFile && (
          <div style={styles.previewTray}>
            {filePreview ? (
              selectedFile.type.startsWith('image/') ? (
                <img src={filePreview} alt="upload preview" style={styles.trayThumbnail} />
              ) : (
                <video src={filePreview} style={styles.trayThumbnail} muted />
              )
            ) : (
              <div style={styles.trayDocIcon}>
                <FileText size={24} style={{ color: '#10b981' }} />
              </div>
            )}
            <div style={styles.trayFileInfo}>
              <span style={styles.trayFileName} className="truncate-text">{selectedFile.name}</span>
              <span style={styles.trayFileSize}>{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</span>
            </div>
            {selectedFile.type.startsWith('image/') && (
              <button
                type="button"
                onClick={() => setIsViewOnce(!isViewOnce)}
                style={{
                  ...styles.viewOnceToggleBtn,
                  background: isViewOnce ? '#10b981' : 'rgba(255,255,255,0.1)',
                  color: isViewOnce ? '#fff' : '#94a3b8'
                }}
                title="View Once"
              >
                1
              </button>
            )}
            <button onClick={handleRemoveFile} style={styles.trayRemoveBtn} disabled={uploading}>
              <X size={16} />
            </button>
          </div>
        )}

        {/* Form Input fields */}
        <form onSubmit={handleSendMessage} style={styles.inputContainer}>
          {/* Emoji Picker Trigger */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setShowEmojiPicker(!showEmojiPicker)}
              style={{ ...styles.clipBtn, color: '#f59e0b' }}
              className="glass-btn"
              title="Add Emoji"
              disabled={uploading}
            >
              <Smile size={18} />
            </button>
            {showEmojiPicker && (
              <div style={styles.emojiPickerOverlay}>
                <EmojiPicker
                  onEmojiClick={(emojiData) => setNewMessage(prev => prev + emojiData.emoji)}
                  theme="dark"
                  searchDisabled={false}
                />
              </div>
            )}
          </div>

          {/* Sticker Picker Trigger */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              onClick={() => setShowStickers(!showStickers)}
              style={styles.clipBtn}
              className="glass-btn"
              title="Send Sticker"
              disabled={uploading}
            >
              <ImageIcon size={18} />
            </button>
            
            {showStickers && (
              <div style={styles.stickerPickerOverlay} className="glass-panel">
                <div style={styles.stickerPickerHeader}>
                  <span style={{ fontSize: '13px', fontWeight: '600' }}>Stickers</span>
                  <button type="button" onClick={() => setShowStickers(false)} style={styles.trayRemoveBtn}>
                    <X size={14} />
                  </button>
                </div>
                <div style={styles.stickerGrid}>
                  {/* Upload Sticker Button */}
                  <div 
                    style={styles.addStickerThumb} 
                    onClick={() => customStickerInputRef.current?.click()}
                    className="clickable"
                  >
                    <Plus size={24} style={{ color: '#10b981' }} />
                  </div>
                  <input
                    type="file"
                    ref={customStickerInputRef}
                    onChange={handleCustomStickerUpload}
                    style={{ display: 'none' }}
                    accept="image/*"
                  />
                  
                  {/* Custom Stickers */}
                  {customStickers.map((url, i) => (
                    <img
                      key={`custom-${i}`}
                      src={`http://localhost:5000${url}`}
                      alt={`custom-sticker-${i}`}
                      style={styles.stickerThumb}
                      onClick={() => handleSendSticker(`http://localhost:5000${url}`)}
                      className="clickable"
                    />
                  ))}

                  {/* Pre-defined Stickers */}
                  {STICKERS.map((url, i) => (
                    <img
                      key={`def-${i}`}
                      src={url}
                      alt={`sticker-${i}`}
                      style={styles.stickerThumb}
                      onClick={() => handleSendSticker(url)}
                      className="clickable"
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* File Picker trigger */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            style={styles.clipBtn}
            className="glass-btn"
            title="Attach file"
            disabled={uploading}
          >
            <Paperclip size={18} />
          </button>

          {/* Hidden File Picker Input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />

          <input
            type="text"
            className="glass-input"
            placeholder={uploading ? "Uploading attachment..." : "Type a message..."}
            value={newMessage}
            onChange={(e) => {
              setNewMessage(e.target.value);
              handleTyping();
            }}
            style={styles.inputField}
            disabled={uploading}
          />
          
          <button
            type="submit"
            style={{
              ...styles.sendBtn,
              background: (!newMessage.trim() && !selectedFile) || uploading ? 'rgba(255, 255, 255, 0.05)' : '#10b981',
              color: (!newMessage.trim() && !selectedFile) || uploading ? '#64748b' : '#ffffff'
            }}
            className="glass-btn"
            disabled={(!newMessage.trim() && !selectedFile) || uploading}
          >
            <Send size={18} />
          </button>
        </form>
      </div>
      
      {/* View Once Image Overlay */}
      {viewOnceImage && (
        <div style={styles.viewOnceOverlay}>
          <div style={styles.viewOnceHeader}>
            <span style={{ color: '#fff', fontSize: '14px', fontWeight: 'bold' }}>View Once Photo</span>
            <button 
              onClick={() => {
                socket.emit('open_view_once', { messageId: viewOnceImage.id, senderId: activeChat.id });
                setMessages(prev => prev.map(m => m.id === viewOnceImage.id ? { ...m, is_opened: 1 } : m));
                setViewOnceImage(null);
              }} 
              style={styles.trayRemoveBtn}
            >
              <X size={24} />
            </button>
          </div>
          <img src={viewOnceImage.url} alt="View Once" style={styles.viewOnceFullImage} />
        </div>
      )}
    </div>
  );
}

const styles = {
  chatWindow: {
    flex: 1,
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--bg-chat)',
    position: 'relative'
  },
  chatHeader: {
    height: '76px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 24px',
    borderBottom: '1px solid var(--border-glass)',
    backgroundColor: 'rgba(19, 26, 38, 0.6)',
    zIndex: 10
  },
  userInfo: {
    display: 'flex',
    alignItems: 'center'
  },
  avatarWrapper: {
    position: 'relative',
    display: 'inline-block'
  },
  avatar: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    objectFit: 'cover',
    background: '#1e293b'
  },
  presenceBadge: {
    position: 'absolute',
    bottom: '0px',
    right: '0px',
    border: '2px solid #131a26',
    width: '10px',
    height: '10px'
  },
  displayName: {
    fontSize: '15px',
    fontWeight: '600',
    color: '#ffffff'
  },
  statusText: {
    fontSize: '12px',
    fontWeight: '400',
    display: 'block',
    marginTop: '1px'
  },
  headerActions: {
    display: 'flex',
    gap: '12px'
  },
  actionBtn: {
    width: '38px',
    height: '38px',
    borderRadius: '50%',
    color: '#34d399'
  },
  messageFeed: {
    flex: 1,
    overflowY: 'auto',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    background: 'radial-gradient(circle at 50% 50%, #0e131f 0%, #07090e 100%)'
  },
  emptyState: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#94a3b8'
  },
  welcomeCircle: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    border: '1px solid rgba(16, 185, 129, 0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '16px'
  },
  msgRow: {
    display: 'flex',
    width: '100%'
  },
  msgBubble: {
    maxWidth: '65%',
    padding: '10px 14px 6px 14px',
    borderRadius: '12px',
    boxShadow: '0 2px 5px rgba(0,0,0,0.15)',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  },
  attachmentContainer: {
    width: '100%',
    marginTop: '2px',
    marginBottom: '4px'
  },
  bubbleImage: {
    maxWidth: '100%',
    maxHeight: '260px',
    borderRadius: '8px',
    cursor: 'pointer',
    objectFit: 'cover',
    border: '1px solid rgba(255, 255, 255, 0.05)',
    display: 'block'
  },
  bubbleVideo: {
    maxWidth: '100%',
    maxHeight: '260px',
    borderRadius: '8px',
    display: 'block',
    backgroundColor: '#000000',
    border: '1px solid rgba(255, 255, 255, 0.05)'
  },
  bubbleDoc: {
    display: 'flex',
    alignItems: 'center',
    background: 'rgba(0, 0, 0, 0.2)',
    border: '1px solid var(--border-glass)',
    borderRadius: '8px',
    padding: '10px 14px',
    color: '#34d399',
    textDecoration: 'none',
    transition: 'background 0.2s'
  },
  docName: {
    fontSize: '13.5px',
    fontWeight: '500',
    color: '#ffffff'
  },
  docSize: {
    fontSize: '11px',
    color: '#94a3b8'
  },
  viewOnceToggleBtn: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '13px',
    fontWeight: 'bold',
    cursor: 'pointer',
    marginRight: '8px',
    transition: 'all 0.2s'
  },
  viewOnceBubble: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 16px',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: '12px',
    color: '#10b981',
    userSelect: 'none',
    transition: 'opacity 0.2s'
  },
  viewOnceOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#000',
    zIndex: 100,
    display: 'flex',
    flexDirection: 'column'
  },
  viewOnceHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px 24px',
    background: 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 100%)',
    position: 'absolute',
    top: 0, left: 0, right: 0,
    zIndex: 101
  },
  viewOnceFullImage: {
    flex: 1,
    objectFit: 'contain',
    width: '100%',
    height: '100%',
    backgroundColor: '#000'
  },
  msgText: {
    fontSize: '14.5px',
    color: '#f8fafc',
    wordBreak: 'break-word',
    lineHeight: '1.4'
  },
  msgMeta: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '4px',
    alignSelf: 'flex-end'
  },
  msgTime: {
    fontSize: '10px',
    color: '#94a3b8'
  },
  msgStatus: {
    display: 'flex',
    alignItems: 'center'
  },
  bottomBarContainer: {
    borderTop: '1px solid var(--border-glass)',
    backgroundColor: 'rgba(19, 26, 38, 0.8)',
    display: 'flex',
    flexDirection: 'column'
  },
  previewTray: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 24px',
    background: 'rgba(0, 0, 0, 0.25)',
    borderBottom: '1px solid var(--border-glass)',
    gap: '12px'
  },
  trayThumbnail: {
    width: '46px',
    height: '46px',
    borderRadius: '6px',
    objectFit: 'cover',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    backgroundColor: '#000000'
  },
  trayDocIcon: {
    width: '46px',
    height: '46px',
    borderRadius: '6px',
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    border: '1px solid rgba(16, 185, 129, 0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  trayFileInfo: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden'
  },
  trayFileName: {
    fontSize: '13.5px',
    fontWeight: '500',
    color: '#ffffff'
  },
  trayFileSize: {
    fontSize: '11px',
    color: '#94a3b8'
  },
  trayRemoveBtn: {
    background: 'rgba(255, 255, 255, 0.05)',
    border: 'none',
    color: '#ef4444',
    padding: '6px',
    borderRadius: '50%',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  inputContainer: {
    padding: '16px 24px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px'
  },
  clipBtn: {
    width: '42px',
    height: '42px',
    borderRadius: '50%',
    color: '#34d399'
  },
  inputField: {
    flex: 1,
    borderRadius: '24px',
    padding: '12px 20px',
    fontSize: '14.5px'
  },
  sendBtn: {
    width: '42px',
    height: '42px',
    borderRadius: '50%',
    border: 'none'
  },
  emojiPickerOverlay: {
    position: 'absolute',
    bottom: '50px',
    left: '0',
    zIndex: 60,
    boxShadow: '0 -4px 15px rgba(0,0,0,0.5)',
    borderRadius: '8px',
    overflow: 'hidden'
  },
  stickerPickerOverlay: {
    position: 'absolute',
    bottom: '50px',
    left: '0',
    width: '280px',
    padding: '12px',
    borderRadius: '12px',
    boxShadow: '0 -4px 15px rgba(0,0,0,0.3)',
    zIndex: 50,
    border: '1px solid var(--border-glass)'
  },
  stickerPickerHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '10px',
    paddingBottom: '8px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
    color: '#ffffff'
  },
  stickerGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '8px',
    maxHeight: '180px',
    overflowY: 'auto'
  },
  stickerThumb: {
    width: '100%',
    height: 'auto',
    cursor: 'pointer',
    borderRadius: '8px',
    padding: '4px',
    transition: 'transform 0.2s, background 0.2s',
    '&:hover': {
      transform: 'scale(1.1)',
      backgroundColor: 'rgba(255, 255, 255, 0.1)'
    }
  },
  addStickerThumb: {
    width: '100%',
    aspectRatio: '1/1',
    cursor: 'pointer',
    borderRadius: '8px',
    border: '1px dashed rgba(16, 185, 129, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
    transition: 'background 0.2s',
    '&:hover': {
      backgroundColor: 'rgba(16, 185, 129, 0.15)'
    }
  }
};
