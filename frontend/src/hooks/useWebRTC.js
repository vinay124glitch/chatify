import { useState, useEffect, useRef } from 'react';

// Setup WebRTC ICE stun/turn servers
const iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

export default function useWebRTC(socket, currentUser) {
  const [callState, setCallState] = useState('idle'); // 'idle', 'ringing-out', 'ringing-in', 'connected'
  const [callType, setCallType] = useState('video'); // 'video' or 'audio'
  const [peerId, setPeerId] = useState(null);
  const [peerName, setPeerName] = useState('');
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const sdpOfferRef = useRef(null);
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const canvasAnimId = useRef(null);

  // Call duration counter
  useEffect(() => {
    if (callState === 'connected') {
      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setCallDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setCallDuration(0);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callState]);

  // Handle Socket.io signaling listeners
  useEffect(() => {
    if (!socket) return;

    // Incoming Call
    const handleIncomingCall = (data) => {
      if (callState !== 'idle') {
        // Busy - reject call automatically
        socket.emit('call_rejected', { callerId: data.callerId, type: data.type });
        return;
      }
      setCallState('ringing-in');
      setCallType(data.type);
      setPeerId(data.callerId);
      setPeerName(data.callerName);
      sdpOfferRef.current = data.sdpOffer;
    };

    // Call Accepted
    const handleCallAccepted = async (data) => {
      if (!pcRef.current) return;
      try {
        console.log('WebRTC: Call accepted, setting remote SDP');
        await pcRef.current.setRemoteDescription(new RTCSessionDescription(data.sdpAnswer));
        setCallState('connected');
      } catch (err) {
        console.error('Error setting remote description on accept:', err);
        endCall();
      }
    };

    // Call Rejected
    const handleCallRejected = () => {
      console.log('WebRTC: Call rejected by remote peer');
      cleanupCall();
      setCallState('idle');
      alert('Call was rejected or the user is busy.');
    };

    // Remote ICE Candidates
    const handleRemoteIceCandidate = async (data) => {
      if (!pcRef.current) return;
      try {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (err) {
        console.error('Error adding ICE candidate:', err);
      }
    };

    // Call Ended
    const handleCallEnded = () => {
      console.log('WebRTC: Call ended by remote peer');
      cleanupCall();
    };

    // Handle offline error
    const handleCallError = (data) => {
      alert(data.error || 'Calling error occurred.');
      cleanupCall();
    };

    socket.on('incoming_call', handleIncomingCall);
    socket.on('call_accepted', handleCallAccepted);
    socket.on('call_rejected', handleCallRejected);
    socket.on('ice_candidate', handleRemoteIceCandidate);
    socket.on('call_ended', handleCallEnded);
    socket.on('call_error', handleCallError);

    return () => {
      socket.off('incoming_call', handleIncomingCall);
      socket.off('call_accepted', handleCallAccepted);
      socket.off('call_rejected', handleCallRejected);
      socket.off('ice_candidate', handleRemoteIceCandidate);
      socket.off('call_ended', handleCallEnded);
      socket.off('call_error', handleCallError);
    };
  }, [socket, callState]);

  // Clean up canvas animations if any
  const stopSyntheticVideo = () => {
    if (canvasAnimId.current) {
      cancelAnimationFrame(canvasAnimId.current);
      canvasAnimId.current = null;
    }
  };

  // Helper to generate a mockup silent and animated media stream
  const getSyntheticMediaStream = (type, labelName) => {
    console.warn('WebRTC: Creating synthetic fallback media stream');
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext('2d');

    let pulseAngle = 0;
    const drawMockFrame = () => {
      ctx.fillStyle = '#0f172a'; // Obsidian background
      ctx.fillRect(0, 0, 640, 480);

      // Draw glowing emerald elements
      ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(320, 240, 80 + Math.sin(pulseAngle) * 15, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#10b981'; // Emerald center
      ctx.beginPath();
      ctx.arc(320, 240, 50, 0, Math.PI * 2);
      ctx.fill();

      // Text Overlay
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(labelName || 'User', 320, 235);
      
      ctx.font = '16px sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.fillText(type === 'video' ? 'Camera Active (Mock)' : 'Voice Call Only', 320, 265);

      pulseAngle += 0.05;
      canvasAnimId.current = requestAnimationFrame(drawMockFrame);
    };
    drawMockFrame();

    const stream = canvas.captureStream(24); // 24 FPS video track

    // Web Audio silent track generator
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const dst = audioCtx.createMediaStreamDestination();
      oscillator.connect(dst);
      oscillator.start();
      const silentAudioTrack = dst.stream.getAudioTracks()[0];
      if (silentAudioTrack) {
        stream.addTrack(silentAudioTrack);
      }
    } catch (e) {
      console.error('Failed to create silent audio track:', e);
    }

    return stream;
  };

  // Get user media (mic + cam)
  const getUserMediaStream = async (type) => {
    try {
      const constraints = {
        audio: true,
        video: type === 'video'
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      return stream;
    } catch (err) {
      console.warn('getUserMedia failed. Falling back to synthetic media stream.', err);
      return getSyntheticMediaStream(type, currentUser.display_name);
    }
  };

  // Initialize peer connection
  const createPeerConnection = (targetUserId, stream) => {
    const pc = new RTCPeerConnection(iceServers);

    // Add local tracks to peer connection
    stream.getTracks().forEach((track) => {
      pc.addTrack(track, stream);
    });

    // Handle remote track arrivals
    pc.ontrack = (event) => {
      console.log('WebRTC: Received remote stream track');
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
        remoteStreamRef.current = event.streams[0];
      } else {
        // If not in a stream, construct one
        if (!remoteStreamRef.current) {
          const newStream = new MediaStream();
          setRemoteStream(newStream);
          remoteStreamRef.current = newStream;
        }
        remoteStreamRef.current.addTrack(event.track);
      }
    };

    // Handle ICE candidates generated locally
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('ice_candidate', {
          targetId: targetUserId,
          candidate: event.candidate
        });
      }
    };

    pcRef.current = pc;
    return pc;
  };

  // Initiate an Outgoing Call
  const initiateCall = async (targetUserId, targetUserName, type = 'video') => {
    console.log(`WebRTC: Initiating ${type} call to user ${targetUserId}`);
    setCallState('ringing-out');
    setCallType(type);
    setPeerId(targetUserId);
    setPeerName(targetUserName);

    try {
      const stream = await getUserMediaStream(type);
      setLocalStream(stream);
      localStreamRef.current = stream;

      const pc = createPeerConnection(targetUserId, stream);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      socket.emit('call_request', {
        receiverId: targetUserId,
        sdpOffer: offer,
        type
      });
    } catch (err) {
      console.error('Error initiating WebRTC call:', err);
      cleanupCall();
    }
  };

  // Accept Incoming Call
  const acceptCall = async () => {
    if (!peerId || !sdpOfferRef.current) return;
    console.log(`WebRTC: Accepting call from user ${peerId}`);

    try {
      const stream = await getUserMediaStream(callType);
      setLocalStream(stream);
      localStreamRef.current = stream;

      const pc = createPeerConnection(peerId, stream);
      await pc.setRemoteDescription(new RTCSessionDescription(sdpOfferRef.current));
      
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      socket.emit('call_accepted', {
        callerId: peerId,
        sdpAnswer: answer
      });

      setCallState('connected');
    } catch (err) {
      console.error('Error accepting WebRTC call:', err);
      cleanupCall();
    }
  };

  // Reject Incoming Call
  const rejectCall = () => {
    if (!peerId) return;
    console.log(`WebRTC: Rejecting call from user ${peerId}`);
    socket.emit('call_rejected', { callerId: peerId, type: callType });
    cleanupCall();
  };

  // End active call
  const endCall = () => {
    if (peerId) {
      const status = callState === 'connected' ? 'connected' : 'missed';
      socket.emit('hangup', {
        targetId: peerId,
        duration: callDuration,
        status,
        type: callType
      });
    }
    cleanupCall();
  };

  // Internal cleanup helper
  const cleanupCall = () => {
    stopSyntheticVideo();

    if (timerRef.current) clearInterval(timerRef.current);

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    setLocalStream(null);
    setRemoteStream(null);
    setCallState('idle');
    setPeerId(null);
    setPeerName('');
    setIsMuted(false);
    setIsVideoOff(false);
    setCallDuration(0);
    sdpOfferRef.current = null;
  };

  // Mute audio track toggler
  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  // Toggle local video track on/off
  const toggleVideo = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
      }
    }
  };

  return {
    callState,
    callType,
    peerId,
    peerName,
    localStream,
    remoteStream,
    isMuted,
    isVideoOff,
    callDuration,
    initiateCall,
    acceptCall,
    rejectCall,
    endCall,
    toggleMute,
    toggleVideo
  };
}
