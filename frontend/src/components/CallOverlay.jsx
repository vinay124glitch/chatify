import React, { useEffect, useRef } from 'react';
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff } from 'lucide-react';

export default function CallOverlay({
  callState,
  callType,
  peerName,
  localStream,
  remoteStream,
  isMuted,
  isVideoOff,
  callDuration,
  onAccept,
  onReject,
  onEnd,
  onToggleMute,
  onToggleVideo
}) {
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);

  // Bind local stream to video element
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  // Bind remote stream to video element
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  // Format seconds to MM:SS
  const formatTime = (totalSeconds) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  if (callState === 'idle') return null;

  return (
    <div style={styles.overlayContainer}>
      {/* 1. RINGING OUT (CALLING OUTGOING) */}
      {callState === 'ringing-out' && (
        <div style={styles.card} className="glass-panel">
          <div style={styles.avatarContainer}>
            <div className="pulse-avatar" style={styles.pulseRing}>
              <div style={styles.avatarPlaceholder}>{peerName.slice(0, 2).toUpperCase()}</div>
            </div>
          </div>
          <h2 style={styles.callerName}>{peerName}</h2>
          <p style={styles.callStatus}>Ringing...</p>
          <p style={styles.callTypeLabel}>{callType === 'video' ? 'Outgoing Video Call' : 'Outgoing Voice Call'}</p>
          
          <div style={styles.buttonRow}>
            <button onClick={onEnd} style={{ ...styles.actionBtn, backgroundColor: '#ef4444' }} title="Cancel Call">
              <PhoneOff size={24} />
            </button>
          </div>
        </div>
      )}

      {/* 2. RINGING IN (INCOMING CALL) */}
      {callState === 'ringing-in' && (
        <div style={styles.card} className="glass-panel">
          <div style={styles.avatarContainer}>
            <div className="pulse-avatar-ringing" style={styles.pulseRingRinging}>
              <div style={styles.avatarPlaceholder}>{peerName.slice(0, 2).toUpperCase()}</div>
            </div>
          </div>
          <h2 style={styles.callerName}>{peerName}</h2>
          <p style={styles.callStatus}>Incoming Call...</p>
          <p style={styles.callTypeLabel}>{callType === 'video' ? 'Incoming Video Call' : 'Incoming Voice Call'}</p>
          
          <div style={{ ...styles.buttonRow, gap: '32px' }}>
            <button onClick={onReject} style={{ ...styles.actionBtn, backgroundColor: '#ef4444' }} title="Decline">
              <PhoneOff size={24} />
            </button>
            <button onClick={onAccept} style={{ ...styles.actionBtn, backgroundColor: '#10b981' }} title="Accept">
              <Phone size={24} />
            </button>
          </div>
        </div>
      )}

      {/* 3. CONNECTED STATE */}
      {callState === 'connected' && (
        <div style={styles.connectedContainer}>
          {callType === 'video' ? (
            <div style={styles.videoGrid}>
              {/* Remote full screen video */}
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                style={styles.remoteVideo}
              />

              {/* Local picture-in-picture video */}
              {!isVideoOff && localStream && (
                <div style={styles.localVideoWrapper}>
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted // Crucial: mute local stream audio playback on our end to avoid loops!
                    style={styles.localVideo}
                  />
                </div>
              )}

              {/* Camera Off Indicator for Remote */}
              {!remoteStream && (
                <div style={styles.videoPlaceholder}>
                  <div style={styles.avatarPlaceholderBig}>{peerName.slice(0, 2).toUpperCase()}</div>
                  <p style={{ marginTop: '16px' }}>Connecting streams...</p>
                </div>
              )}
            </div>
          ) : (
            /* Connected Audio Call Layout */
            <div style={styles.audioCallCard} className="glass-panel">
              <div style={styles.avatarPlaceholderBig}>{peerName.slice(0, 2).toUpperCase()}</div>
              <h2 style={{ ...styles.callerName, marginTop: '20px' }}>{peerName}</h2>
              <p style={{ ...styles.callStatus, color: '#10b981' }}>Connected</p>
              <p style={styles.durationText}>{formatTime(callDuration)}</p>
            </div>
          )}

          {/* Floating UI Controls bar */}
          <div style={styles.controlBar} className="glass-panel">
            {callType === 'video' && (
              <span style={styles.videoDuration}>{formatTime(callDuration)}</span>
            )}
            
            <div style={styles.controlsRow}>
              {/* Mute Button */}
              <button
                onClick={onToggleMute}
                style={{
                  ...styles.controlBtn,
                  backgroundColor: isMuted ? '#ef4444' : 'rgba(255, 255, 255, 0.1)'
                }}
                title={isMuted ? 'Unmute Mic' : 'Mute Mic'}
              >
                {isMuted ? <MicOff size={20} /> : <Mic size={20} />}
              </button>

              {/* Video Toggle Button (Only in video call) */}
              {callType === 'video' && (
                <button
                  onClick={onToggleVideo}
                  style={{
                    ...styles.controlBtn,
                    backgroundColor: isVideoOff ? '#ef4444' : 'rgba(255, 255, 255, 0.1)'
                  }}
                  title={isVideoOff ? 'Turn Camera On' : 'Turn Camera Off'}
                >
                  {isVideoOff ? <VideoOff size={20} /> : <Video size={20} />}
                </button>
              )}

              {/* Hangup Button */}
              <button
                onClick={onEnd}
                style={{ ...styles.controlBtn, backgroundColor: '#ef4444', width: '56px', borderRadius: '28px' }}
                title="End Call"
              >
                <PhoneOff size={20} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  overlayContainer: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    background: 'rgba(3, 7, 18, 0.85)',
    backdropFilter: 'blur(20px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 99999,
    color: '#ffffff'
  },
  card: {
    width: '360px',
    padding: '40px 30px',
    borderRadius: '24px',
    textAlign: 'center',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)'
  },
  avatarContainer: {
    position: 'relative',
    width: '120px',
    height: '120px',
    margin: '0 auto 28px auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  pulseRing: {
    width: '110px',
    height: '110px',
    borderRadius: '50%',
    border: '2px dashed rgba(16, 185, 129, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px'
  },
  pulseRingRinging: {
    width: '110px',
    height: '110px',
    borderRadius: '50%',
    border: '2px dashed rgba(239, 68, 68, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4px'
  },
  avatarPlaceholder: {
    width: '100px',
    height: '100px',
    borderRadius: '50%',
    backgroundColor: '#1e293b',
    border: '2px solid rgba(255, 255, 255, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '32px',
    fontWeight: '700',
    color: '#34d399',
    textShadow: '0 0 10px rgba(52, 211, 153, 0.3)'
  },
  avatarPlaceholderBig: {
    width: '120px',
    height: '120px',
    borderRadius: '50%',
    backgroundColor: '#1e293b',
    border: '3px solid rgba(16, 185, 129, 0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '44px',
    fontWeight: '700',
    color: '#34d399',
    margin: '0 auto',
    boxShadow: '0 10px 30px rgba(16, 185, 129, 0.15)'
  },
  callerName: {
    fontSize: '24px',
    fontWeight: '600',
    color: '#ffffff',
    marginBottom: '6px'
  },
  callStatus: {
    fontSize: '15px',
    color: '#94a3b8',
    marginBottom: '16px'
  },
  callTypeLabel: {
    fontSize: '12px',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    marginBottom: '32px'
  },
  buttonRow: {
    display: 'flex',
    justifyContent: 'center',
    gap: '24px'
  },
  actionBtn: {
    width: '60px',
    height: '60px',
    borderRadius: '50%',
    border: 'none',
    color: '#ffffff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'transform 0.2s',
    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.3)'
  },
  connectedContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  videoGrid: {
    width: '100%',
    height: '100%',
    position: 'relative',
    backgroundColor: '#000000',
    overflow: 'hidden'
  },
  remoteVideo: {
    width: '100%',
    height: '100%',
    objectFit: 'cover'
  },
  localVideoWrapper: {
    position: 'absolute',
    top: '24px',
    right: '24px',
    width: '150px',
    height: '220px',
    borderRadius: '16px',
    overflow: 'hidden',
    border: '2px solid rgba(255, 255, 255, 0.2)',
    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
    zIndex: 100,
    backgroundColor: '#111827'
  },
  localVideo: {
    width: '100%',
    height: '100%',
    objectFit: 'cover'
  },
  videoPlaceholder: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0f172a',
    color: '#94a3b8'
  },
  audioCallCard: {
    width: '380px',
    padding: '50px 30px',
    borderRadius: '24px',
    textAlign: 'center',
    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)'
  },
  durationText: {
    fontSize: '28px',
    fontWeight: '700',
    color: '#ffffff',
    marginTop: '20px',
    fontFamily: 'monospace',
    letterSpacing: '1px'
  },
  controlBar: {
    position: 'absolute',
    bottom: '36px',
    borderRadius: '30px',
    padding: '12px 24px',
    display: 'flex',
    alignItems: 'center',
    gap: '24px',
    boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
    zIndex: 200,
    backgroundColor: 'rgba(15, 23, 42, 0.7)'
  },
  videoDuration: {
    fontSize: '15px',
    fontWeight: '600',
    fontFamily: 'monospace',
    color: '#ffffff',
    borderRight: '1px solid rgba(255, 255, 255, 0.15)',
    paddingRight: '16px'
  },
  controlsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px'
  },
  controlBtn: {
    width: '44px',
    height: '44px',
    borderRadius: '22px',
    border: 'none',
    color: '#ffffff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s',
    outline: 'none'
  }
};
