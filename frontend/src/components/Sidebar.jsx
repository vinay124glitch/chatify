import React, { useState, useEffect, useRef } from 'react';
import { Search, LogOut, MessageSquare, Phone, UserPlus, PhoneCall, Video, Camera, Plus, X, Globe, Eye, Image, Sun, Moon } from 'lucide-react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';
import { API_BASE_URL } from '../config';

const compressImage = (file, maxWidth = 800, maxHeight = 800, quality = 0.7) => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxHeight) {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const base64 = canvas.toDataURL('image/jpeg', quality);
        resolve(base64);
      };
      img.onerror = () => {
        resolve(null);
      };
    };
    reader.onerror = () => resolve(null);
  });
};

const readFileAsBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = (error) => reject(error);
  });
};

const getMediaUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('http') || url.startsWith('data:')) return url;
  return `${API_BASE_URL}${url}`;
};

// Fallback avatar generator using UI Avatars
const DEFAULT_AVATAR = 'https://ui-avatars.com/api/?background=10b981&color=fff&bold=true&size=200&name=';
const getAvatarUrl = (avatarUrl, displayName) => {
  if (avatarUrl && avatarUrl.trim() !== '') return avatarUrl;
  return `${DEFAULT_AVATAR}${encodeURIComponent(displayName || 'U')}`;
};

// Upload a base64/blob image to Firebase Storage and return the download URL
const uploadImageToFirebase = async (base64String, path) => {
  try {
    const response = await fetch(base64String);
    const blob = await response.blob();
    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, blob);
    const downloadURL = await getDownloadURL(storageRef);
    return downloadURL;
  } catch (err) {
    console.error('Firebase upload failed:', err);
    throw err;
  }
};

export default function Sidebar({
  currentUser,
  token,
  contacts,
  setContacts,
  activeChat,
  setActiveChat,
  onlineUsers,
  onLogout,
  onInitiateCall,
  fetchContacts,
  onProfileUpdate,
  theme,
  toggleTheme
}) {
  const [activeTab, setActiveTab] = useState('chats'); // 'chats', 'calls', or 'status'
  
  // Search
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  // History & Lists
  const [callLogs, setCallLogs] = useState([]);
  const [statusFeed, setStatusFeed] = useState([]);

  // Modals & Panels
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isStatusCreatorOpen, setIsStatusCreatorOpen] = useState(false);
  const [activeStory, setActiveStory] = useState(null);
  const [storyProgress, setStoryProgress] = useState(0);

  // Profile Form States
  const [profileName, setProfileName] = useState(currentUser.display_name);
  const [profileAbout, setProfileAbout] = useState(currentUser.about || 'Hey there! I am using Chatify.');
  const [profileAvatar, setProfileAvatar] = useState(currentUser.avatar_url);
  const [profileLoading, setProfileLoading] = useState(false);

  // Status Creator States
  const [statusType, setStatusType] = useState('text'); // 'text' or 'image'
  const [statusText, setStatusText] = useState('');
  const [statusBgGradient, setStatusBgGradient] = useState('linear-gradient(135deg, #10b981 0%, #059669 100%)');
  const [statusFile, setStatusFile] = useState(null);
  const [statusPreview, setStatusPreview] = useState(null);
  const [statusLoading, setStatusLoading] = useState(false);

  const fileInputRef = useRef(null);
  const statusFileInputRef = useRef(null);
  const storyTimerRef = useRef(null);

  // Predefined gorgeous background gradients for status text updates
  const statusGradients = [
    'linear-gradient(135deg, #10b981 0%, #059669 100%)', // Emerald
    'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', // Indigo
    'linear-gradient(135deg, #ec4899 0%, #db2777 100%)', // Pink
    'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)', // Yellow
    'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', // Red
    'linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%)'  // Violet
  ];

  // Fetch calls logs
  const fetchCallLogs = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/users/calls`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setCallLogs(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Fetch status updates
  const fetchStatusFeed = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/users/status`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setStatusFeed(data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Sync form states with currentUser prop updates
  useEffect(() => {
    if (currentUser) {
      setProfileName(currentUser.display_name || '');
      setProfileAbout(currentUser.about || 'Hey there! I am using Chatify.');
      setProfileAvatar(currentUser.avatar_url || '');
    }
  }, [currentUser]);

  // Re-run triggers on tab switches
  useEffect(() => {
    if (activeTab === 'calls') {
      fetchCallLogs();
    } else if (activeTab === 'status') {
      fetchStatusFeed();
    }
  }, [activeTab]);

  // Handle debounce search
  useEffect(() => {
    const delayDebounce = setTimeout(async () => {
      if (searchQuery.trim().length > 0) {
        setIsSearching(true);
        try {
          const res = await fetch(`${API_BASE_URL}/users/search?q=${encodeURIComponent(searchQuery)}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const data = await res.json();
          if (res.ok) {
            setSearchResults(data);
          }
        } catch (err) {
          console.error(err);
        }
      } else {
        setSearchResults([]);
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [searchQuery, token]);

  // Status Stories Progress Bar logic
  useEffect(() => {
    if (!activeStory) return;

    setStoryProgress(0);
    const duration = 5000; // 5 seconds per story
    const startTime = Date.now();

    storyTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min((elapsed / duration) * 100, 100);
      setStoryProgress(pct);

      if (elapsed >= duration) {
        // Auto close after 5 seconds
        closeStory();
      }
    }, 30);

    return () => {
      if (storyTimerRef.current) clearInterval(storyTimerRef.current);
    };
  }, [activeStory]);

  const closeStory = () => {
    if (storyTimerRef.current) clearInterval(storyTimerRef.current);
    setActiveStory(null);
    setStoryProgress(0);
  };

  // Select a user from search results
  const handleSelectSearchResult = async (user) => {
    // Always open the chat immediately and clear search query
    setActiveChat(user);
    setSearchQuery('');
    setSearchResults([]);

    try {
      const res = await fetch(`${API_BASE_URL}/users/contacts/add`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ contact_id: user.id })
      });
      
      if (res.ok) {
        await fetchContacts();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Upload profile photo
  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setProfileLoading(true);
    try {
      const base64 = await compressImage(file, 400, 400, 0.6);
      if (!base64) {
        throw new Error('Failed to compress avatar image');
      }
      // Upload to Firebase Storage and get a permanent URL
      const firebaseUrl = await uploadImageToFirebase(
        base64,
        `avatars/${currentUser.id}_${Date.now()}.jpg`
      );
      setProfileAvatar(firebaseUrl);
    } catch (err) {
      alert(`Avatar upload failed: ${err.message}`);
    } finally {
      setProfileLoading(false);
    }
  };

  // Save profile changes
  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!profileName.trim()) return;

    setProfileLoading(true);

    // Abort the request after 12 seconds to prevent infinite "Saving..." state
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
      const res = await fetch(`${API_BASE_URL}/users/profile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          display_name: profileName.trim(),
          about: profileAbout.trim(),
          avatar_url: profileAvatar
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        setIsProfileOpen(false);
        onProfileUpdate(); // Reload user state
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Failed to update profile. Please try again.');
      }
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        alert('Request timed out. The server took too long to respond. Please try again.');
      } else {
        alert('Network error. Please check your connection and try again.');
      }
      console.error('Profile save error:', err);
    } finally {
      setProfileLoading(false);
    }
  };

  // Handle status file input picker
  const handleStatusFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setStatusFile(file);
    setStatusPreview(URL.createObjectURL(file));
    setStatusType('image');
  };

  // Post new status
  const handlePostStatus = async (e) => {
    e.preventDefault();
    if (statusType === 'text' && !statusText.trim()) return;
    if (statusType === 'image' && !statusFile) return;

    setStatusLoading(true);
    let mediaUrl = null;

    try {
      // 1. If image, compress and upload to Firebase Storage
      if (statusType === 'image' && statusFile) {
        const base64 = await compressImage(statusFile, 800, 800, 0.7);
        if (!base64) {
          throw new Error('Failed to compress status image');
        }
        mediaUrl = await uploadImageToFirebase(
          base64,
          `statuses/${currentUser.id}_${Date.now()}.jpg`
        );
      }

      // 2. Publish status details
      const payload = {
        type: statusType,
        content: statusType === 'text' ? statusText.trim() : statusText.trim(), // caption
        media_url: statusType === 'image' ? mediaUrl : statusBgGradient // Use media_url for gradient styles if text!
      };

      const res = await fetch(`${API_BASE_URL}/users/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setIsStatusCreatorOpen(false);
        setStatusText('');
        setStatusFile(null);
        if (statusPreview) URL.revokeObjectURL(statusPreview);
        setStatusPreview(null);
        setStatusType('text');
        fetchStatusFeed(); // Reload feeds
      } else {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Unknown error publishing status');
      }
    } catch (err) {
      alert(`Failed to post status: ${err.message}`);
    } finally {
      setStatusLoading(false);
    }
  };

  // Format call logs duration
  const formatDuration = (sec) => {
    if (!sec) return '0s';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  // Group status feed by user
  const groupedStatuses = statusFeed.reduce((acc, current) => {
    const userId = current.user_id;
    if (!acc[userId]) {
      acc[userId] = {
        userId,
        display_name: current.display_name,
        avatar_url: current.avatar_url,
        username: current.username,
        stories: []
      };
    }
    acc[userId].stories.push(current);
    return acc;
  }, {});

  const statusUserGroups = Object.values(groupedStatuses);

  // Get own latest status if any
  const ownGroup = groupedStatuses[currentUser.id];

  return (
    <div style={styles.sidebar} className="glass-panel">
      {/* Profile Header */}
      <div style={styles.profileHeader}>
        <div style={styles.avatarWrapper} onClick={() => setIsProfileOpen(true)} className="clickable" title="Edit Profile">
          <img src={getAvatarUrl(currentUser.avatar_url, currentUser.display_name)} alt={currentUser.display_name} style={styles.avatar} />
          <div style={styles.editAvatarIconOverlay}>
            <Camera size={12} style={{ color: '#ffffff' }} />
          </div>
        </div>
        <div style={styles.profileInfo} onClick={() => setIsProfileOpen(true)} className="clickable">
          <h4 style={styles.displayName} className="truncate-text">{currentUser.display_name}</h4>
          <span style={styles.username} className="truncate-text">{currentUser.about || 'Available'}</span>
        </div>
        <button onClick={onLogout} style={styles.logoutBtn} className="glass-btn" title="Logout">
          <LogOut size={16} />
        </button>
      </div>

      {/* Search Bar */}
      <div style={styles.searchContainer}>
        <div style={styles.searchBar}>
          <Search size={16} style={styles.searchIcon} />
          <input
            type="text"
            placeholder="Search users to chat..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={styles.searchInput}
          />
        </div>
      </div>

      {/* Search results overlay dropdown */}
      {searchQuery.trim().length > 0 && (
        <div style={styles.searchResultsPanel} className="glass-panel">
          <div style={styles.searchPanelHeader}>Search Results</div>
          {searchResults.length === 0 ? (
            <div style={styles.noResults}>No users found</div>
          ) : (
            searchResults.map(user => (
              <div
                key={user.id}
                style={styles.searchResultRow}
                onClick={() => handleSelectSearchResult(user)}
                className="clickable"
              >
                <img src={getAvatarUrl(user.avatar_url, user.display_name)} alt={user.display_name} style={styles.smallAvatar} />
                <div style={{ flex: 1 }}>
                  <div style={styles.searchResultName} className="truncate-text">{user.display_name}</div>
                  <div style={styles.searchResultUsername}>@{user.username}</div>
                </div>
                <UserPlus size={16} style={{ color: '#10b981' }} />
              </div>
            ))
          )}
        </div>
      )}

      {/* Tabs list Switcher */}
      <div style={styles.tabsContainer}>
        <button
          style={{
            ...styles.tabBtn,
            borderBottom: activeTab === 'chats' ? '2px solid #10b981' : '2px solid transparent',
            color: activeTab === 'chats' ? '#ffffff' : '#94a3b8'
          }}
          onClick={() => setActiveTab('chats')}
        >
          <MessageSquare size={15} style={{ marginRight: '4px' }} />
          Chats
        </button>
        <button
          style={{
            ...styles.tabBtn,
            borderBottom: activeTab === 'status' ? '2px solid #10b981' : '2px solid transparent',
            color: activeTab === 'status' ? '#ffffff' : '#94a3b8'
          }}
          onClick={() => setActiveTab('status')}
        >
          <Globe size={15} style={{ marginRight: '4px' }} />
          Status
        </button>
        <button
          style={{
            ...styles.tabBtn,
            borderBottom: activeTab === 'calls' ? '2px solid #10b981' : '2px solid transparent',
            color: activeTab === 'calls' ? '#ffffff' : '#94a3b8'
          }}
          onClick={() => setActiveTab('calls')}
        >
          <Phone size={15} style={{ marginRight: '4px' }} />
          Calls
        </button>
      </div>

      {/* Main List Box */}
      <div style={styles.listContainer}>
        {/* A. CHATS TAB */}
        {activeTab === 'chats' && (
          contacts.length === 0 ? (
            <div style={styles.emptyState}>
              <MessageSquare size={36} style={{ opacity: 0.3, marginBottom: '8px' }} />
              <p>No active chats</p>
              <span style={{ fontSize: '12px', color: '#64748b' }}>Search above to lookup contacts</span>
            </div>
          ) : (
            contacts.map(contact => {
              const isOnline = onlineUsers.includes(Number(contact.id));
              const isActive = activeChat && activeChat.id === contact.id;
              const unreadCount = Number(contact.unread_count) || 0;

              return (
                <div
                  key={contact.id}
                  style={{
                    ...styles.contactItem,
                    background: isActive ? 'rgba(255, 255, 255, 0.06)' : 'transparent'
                  }}
                  onClick={() => setActiveChat(contact)}
                  className="clickable"
                >
                  <div style={styles.avatarWrapper}>
                    <img src={getAvatarUrl(contact.avatar_url, contact.display_name)} alt={contact.display_name} style={styles.avatar} />
                    <div
                      className={`status-indicator ${isOnline ? 'status-online' : 'status-offline'}`}
                      style={styles.presenceIndicator}
                    />
                  </div>
                  <div style={styles.contactDetails}>
                    <div style={styles.contactNameRow}>
                      <span style={styles.contactName} className="truncate-text">{contact.display_name}</span>
                      {unreadCount > 0 && (
                        <div style={styles.unreadBadge}>{unreadCount}</div>
                      )}
                    </div>
                    <span style={styles.contactUsername} className="truncate-text">{contact.about || 'Available'}</span>
                  </div>
                </div>
              );
            })
          )
        )}

        {/* B. STATUS TAB */}
        {activeTab === 'status' && (
          <div style={styles.statusTabContent}>
            {/* My Status header card */}
            <div style={styles.statusHeaderCard} className="glass-panel">
              <div style={styles.statusAvatarWrapper}>
                {ownGroup ? (
                  <div
                    style={styles.statusRingGreen}
                    onClick={() => setActiveStory(ownGroup.stories[0])}
                    className="clickable"
                  >
                    <img src={getAvatarUrl(currentUser.avatar_url, currentUser.display_name)} alt="My Status" style={styles.statusAvatarImg} />
                  </div>
                ) : (
                  <img src={getAvatarUrl(currentUser.avatar_url, currentUser.display_name)} alt="My Status" style={styles.statusAvatarImgNoRing} />
                )}
                <button
                  onClick={() => setIsStatusCreatorOpen(true)}
                  style={styles.addStatusBadgeBtn}
                  title="Add Status Update"
                >
                  <Plus size={14} style={{ color: '#ffffff' }} />
                </button>
              </div>
              <div style={{ flex: 1, marginLeft: '12px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: '600' }}>My Status</h4>
                <p style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                  {ownGroup ? 'Tap to view your latest update' : 'Tap plus to share a status story'}
                </p>
              </div>
            </div>

            <h5 style={styles.statusSectionLabel}>Recent Updates</h5>
            {statusUserGroups.length === 0 || (statusUserGroups.length === 1 && ownGroup) ? (
              <div style={styles.emptyState}>
                <Globe size={32} style={{ opacity: 0.2, marginBottom: '8px' }} />
                <p style={{ fontSize: '13px' }}>No status updates yet</p>
                <span style={{ fontSize: '11px', color: '#64748b' }}>Stories disappear after 24 hours</span>
              </div>
            ) : (
              statusUserGroups
                .filter(group => Number(group.userId) !== Number(currentUser.id))
                .map(group => (
                  <div
                    key={group.userId}
                    style={styles.statusFeedRow}
                    onClick={() => setActiveStory(group.stories[0])}
                    className="clickable"
                  >
                    <div style={styles.statusRingGreen}>
                      <img src={getAvatarUrl(group.avatar_url, group.display_name)} alt={group.display_name} style={styles.statusAvatarImg} />
                    </div>
                    <div style={{ flex: 1, marginLeft: '12px' }}>
                      <h4 style={{ fontSize: '14.5px', fontWeight: '600', color: '#ffffff' }}>{group.display_name}</h4>
                      <p style={{ fontSize: '11.5px', color: '#94a3b8', marginTop: '2px' }}>
                        {new Date(group.stories[0].created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))
            )}
          </div>
        )}

        {/* C. CALLS TAB */}
        {activeTab === 'calls' && (
          callLogs.length === 0 ? (
            <div style={styles.emptyState}>
              <Phone size={36} style={{ opacity: 0.3, marginBottom: '8px' }} />
              <p>No call history</p>
            </div>
          ) : (
            callLogs.map(log => {
              const isCaller = log.caller_id === currentUser.id;
              const peerName = isCaller ? log.receiver_name : log.caller_name;
              const peerAvatar = isCaller ? log.receiver_avatar : log.caller_avatar;
              const peerId = isCaller ? log.receiver_id : log.caller_id;

              return (
                <div key={log.id} style={styles.callLogItem}>
                  <img src={getAvatarUrl(peerAvatar, peerName)} alt={peerName} style={styles.smallAvatar} />
                  <div style={{ flex: 1, marginLeft: '12px' }}>
                    <div style={styles.callLogName}>{peerName}</div>
                    <div style={styles.callLogTime}>
                      {log.type === 'video' ? <Video size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} /> : <Phone size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />}
                      <span style={{
                        color: log.status === 'missed' ? '#ef4444' : '#94a3b8',
                        textTransform: 'capitalize'
                      }}>
                        {log.status}
                      </span>
                      {log.status === 'connected' && ` • ${formatDuration(log.duration)}`}
                    </div>
                  </div>
                  <div style={styles.callLogAction}>
                    <button
                      onClick={() => onInitiateCall(peerId, peerName, 'video')}
                      style={styles.callIconBtn}
                      className="glass-btn"
                      title="Video Call"
                    >
                      <Video size={14} />
                    </button>
                    <button
                      onClick={() => onInitiateCall(peerId, peerName, 'audio')}
                      style={styles.callIconBtn}
                      className="glass-btn"
                      title="Voice Call"
                    >
                      <PhoneCall size={14} />
                    </button>
                  </div>
                </div>
              );
            })
          )
        )}
      </div>

      {/* ==================== MODALS & POPUPS ==================== */}

      {/* I. PROFILE MODAL */}
      {isProfileOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.profileModalCard} className="glass-panel">
            <div style={styles.modalHeader}>
              <h3>Profile Info</h3>
              <button onClick={() => setIsProfileOpen(false)} style={styles.closeBtn}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSaveProfile} style={styles.profileForm}>
              <div style={styles.avatarEditContainer}>
                <div style={styles.avatarBigWrapper} onClick={() => fileInputRef.current.click()} className="clickable">
                  <img src={getAvatarUrl(profileAvatar, profileName)} alt="edit avatar" style={styles.bigAvatar} />
                  <div style={styles.cameraOverlay}>
                    <Camera size={20} />
                  </div>
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleAvatarChange}
                  style={{ display: 'none' }}
                  accept="image/*"
                  disabled={profileLoading}
                />
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '6px' }}>Click photo to upload new picture</span>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Display Name</label>
                <input
                  type="text"
                  className="glass-input"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="e.g. Vinay Kumar"
                  required
                  disabled={profileLoading}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>About Status</label>
                <input
                  type="text"
                  className="glass-input"
                  value={profileAbout}
                  onChange={(e) => setProfileAbout(e.target.value)}
                  placeholder="e.g. Available, Busy, At work..."
                  disabled={profileLoading}
                />
              </div>

              {/* Theme Toggle */}
              <button type="button" className="theme-toggle-btn" onClick={toggleTheme}>
                {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
                <span>{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
                <div className={`toggle-track ${theme === 'light' ? 'active' : ''}`}>
                  <div className="toggle-knob" />
                </div>
              </button>

              <button type="submit" className="btn-primary" style={{ width: '100%', marginTop: '4px' }} disabled={profileLoading}>
                {profileLoading ? 'Saving...' : 'Save Profile'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* II. STATUS CREATOR MODAL */}
      {isStatusCreatorOpen && (
        <div style={styles.modalOverlay}>
          <div style={styles.statusCreatorCard} className="glass-panel">
            <div style={styles.modalHeader}>
              <h3>Publish Status Update</h3>
              <button
                onClick={() => {
                  setIsStatusCreatorOpen(false);
                  setStatusText('');
                  setStatusFile(null);
                  setStatusPreview(null);
                }}
                style={styles.closeBtn}
              >
                <X size={18} />
              </button>
            </div>

            <div style={styles.creatorTabButtons}>
              <button
                style={{
                  ...styles.creatorToggleBtn,
                  backgroundColor: statusType === 'text' ? 'var(--primary-glow)' : 'transparent',
                  color: statusType === 'text' ? 'var(--primary)' : 'var(--text-secondary)',
                  border: statusType === 'text' ? '1px solid var(--primary)' : '1px solid transparent'
                }}
                onClick={() => {
                  setStatusType('text');
                  setStatusFile(null);
                  setStatusPreview(null);
                }}
                disabled={statusLoading}
              >
                Text Update
              </button>
              <button
                style={{
                  ...styles.creatorToggleBtn,
                  backgroundColor: statusType === 'image' ? 'var(--primary-glow)' : 'transparent',
                  color: statusType === 'image' ? 'var(--primary)' : 'var(--text-secondary)',
                  border: statusType === 'image' ? '1px solid var(--primary)' : '1px solid transparent'
                }}
                onClick={() => {
                  statusFileInputRef.current?.click();
                }}
                disabled={statusLoading}
              >
                <Image size={14} style={{ marginRight: '6px' }} />
                Photo Story
              </button>
            </div>

            <input
              type="file"
              ref={statusFileInputRef}
              onChange={handleStatusFileChange}
              style={{ display: 'none' }}
              accept="image/*"
            />

            <form onSubmit={handlePostStatus} style={styles.statusForm}>
              {statusType === 'text' ? (
                /* Text Story Creator */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div
                    style={{
                      ...styles.textStatusPreviewCard,
                      background: statusBgGradient
                    }}
                  >
                    <textarea
                      value={statusText}
                      onChange={(e) => setStatusText(e.target.value)}
                      placeholder="Type your status story here..."
                      maxLength={140}
                      style={styles.statusTextArea}
                      required
                    />
                  </div>
                  
                  {/* Pick background colors */}
                  <div>
                    <label style={{ ...styles.label, marginBottom: '6px', display: 'block' }}>Pick Background Gradient</label>
                    <div style={styles.gradientSelectorRow}>
                      {statusGradients.map((g, idx) => (
                        <div
                          key={idx}
                          onClick={() => setStatusBgGradient(g)}
                          style={{
                            ...styles.gradientCircle,
                            background: g,
                            border: statusBgGradient === g ? '2px solid #ffffff' : '2px solid transparent'
                          }}
                          className="clickable"
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                /* Photo Story Creator */
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {statusPreview && (
                    <div style={styles.photoStatusPreviewContainer}>
                      <img src={statusPreview} alt="status upload preview" style={styles.photoStatusPreview} />
                      <button
                        type="button"
                        onClick={() => {
                          setStatusFile(null);
                          setStatusPreview(null);
                          setStatusType('text');
                        }}
                        style={styles.removePhotoStatusBtn}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={styles.label}>Caption (Optional)</label>
                    <input
                      type="text"
                      className="glass-input"
                      value={statusText}
                      onChange={(e) => setStatusText(e.target.value)}
                      placeholder="Add a caption..."
                      disabled={statusLoading}
                    />
                  </div>
                </div>
              )}

              <button type="submit" className="glass-btn" style={styles.saveProfileBtn} disabled={statusLoading}>
                {statusLoading ? 'Publishing...' : 'Publish status'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* III. STORY VIEWER MODAL PLAYER */}
      {activeStory && (
        <div style={styles.storyOverlayContainer}>
          {/* Progress bar line at top */}
          <div style={styles.storyProgressBarContainer}>
            <div style={{ ...styles.storyProgressBar, width: `${storyProgress}%` }} />
          </div>

          <div style={styles.storyHeader}>
            <img src={getAvatarUrl(activeStory.avatar_url, activeStory.display_name)} alt={activeStory.display_name} style={styles.storyHeaderAvatar} />
            <div style={{ flex: 1, marginLeft: '12px' }}>
              <div style={{ fontSize: '14.5px', fontWeight: '600', color: '#ffffff' }}>{activeStory.display_name}</div>
              <span style={{ fontSize: '11px', color: '#cbd5e1' }}>
                {new Date(activeStory.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            <button onClick={closeStory} style={styles.storyCloseBtn}>
              <X size={20} />
            </button>
          </div>

          <div style={styles.storyBody}>
            {activeStory.type === 'text' ? (
              /* Render Text story */
              <div
                style={{
                  ...styles.fullStoryTextCard,
                  background: activeStory.media_url || 'linear-gradient(135deg, #10b981 0%, #059669 100%)' // gradient stored in media_url!
                }}
              >
                <p style={styles.fullStoryTextContent}>{activeStory.content}</p>
              </div>
            ) : (
              /* Render Image story */
              <div style={styles.fullStoryImageWrapper}>
                <img src={getMediaUrl(activeStory.media_url)} alt="status story" style={styles.fullStoryImage} />
                {activeStory.content && activeStory.content.trim() !== '' && (
                  <div style={styles.fullStoryCaptionCard}>
                    <p>{activeStory.content}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  sidebar: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: 'var(--bg-sidebar)',
    position: 'relative',
    overflow: 'hidden'
  },
  profileHeader: {
    display: 'flex',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid var(--border-subtle)',
    gap: '12px',
    minHeight: '72px'
  },
  avatarWrapper: {
    position: 'relative',
    display: 'inline-block',
    flexShrink: 0
  },
  avatar: {
    width: '46px',
    height: '46px',
    borderRadius: '50%',
    objectFit: 'cover',
    background: 'var(--bg-elevated)',
    border: '2px solid var(--border-subtle)'
  },
  smallAvatar: {
    width: '38px',
    height: '38px',
    borderRadius: '50%',
    objectFit: 'cover',
    background: 'var(--bg-elevated)',
    flexShrink: 0
  },
  editAvatarIconOverlay: {
    position: 'absolute',
    bottom: '-2px',
    right: '-2px',
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '2px solid var(--bg-sidebar)'
  },
  presenceIndicator: {
    position: 'absolute',
    bottom: '1px',
    right: '1px',
    border: '2px solid var(--bg-sidebar)',
    width: '12px',
    height: '12px'
  },
  profileInfo: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    gap: '2px'
  },
  displayName: {
    fontSize: '15px',
    fontWeight: '600',
    color: 'var(--text-primary)'
  },
  username: {
    fontSize: '12px',
    color: 'var(--text-secondary)'
  },
  logoutBtn: {
    padding: '10px',
    background: 'transparent',
    border: 'none',
    color: 'var(--error)',
    cursor: 'pointer',
    borderRadius: 'var(--radius-full)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background var(--transition)',
    minWidth: '40px',
    minHeight: '40px'
  },
  searchContainer: {
    padding: '10px 16px 8px'
  },
  searchBar: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center'
  },
  searchIcon: {
    position: 'absolute',
    left: '14px',
    color: 'var(--text-muted)',
    pointerEvents: 'none'
  },
  searchInput: {
    width: '100%',
    background: 'var(--bg-input)',
    border: '1.5px solid var(--border-subtle)',
    borderRadius: 'var(--radius-full)',
    padding: '10px 16px 10px 40px',
    outline: 'none',
    color: 'var(--text-primary)',
    fontSize: '14px',
    fontFamily: 'inherit',
    transition: 'border-color 0.2s, box-shadow 0.2s'
  },
  searchResultsPanel: {
    position: 'absolute',
    top: '124px',
    left: '12px',
    right: '12px',
    borderRadius: 'var(--radius-md)',
    boxShadow: 'var(--shadow-lg)',
    zIndex: 100,
    maxHeight: '280px',
    overflowY: 'auto',
    backgroundColor: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)'
  },
  searchPanelHeader: {
    fontSize: '11px',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    color: 'var(--text-muted)',
    padding: '10px 14px',
    borderBottom: '1px solid var(--border-subtle)'
  },
  searchResultRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 14px',
    gap: '12px',
    transition: 'background var(--transition)',
    borderBottom: '1px solid var(--border-subtle)'
  },
  searchResultName: {
    fontSize: '14px',
    fontWeight: '500',
    color: 'var(--text-primary)'
  },
  searchResultUsername: {
    fontSize: '12px',
    color: 'var(--text-secondary)'
  },
  noResults: {
    padding: '20px',
    textAlign: 'center',
    color: 'var(--text-muted)',
    fontSize: '14px'
  },
  tabsContainer: {
    display: 'flex',
    borderBottom: '1px solid var(--border-subtle)',
    padding: '0 8px'
  },
  tabBtn: {
    flex: 1,
    padding: '12px 0',
    background: 'none',
    border: 'none',
    fontSize: '13.5px',
    fontWeight: '500',
    cursor: 'pointer',
    fontFamily: 'inherit',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s'
  },
  listContainer: {
    flex: 1,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column'
  },
  emptyState: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-muted)',
    padding: '30px',
    textAlign: 'center'
  },
  contactItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '14px 20px',
    gap: '14px',
    borderBottom: '1px solid var(--border-subtle)',
    transition: 'background var(--transition)',
    cursor: 'pointer'
  },
  contactDetails: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden'
  },
  contactNameRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '2px'
  },
  contactName: {
    fontSize: '15px',
    fontWeight: '600',
    color: 'var(--text-primary)'
  },
  contactUsername: {
    fontSize: '12.5px',
    color: 'var(--text-secondary)'
  },
  unreadBadge: {
    fontSize: '11px',
    color: '#ffffff',
    fontWeight: '700',
    background: 'var(--primary)',
    minWidth: '20px',
    height: '20px',
    borderRadius: 'var(--radius-full)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 5px',
    boxShadow: '0 2px 6px var(--primary-glow)'
  },
  callLogItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 20px',
    borderBottom: '1px solid var(--border-subtle)'
  },
  callLogName: {
    fontSize: '14px',
    fontWeight: '500',
    color: 'var(--text-primary)'
  },
  callLogTime: {
    fontSize: '12px',
    color: 'var(--text-secondary)',
    marginTop: '2px'
  },
  callLogAction: {
    display: 'flex',
    gap: '8px'
  },
  callIconBtn: {
    padding: '6px',
    color: 'var(--primary)',
    borderRadius: '50%',
    width: '32px',
    height: '32px'
  },
  
  /* Status styles */
  statusTabContent: {
    padding: '16px'
  },
  statusHeaderCard: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px',
    borderRadius: '12px',
    marginBottom: '20px'
  },
  statusAvatarWrapper: {
    position: 'relative',
    display: 'inline-block'
  },
  statusRingGreen: {
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    border: '2px solid #10b981',
    padding: '2px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  statusAvatarImg: {
    width: '38px',
    height: '38px',
    borderRadius: '50%',
    objectFit: 'cover'
  },
  statusAvatarImgNoRing: {
    width: '44px',
    height: '44px',
    borderRadius: '50%',
    objectFit: 'cover',
    border: '1px solid var(--border-glass)'
  },
  addStatusBadgeBtn: {
    position: 'absolute',
    bottom: '-2px',
    right: '-2px',
    width: '20px',
    height: '20px',
    borderRadius: '50%',
    backgroundColor: '#10b981',
    border: '2px solid var(--bg-sidebar)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer'
  },
  statusSectionLabel: {
    fontSize: '11px',
    fontWeight: '700',
    textTransform: 'uppercase',
    color: '#64748b',
    letterSpacing: '0.5px',
    marginBottom: '10px',
    paddingLeft: '4px'
  },
  statusFeedRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '10px 4px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.02)',
    transition: 'background 0.2s',
    borderRadius: '8px'
  },
  
  /* Modals Common styling */
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    background: 'rgba(3, 7, 18, 0.7)',
    backdropFilter: 'blur(10px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000
  },
  profileModalCard: {
    width: '380px',
    borderRadius: '20px',
    padding: '28px',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)'
  },
  statusCreatorCard: {
    width: '400px',
    borderRadius: '20px',
    padding: '28px',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)'
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '24px',
    color: '#ffffff'
  },
  closeBtn: {
    background: 'none',
    border: 'none',
    color: '#94a3b8',
    cursor: 'pointer'
  },
  profileForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px'
  },
  avatarEditContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    marginBottom: '10px'
  },
  avatarBigWrapper: {
    position: 'relative',
    width: '100px',
    height: '100px',
    borderRadius: '50%',
    overflow: 'hidden'
  },
  bigAvatar: {
    width: '100px',
    height: '100px',
    borderRadius: '50%',
    objectFit: 'cover',
    background: '#1e293b'
  },
  cameraOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0,
    transition: 'opacity 0.2s'
  },
  // We can apply hover triggers using standard cursor styles
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px'
  },
  label: {
    fontSize: '13px',
    fontWeight: '500',
    color: '#cbd5e1'
  },
  saveProfileBtn: {
    width: '100%',
    padding: '12px',
    fontWeight: '600',
    backgroundColor: '#10b981',
    color: '#ffffff',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    marginTop: '8px'
  },
  
  /* Status Creator details */
  creatorTabButtons: {
    display: 'flex',
    gap: '12px',
    marginBottom: '20px'
  },
  creatorToggleBtn: {
    flex: 1,
    padding: '8px',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255, 255, 255, 0.03)',
    border: '1px solid var(--border-glass)',
    color: '#cbd5e1',
    fontFamily: 'inherit'
  },
  statusForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px'
  },
  textStatusPreviewCard: {
    height: '160px',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    boxShadow: 'inset 0 0 20px rgba(0,0,0,0.2)'
  },
  statusTextArea: {
    width: '100%',
    height: '100%',
    background: 'none',
    border: 'none',
    outline: 'none',
    color: '#ffffff',
    fontSize: '16px',
    fontWeight: '600',
    textAlign: 'center',
    resize: 'none',
    fontFamily: 'inherit'
  },
  gradientSelectorRow: {
    display: 'flex',
    gap: '8px',
    flexWrap: 'wrap'
  },
  gradientCircle: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    cursor: 'pointer'
  },
  photoStatusPreviewContainer: {
    position: 'relative',
    height: '220px',
    borderRadius: '12px',
    overflow: 'hidden',
    border: '1px solid var(--border-glass)',
    backgroundColor: '#000000'
  },
  photoStatusPreview: {
    width: '100%',
    height: '100%',
    objectFit: 'contain'
  },
  removePhotoStatusBtn: {
    position: 'absolute',
    top: '10px',
    right: '10px',
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    backgroundColor: 'rgba(0,0,0,0.6)',
    border: 'none',
    color: '#ef4444',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },

  /* Story Viewer overlay */
  storyOverlayContainer: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    backgroundColor: '#090d16',
    zIndex: 999999,
    display: 'flex',
    flexDirection: 'column',
    color: '#ffffff'
  },
  storyProgressBarContainer: {
    width: '100%',
    height: '4px',
    backgroundColor: 'rgba(255,255,255,0.15)',
    position: 'relative'
  },
  storyProgressBar: {
    height: '100%',
    backgroundColor: '#10b981',
    boxShadow: '0 0 8px #10b981',
    transition: 'width 0.03s linear'
  },
  storyHeader: {
    display: 'flex',
    alignItems: 'center',
    padding: '16px 24px',
    background: 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 100%)',
    zIndex: 10
  },
  storyHeaderAvatar: {
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    objectFit: 'cover',
    border: '1px solid rgba(255,255,255,0.2)'
  },
  storyCloseBtn: {
    background: 'none',
    border: 'none',
    color: '#ffffff',
    cursor: 'pointer',
    padding: '8px'
  },
  storyBody: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '24px',
    position: 'relative'
  },
  fullStoryTextCard: {
    width: '100%',
    maxWidth: '500px',
    height: '350px',
    borderRadius: '20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px',
    boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
    textAlign: 'center'
  },
  fullStoryTextContent: {
    fontSize: '24px',
    fontWeight: '700',
    color: '#ffffff',
    lineHeight: '1.4'
  },
  fullStoryImageWrapper: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative'
  },
  fullStoryImage: {
    maxHeight: '80vh',
    maxWidth: '90vw',
    objectFit: 'contain',
    borderRadius: '12px',
    boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
  },
  fullStoryCaptionCard: {
    position: 'absolute',
    bottom: '20px',
    background: 'rgba(15, 23, 42, 0.85)',
    backdropFilter: 'blur(12px)',
    border: '1px solid var(--border-glass)',
    padding: '14px 28px',
    borderRadius: '30px',
    maxWidth: '600px',
    textAlign: 'center',
    boxShadow: '0 10px 30px rgba(0,0,0,0.4)'
  }
};

// Simple avatar hover style inject
if (typeof document !== 'undefined') {
  const hoverStyle = document.createElement('style');
  hoverStyle.innerText = `
    .${styles.avatarWrapper.className}:hover ${styles.cameraOverlay.className} {
      opacity: 1;
    }
    .avatarBigWrapper:hover .cameraOverlay {
      opacity: 1;
    }
  `;
  document.head.appendChild(hoverStyle);
}
