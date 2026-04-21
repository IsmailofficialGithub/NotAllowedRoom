import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Mic, MicOff, Video, VideoOff, PhoneOff, 
  Maximize2, Users, Settings 
} from 'lucide-react';
import { useSocket } from '../context/SocketContext';

const CallOverlay = ({ roomId, isRoomJoined, onLeave, initialVideo = true, initialMuted = false }) => {
  const socket = useSocket();
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({}); 
  const [callParticipants, setCallParticipants] = useState({}); // { socketId: user }
  const [isMuted, setIsMuted] = useState(initialMuted);
  const [isCameraOff, setIsCameraOff] = useState(!initialVideo);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [localIsSpeaking, setLocalIsSpeaking] = useState(false);
  
  const localVideoRef = useRef();
  const localStreamRef = useRef(null);
  const peersRef = useRef({});
  const screenStreamRef = useRef(null);
  const isInitializing = useRef(false);
  const hasJoinedCall = useRef(false);
  const makingOfferRef = useRef({});
  const ignoreOfferRef = useRef({});

  const iceServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
    ]
  };

  useEffect(() => {
    if (!socket?.connected || !socket?.id || !isRoomJoined) return;

    const init = async () => {
      if (isInitializing.current || hasJoinedCall.current || !socket.id) return;
      isInitializing.current = true;
      
      try {
        const stream = await startLocalStream();
        
        if (stream && !hasJoinedCall.current) {
          hasJoinedCall.current = true;
          
          // Now that stream is ready, register listeners and join
          socket.on('user_joined_call', handleUserJoined);
          socket.on('current_participants', handleCurrentParticipants);
          socket.on('call_signal', handleSignal);
          socket.on('user_left_call', handleUserLeft);
          
          socket.emit('join_call', { room_id: roomId });
          
          socket.on('user_toggle_media', ({ socket_id, type, status }) => {
            setCallParticipants(prev => {
              const user = prev[socket_id];
              if (!user) return prev;
              return {
                ...prev,
                [socket_id]: { 
                  ...user, 
                  [type === 'mic' ? 'isMuted' : 'isCameraOff']: !status 
                }
              };
            });
          });
        }
      } catch (err) {
        console.error('[Call] Init failed:', err);
      } finally {
        isInitializing.current = false;
      }
    };

    init();

    return () => {
      socket.emit('leave_call', { room_id: roomId });
      socket.off('user_joined_call');
      socket.off('current_participants');
      socket.off('call_signal');
      socket.off('user_left_call');
      
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => track.stop());
      }
      Object.values(peersRef.current).forEach(peer => peer.close());
      hasJoinedCall.current = false;
      isInitializing.current = false;
    };
  }, [socket, socket?.connected, socket?.id, roomId, isRoomJoined]);

  // Handle local speaking highlight
  useEffect(() => {
    if (!localStream || isMuted) {
      setLocalIsSpeaking(false);
      return;
    }

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(localStream);
    source.connect(analyser);
    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    let animationId;
    const checkVolume = () => {
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
      const average = sum / bufferLength;
      setLocalIsSpeaking(average > 30);
      animationId = requestAnimationFrame(checkVolume);
    };
    checkVolume();

    return () => {
      cancelAnimationFrame(animationId);
      audioContext.close();
    };
  }, [localStream, isMuted]);

  // Sync local video element
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      console.log('📽️ Attaching local stream to video element');
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.play().catch(e => console.error('Video play failed:', e));
      
      const vTrack = localStream.getVideoTracks()[0];
      if (vTrack) {
        setIsCameraOff(!vTrack.enabled);
      }
    }
  }, [localStream]);

  const startLocalStream = async () => {
    // Stop any existing tracks before getting new ones
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: initialVideo ? { width: 1280, height: 720 } : false,
        audio: true
      });
      
      // Apply initial settings
      if (initialMuted) {
        stream.getAudioTracks().forEach(track => track.enabled = false);
      }
      if (!initialVideo) {
        stream.getVideoTracks().forEach(track => track.enabled = false);
      }

      setLocalStream(stream);
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      return stream;
    } catch (err) {
      console.warn('[Call] Camera access failed, fallback to audio:', err);
      try {
        const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true });
        setLocalStream(audioOnly);
        localStreamRef.current = audioOnly;
        setIsCameraOff(true);
        return audioOnly;
      } catch (audioErr) {
        console.error('[Call] Mic access failed:', audioErr);
        return null;
      }
    }
  };

  const createPeer = (targetSocketId, user, isInitiator) => {
    if (peersRef.current[targetSocketId]) return peersRef.current[targetSocketId];

    console.log(`📡 Creating peer connection for ${targetSocketId} (Initiator: ${isInitiator})`);
    const peer = new RTCPeerConnection(iceServers);
    peersRef.current[targetSocketId] = peer;

    // Perfect Negotiation state
    makingOfferRef.current[targetSocketId] = false;
    ignoreOfferRef.current[targetSocketId] = false;
    const polite = socket.id > targetSocketId; // Higher ID is polite

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('call_signal', {
          to: targetSocketId,
          signal: { type: 'ice-candidate', candidate: event.candidate }
        });
      }
    };

    peer.ontrack = (event) => {
      console.log(`🎥 Received remote track from ${targetSocketId}`);
      const [remoteStream] = event.streams;
      setRemoteStreams(prev => ({
        ...prev,
        [targetSocketId]: { stream: remoteStream, user }
      }));
    };

    peer.onnegotiationneeded = async () => {
      try {
        console.log(`🔄 Negotiation needed for ${targetSocketId}`);
        makingOfferRef.current[targetSocketId] = true;
        await peer.setLocalDescription();
        socket.emit('call_signal', { to: targetSocketId, signal: peer.localDescription });
      } catch (err) {
        console.error(`[WebRTC] Negotiation failed for ${targetSocketId}:`, err);
      } finally {
        makingOfferRef.current[targetSocketId] = false;
      }
    };

    peer.oniceconnectionstatechange = () => {
      console.log(`❄️ ICE State for ${targetSocketId}: ${peer.iceConnectionState}`);
      if (peer.iceConnectionState === 'failed') {
        peer.restartIce();
      }
    };

    // Add local tracks to the peer connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        console.log(`📤 Adding ${track.kind} track to ${targetSocketId}`);
        peer.addTrack(track, localStreamRef.current);
      });
    }

    return peer;
  };

  const handleUserJoined = ({ socket_id, user }) => {
    if (socket_id === socket.id) return;
    console.log(`👤 User joined call: ${user?.name} (${socket_id})`);
    setCallParticipants(prev => ({ ...prev, [socket_id]: user }));
    createPeer(socket_id, user, true);
  };

  const handleCurrentParticipants = ({ participants }) => {
    console.log(`👥 Existing call participants:`, participants);
    const newParticipants = {};
    participants.forEach(({ socket_id, user }) => {
      if (socket_id !== socket.id) {
        newParticipants[socket_id] = user;
        createPeer(socket_id, user, true);
      }
    });
    setCallParticipants(prev => ({ ...prev, ...newParticipants }));
  };

  const handleSignal = async ({ signal, from, user }) => {
    let peer = peersRef.current[from];
    if (!peer) {
      console.log(`📡 Signal received from unknown peer ${from}, creating...`);
      peer = createPeer(from, user, false);
    }

    try {
      if (signal.type === 'offer') {
        const polite = socket.id > from;
        const offerCollision = (makingOfferRef.current[from] || peer.signalingState !== 'stable');
        
        ignoreOfferRef.current[from] = !polite && offerCollision;
        if (ignoreOfferRef.current[from]) {
          console.warn('[WebRTC] Coalescing: Ignoring offer collision from (higher-id wins):', from);
          return;
        }

        console.log(`📥 Handling offer from ${from}`);
        await peer.setRemoteDescription(new RTCSessionDescription(signal));
        await peer.setLocalDescription();
        socket.emit('call_signal', { to: from, signal: peer.localDescription });
        
      } else if (signal.type === 'answer') {
        console.log(`📥 Handling answer from ${from}`);
        await peer.setRemoteDescription(new RTCSessionDescription(signal));
      } else if (signal.type === 'ice-candidate' && signal.candidate) {
        try {
          console.log(`📥 Adding ICE candidate from ${from}`);
          await peer.addIceCandidate(new RTCIceCandidate(signal.candidate));
        } catch (err) {
          if (!ignoreOfferRef.current[from]) {
            console.warn(`[WebRTC] ICE candidate error from ${from}:`, err);
          }
        }
      }
    } catch (err) {
      console.error(`[WebRTC] Signaling error from ${from}:`, err);
    }
  };

  const handleUserLeft = ({ socket_id }) => {
    console.log(`👋 [WebRTC] User left call: ${socket_id}`);
    
    // Close and cleanup peer connection
    if (peersRef.current[socket_id]) {
      peersRef.current[socket_id].close();
      delete peersRef.current[socket_id];
    }
    
    // Remove from UI state
    setCallParticipants(prev => {
      if (!prev[socket_id]) return prev;
      const next = { ...prev };
      delete next[socket_id];
      return next;
    });
    
    setRemoteStreams(prev => {
      if (!prev[socket_id]) return prev;
      const next = { ...prev };
      delete next[socket_id];
      return next;
    });
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const state = !isMuted;
      localStreamRef.current.getAudioTracks().forEach(t => t.enabled = !state);
      setIsMuted(state);
      socket.emit('toggle_media', { room_id: roomId, type: 'mic', status: !state });
    }
  };

  const toggleCamera = async () => {
    if (!localStreamRef.current || isScreenSharing) return;
    
    let videoTrack = localStreamRef.current.getVideoTracks()[0];
    
    if (videoTrack) {
      const isCurrentlyOff = !videoTrack.enabled;
      videoTrack.enabled = isCurrentlyOff;
      setIsCameraOff(!isCurrentlyOff);
      socket.emit('toggle_media', { room_id: roomId, type: 'video', status: isCurrentlyOff });
    } else {
      // No camera track! (Joined with audio only)
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { width: 1280, height: 720 } 
        });
        const newTrack = stream.getVideoTracks()[0];
        
        localStreamRef.current.addTrack(newTrack);
        
        // Force state update so UI and effects see the new track
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
        
        // Add to all existing peer connections
        Object.values(peersRef.current).forEach(peer => {
          peer.addTrack(newTrack, localStreamRef.current);
        });
        
        setIsCameraOff(false);
      } catch (err) {
        console.error('[Call] Failed to acquire camera:', err);
      }
    }
  };

  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        screenStreamRef.current = stream;
        const track = stream.getVideoTracks()[0];

        Object.values(peersRef.current).forEach(peer => {
          const sender = peer.getSenders().find(s => s.track?.kind === 'video');
          if (sender) {
            sender.replaceTrack(track);
          } else {
            peer.addTrack(track, stream);
          }
        });

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.style.transform = 'none';
        }
        setIsScreenSharing(true);
        track.onended = () => stopScreenShare();
      } catch (err) {
        console.error('Screen sharing failed:', err);
      }
    } else {
      stopScreenShare();
    }
  };

  const stopScreenShare = () => {
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(t => t.stop());
      screenStreamRef.current = null;
    }
    const camTrack = localStreamRef.current?.getVideoTracks()[0];
    Object.values(peersRef.current).forEach(peer => {
      const sender = peer.getSenders().find(s => s.track?.kind === 'video');
      if (sender && camTrack) sender.replaceTrack(camTrack);
    });

    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current;
      localVideoRef.current.style.transform = 'scaleX(-1)';
    }
    setIsScreenSharing(false);
  };

  const handleLeave = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    if (screenStreamRef.current) {
      screenStreamRef.current.getTracks().forEach(track => track.stop());
    }
    onLeave();
  };

  const remotesCount = Object.keys(callParticipants).length;

  return (
    <div className="call-root-wrapper">
      <header className="call-header">
        <div className="header-info">
          <div className="pulse-dot" />
          <div>
            <h1>Live Conference</h1>
            <span className="room-subtext">{remotesCount === 0 ? 'Waitng for others...' : `${remotesCount + 1} participants in call`}</span>
          </div>
        </div>
      </header>

      <main className="video-grid-container">
        <div className="video-grid">
          <div className={`video-container local ${localIsSpeaking ? 'active-speaker' : ''} ${isScreenSharing ? 'is-sharing' : ''}`}>
            <video ref={localVideoRef} autoPlay muted playsInline />
            {isCameraOff && !isScreenSharing && (
              <div className="camera-off-placeholder">
                <div className="user-avatar">You</div>
              </div>
            )}
            <div className="participant-label">
              {isScreenSharing ? 'You (Screen)' : 'You'} {isMuted && <MicOff size={10} />}
            </div>
          </div>

          {Object.entries(callParticipants).map(([id, user]) => (
            <RemoteVideo 
              key={id} 
              socketId={id} 
              stream={remoteStreams[id]?.stream} 
              user={user} 
            />
          ))}
        </div>
      </main>

      <footer className="call-controls">
        <div className="controls-inner">
          <button onClick={toggleMute} className={`action-btn ${isMuted ? 'muted' : ''}`}>
            {isMuted ? <MicOff /> : <Mic />}
            <label>Mute</label>
          </button>
          <button onClick={toggleCamera} disabled={isScreenSharing} className={`action-btn ${isCameraOff ? 'camera-off' : ''}`}>
            {isCameraOff ? <VideoOff /> : <Video />}
            <label>Camera</label>
          </button>
          <button onClick={toggleScreenShare} className={`action-btn ${isScreenSharing ? 'sharing' : ''}`}>
            <Maximize2 />
            <label>Share</label>
          </button>
          <button onClick={handleLeave} className="action-btn end-call">
            <PhoneOff />
            <label>End</label>
          </button>
        </div>
      </footer>

      <style>{`
        .call-root-wrapper {
          position: fixed; inset: 0; height: 100dvh; background: #050508; z-index: 9999;
          display: flex; flex-direction: column; color: white; overflow: hidden; font-family: 'Inter', sans-serif;
        }
        .call-header { padding: 12px 30px; background: rgba(0,0,0,0.6); flex-shrink: 0; display: flex; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .header-info { display: flex; gap: 10px; align-items: center; }
        .header-info h1 { font-size: 0.95rem; margin: 0; font-weight: 600; letter-spacing: -0.01em; }
        .room-subtext { font-size: 0.65rem; color: #64748b; font-weight: 500; }
        .pulse-dot { width: 6px; height: 6px; border-radius: 50%; background: #10b981; box-shadow: 0 0 10px #10b981; animation: pulse 2s infinite; }
        @keyframes pulse { 0% { opacity: 0.4; transform: scale(0.9); } 50% { opacity: 1; transform: scale(1.1); } 100% { opacity: 0.4; transform: scale(0.9); } }
        .video-grid-container { flex: 1; overflow-y: auto; display: flex; align-items: center; padding: 20px; }
        .video-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; max-width: 1300px; width: 100%; margin: 0 auto; }
        .video-container { background: #0f172a; border-radius: 12px; overflow: hidden; aspect-ratio: 16/9; position: relative; border: 2px solid transparent; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); background-image: radial-gradient(circle at center, #1e293b 0%, #0f172a 100%); }
        .video-container video { width: 100%; height: 100%; object-fit: cover; }
        .video-container.local video { transform: scaleX(-1); }
        .video-container.is-sharing video { transform: none; object-fit: contain; background: #000; }
        .active-speaker { border-color: #6366f1 !important; box-shadow: 0 0 20px rgba(99, 102, 241, 0.4); z-index: 5; }
        .participant-label { position: absolute; bottom: 8px; left: 8px; background: rgba(0,0,0,0.6); padding: 4px 10px; border-radius: 6px; font-size: 0.65rem; backdrop-filter: blur(8px); display: flex; align-items: center; gap: 5px; font-weight: 500; }
        .camera-off-placeholder { position: absolute; inset: 0; background: #0f172a; display: flex; align-items: center; justify-content: center; }
        .user-avatar { width: 56px; height: 56px; border-radius: 50%; background: linear-gradient(135deg, #6366f1, #a855f7); display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 1.2rem; box-shadow: 0 8px 20px rgba(0,0,0,0.4); border: 2px solid rgba(255,255,255,0.1); }
        .call-controls { padding: 20px; background: linear-gradient(transparent, rgba(0,0,0,0.9)); flex-shrink: 0; display: flex; justify-content: center; }
        .controls-inner { display: flex; gap: 14px; background: rgba(15, 23, 42, 0.9); padding: 12px 24px; border-radius: 20px; border: 1px solid rgba(255,255,255,0.08); backdrop-filter: blur(20px); }
        .action-btn { width: 52px; height: 52px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); background: rgba(255,255,255,0.03); color: white; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; transition: all 0.2s ease; }
        .action-btn:hover { background: rgba(255,255,255,0.08); transform: translateY(-2px); border-color: rgba(255,255,255,0.2); }
        .action-btn:active { transform: translateY(0); }
        .action-btn label { font-size: 0.5rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.6; }
        .action-btn.muted, .action-btn.camera-off { color: #ef4444; background: rgba(239,68,68,0.1); border-color: rgba(239,68,68,0.2); }
        .action-btn.sharing { color: #10b981; background: rgba(16,185,129,0.1); border-color: rgba(16,185,129,0.2); }
        .action-btn.end-call { background: #ef4444; border: none; width: 64px; box-shadow: 0 4px 15px rgba(239, 68, 68, 0.3); }
        .action-btn.end-call:hover { background: #dc2626; box-shadow: 0 6px 20px rgba(239, 68, 68, 0.4); }
        .action-btn:disabled { opacity: 0.3; cursor: not-allowed; }
      `}</style>
    </div>
  );
};

const RemoteVideo = ({ stream, user, socketId }) => {
  const videoRef = useRef();
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [, forceUpdate] = useState({});

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      
      // Listen for new tracks added to this stream
      const handleAddTrack = () => {
        console.log('🎞️ New track added to remote stream, updating video element');
        videoRef.current.srcObject = null;
        videoRef.current.srcObject = stream;
        forceUpdate({}); 
      };
      
      stream.addEventListener('addtrack', handleAddTrack);
      return () => stream.removeEventListener('addtrack', handleAddTrack);
    }
  }, [stream]);

  // Audio analysis for remote highlight
  useEffect(() => {
    if (!stream) return;
    
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) return;

    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);
    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    let animationId;
    const checkVolume = () => {
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
      const average = sum / bufferLength;
      setIsSpeaking(average > 30);
      animationId = requestAnimationFrame(checkVolume);
    };
    checkVolume();

    return () => {
      cancelAnimationFrame(animationId);
      audioContext.close();
    };
  }, [stream]);

  return (
    <div className={`video-container ${isSpeaking ? 'active-speaker' : ''}`}>
      {stream ? (
        <video ref={videoRef} autoPlay playsInline />
      ) : (
        <div className="camera-off-placeholder">
          <div className="user-avatar" style={{ fontSize: '0.8rem' }}>
            {user?.name?.slice(0, 2).toUpperCase() || '...'}
          </div>
          <div style={{ position: 'absolute', bottom: '40px', fontSize: '0.6rem', color: '#64748b' }}>
            Connecting...
          </div>
        </div>
      )}
      <div className="participant-label">
        {user?.name || 'Guest'} {user?.isMuted && <MicOff size={10} style={{ color: '#ef4444' }} />}
      </div>
    </div>
  );
};

export default CallOverlay;
