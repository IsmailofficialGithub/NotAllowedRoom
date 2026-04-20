import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Mic, MicOff, Video, VideoOff, PhoneOff, 
  Maximize2, Minimize2, Users, Settings 
} from 'lucide-react';
import { useSocket } from '../context/SocketContext';

const CallOverlay = ({ roomId, onLeave, initialVideo = true }) => {
  const socket = useSocket();
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({}); // { socketId: { stream, user } }
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(!initialVideo);
  const [peers, setPeers] = useState({}); // { socketId: RTCPeerConnection }
  
  const localVideoRef = useRef();
  const streamsRef = useRef({}); // Using ref for immediate access in listeners
  const peersRef = useRef({});

  const iceServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ]
  };

  const hasJoinedCall = useRef(false);

  const localStreamRef = useRef(null);

  useEffect(() => {
    const init = async () => {
      if (hasJoinedCall.current) return;
      
      const stream = await startLocalStream();
      if (stream && !hasJoinedCall.current) {
        hasJoinedCall.current = true;
        console.log('📡 Local stream ready, joining call...');
        socket.emit('join_call', { room_id: roomId });
      }
    };
    
    init();

    socket.on('user_joined_call', handleUserJoined);
    socket.on('call_signal', handleSignal);
    socket.on('user_left_call', handleUserLeft);

    return () => {
      console.log('🚮 Cleaning up call overlay...');
      socket.emit('leave_call', { room_id: roomId });
      socket.off('user_joined_call');
      socket.off('call_signal');
      socket.off('user_left_call');
      
      // Cleanup streams and peers
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      Object.values(peersRef.current).forEach(peer => peer.close());
      peersRef.current = {};
    };
  }, [socket, roomId]);

  const startLocalStream = async () => {
    try {
      console.log('📹 Requesting media devices...');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: initialVideo,
        audio: true
      });
      setLocalStream(stream);
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      return stream;
    } catch (err) {
      console.error('Error accessing media devices:', err);
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        setLocalStream(audioStream);
        localStreamRef.current = audioStream;
        setIsCameraOff(true);
        return audioStream;
      } catch (audioErr) {
        console.error('Failed to access even audio:', audioErr);
        return null;
      }
    }
  };

  // Add tracks to a peer. Helper function to ensure consistency.
  const addTracksToPeer = (peer) => {
    const stream = localStreamRef.current;
    if (!stream) {
      console.warn('⚠️ Cannot add tracks: No local stream available in Ref');
      return;
    }
    
    console.log(`📤 Adding ${stream.getTracks().length} tracks to peer...`);
    stream.getTracks().forEach(track => {
      peer.addTrack(track, stream);
    });
  };

  const createPeer = (targetSocketId, user, isInitiator) => {
    if (peersRef.current[targetSocketId]) {
      console.warn(`⚠️ Peer for ${targetSocketId} already exists.`);
      return peersRef.current[targetSocketId];
    }

    console.log(`🤝 Creating peer connection for ${targetSocketId} (Initiator: ${isInitiator})`);
    const peer = new RTCPeerConnection(iceServers);
    peersRef.current[targetSocketId] = peer;

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('call_signal', {
          to: targetSocketId,
          signal: { type: 'ice-candidate', candidate: event.candidate }
        });
      }
    };

    peer.ontrack = (event) => {
      console.log(`📥 Received remote track from ${targetSocketId}`, event.streams);
      const [remoteStream] = event.streams;
      setRemoteStreams(prev => ({
        ...prev,
        [targetSocketId]: { stream: remoteStream, user }
      }));
    };

    peer.oniceconnectionstatechange = () => {
      console.log(`🧊 ICE State for ${targetSocketId}: ${peer.iceConnectionState}`);
    };

    // Always add local tracks
    addTracksToPeer(peer);

    if (isInitiator) {
      peer.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      }).then(offer => {
        return peer.setLocalDescription(offer);
      }).then(() => {
        console.log(`📤 Sending offer to ${targetSocketId}`);
        socket.emit('call_signal', {
          to: targetSocketId,
          signal: peer.localDescription
        });
      }).catch(err => {
        console.error('Failed to create offer:', err);
      });
    }

    return peer;
  };

  const handleUserJoined = ({ socket_id, user }) => {
    if (socket_id === socket.id) return;
    console.log(`👤 New user joined call: ${socket_id}`);
    createPeer(socket_id, user, true);
  };

  const candidateQueue = useRef({}); // { fromSocketId: [candidates] }

  const handleSignal = async ({ signal, from, user }) => {
    let peer = peersRef.current[from];

    try {
      if (signal.type === 'offer') {
        console.log(`📥 Received offer from ${from}`);
        if (!peer) peer = createPeer(from, user, false);
        await peer.setRemoteDescription(new RTCSessionDescription(signal));
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        socket.emit('call_signal', { to: from, signal: peer.localDescription });

        if (candidateQueue.current[from]) {
          console.log(`📦 Processing ${candidateQueue.current[from].length} buffered candidates for ${from}`);
          for (const candidate of candidateQueue.current[from]) {
            await peer.addIceCandidate(new RTCIceCandidate(candidate));
          }
          delete candidateQueue.current[from];
        }
      } else if (signal.type === 'answer') {
        console.log(`📥 Received answer from ${from}`);
        if (peer) await peer.setRemoteDescription(new RTCSessionDescription(signal));
      } else if (signal.type === 'ice-candidate') {
        if (peer && peer.remoteDescription) {
          await peer.addIceCandidate(new RTCIceCandidate(signal.candidate));
        } else {
          if (!candidateQueue.current[from]) candidateQueue.current[from] = [];
          candidateQueue.current[from].push(signal.candidate);
        }
      }
    } catch (err) {
      console.error('Error handling signaling:', err);
    }
  };

  const handleUserLeft = ({ socket_id }) => {
    console.log(`📵 User left call: ${socket_id}`);
    if (peersRef.current[socket_id]) {
      peersRef.current[socket_id].close();
      delete peersRef.current[socket_id];
    }
    setRemoteStreams(prev => {
      const next = { ...prev };
      delete next[socket_id];
      return next;
    });
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  const toggleCamera = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(track => {
        track.enabled = !track.enabled;
      });
      setIsCameraOff(!isCameraOff);
    }
  };

  const [isSpeaking, setIsSpeaking] = useState(false);

  // Audio analysis for local stream
  useEffect(() => {
    if (!localStream) return;
    
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(localStream);
    source.connect(analyser);
    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    let animationFrameId;
    let speakingTimeout;

    const checkLevel = () => {
      analyser.getByteFrequencyData(dataArray);
      let values = 0;
      for (let i = 0; i < bufferLength; i++) {
        values += dataArray[i];
      }
      const average = values / bufferLength;
      
      if (average > 30) { // Speech threshold
        if (!isSpeaking) setIsSpeaking(true);
        clearTimeout(speakingTimeout);
        speakingTimeout = setTimeout(() => setIsSpeaking(false), 1000);
      }
      
      animationFrameId = requestAnimationFrame(checkLevel);
    };

    checkLevel();

    return () => {
      cancelAnimationFrame(animationFrameId);
      clearTimeout(speakingTimeout);
      audioContext.close();
    };
  }, [localStream]);

  const numRemotes = Object.keys(remoteStreams).length;

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="call-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: '#05050a',
        zIndex: 2000,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      }}
    >
      {/* Dynamic Background Blur */}
      <div style={{
        position: 'absolute',
        top: '-10%',
        left: '-10%',
        width: '120%',
        height: '120%',
        background: 'radial-gradient(circle at 50% 50%, #6366f122 0%, #a855f711 50%, transparent 100%)',
        filter: 'blur(100px)',
        zIndex: -1
      }} />

      {/* Call Header */}
      <header style={{ 
        padding: '24px 40px', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        background: 'linear-gradient(to bottom, rgba(0,0,0,0.5), transparent)' 
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div className="status-indicator active" />
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, letterSpacing: '-0.02em' }}>Live Call Room</h2>
            <p style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>
              {numRemotes === 0 ? 'Waiting for others to join...' : `${numRemotes + 1} participants connected`}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="btn-icon-premium"><Users size={18} /></button>
          <button className="btn-icon-premium"><Settings size={18} /></button>
        </div>
      </header>

      {/* Main Video Stage */}
      <div style={{ 
        flex: 1, 
        padding: '20px 40px',
        display: 'grid', 
        gridTemplateColumns: numRemotes === 0 ? '1fr' : 
                             numRemotes === 1 ? '1fr 1fr' : 
                             'repeat(auto-fit, minmax(400px, 1fr))',
        gap: '24px',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        {/* Local Stream Container */}
        <AnimatePresence mode="popLayout">
          <motion.div 
            layout
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`video-stage glass-premium ${isSpeaking ? 'speaking-glow' : ''}`}
          >
            <video 
              ref={localVideoRef} 
              autoPlay 
              muted 
              playsInline 
              style={{ 
                width: '100%', 
                height: '100%', 
                objectFit: 'cover',
                transform: 'scaleX(-1)'
              }} 
            />
            {isCameraOff && (
              <div className="camera-off-overlay">
                <div className="avatar-premium">You</div>
              </div>
            )}
            <div className="video-meta">
              <span className="user-tag">You (Local)</span>
              {isMuted && <MicOff size={14} className="icon-muted" />}
            </div>
          </motion.div>

          {/* Remote Streams Containers */}
          {Object.entries(remoteStreams).map(([id, { stream, user }]) => (
            <RemoteVideo key={id} socketId={id} stream={stream} user={user} />
          ))}
        </AnimatePresence>
      </div>

      {/* Controls Bar */}
      <footer style={{ 
        padding: '40px', 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        gap: '24px',
        background: 'linear-gradient(to top, rgba(0,0,0,0.5), transparent)'
      }}>
        <button 
          onClick={toggleMute}
          className={`control-pill ${isMuted ? 'danger' : ''}`}
        >
          {isMuted ? <MicOff size={22} /> : <Mic size={22} />}
          <span>{isMuted ? 'Unmute' : 'Mute'}</span>
        </button>
        
        <button 
          onClick={toggleCamera}
          className={`control-pill ${isCameraOff ? 'danger' : ''}`}
        >
          {isCameraOff ? <VideoOff size={22} /> : <Video size={22} />}
          <span>{isCameraOff ? 'Start Video' : 'Stop Video'}</span>
        </button>

        <button 
          onClick={onLeave}
          className="control-pill hangup-pill"
        >
          <PhoneOff size={24} />
          <span>Leave</span>
        </button>
      </footer>

      <style>{`
        .glass-premium {
          background: rgba(30, 41, 59, 0.4);
          backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          box-shadow: 0 20px 50px rgba(0,0,0,0.4);
          border-radius: 24px;
          overflow: hidden;
          position: relative;
          aspect-ratio: 16/9;
          transition: border-color 0.3s ease, box-shadow 0.3s ease;
        }
        .speaking-glow {
          border-color: #6366f1 !important;
          box-shadow: 0 0 30px rgba(99, 102, 241, 0.4), 0 20px 50px rgba(0,0,0,0.4) !important;
        }
        .video-meta {
          position: absolute;
          bottom: 20px;
          left: 20px;
          right: 20px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          z-index: 10;
        }
        .user-tag {
          background: rgba(0, 10, 30, 0.6);
          backdrop-filter: blur(10px);
          padding: 6px 14px;
          border-radius: 12px;
          font-size: 0.85rem;
          font-weight: 500;
          border: 1px solid rgba(255,255,255,0.05);
        }
        .camera-off-overlay {
          position: absolute;
          top: 0; left: 0; width: 100%; height: 100%;
          background: #0a0a15;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .avatar-premium {
          width: 100px;
          height: 100px;
          border-radius: 50%;
          background: var(--accent-gradient);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2rem;
          font-weight: 700;
          box-shadow: 0 0 40px rgba(99, 102, 241, 0.3);
        }
        .control-pill {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          padding: 16px;
          min-width: 100px;
          border-radius: 20px;
          color: white;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .control-pill span {
          font-size: 0.75rem;
          font-weight: 600;
          opacity: 0.7;
        }
        .control-pill:hover {
          background: rgba(255,255,255,0.1);
          transform: translateY(-5px);
          border-color: rgba(255,255,255,0.3);
        }
        .control-pill.danger {
          background: rgba(239, 68, 68, 0.1);
          border-color: rgba(239, 68, 68, 0.2);
          color: #ef4444;
        }
        .control-pill.danger:hover {
          background: rgba(239, 68, 68, 0.2);
        }
        .hangup-pill {
          background: #ef4444 !important;
          border-color: #ef4444 !important;
          color: white !important;
          box-shadow: 0 10px 30px rgba(239, 68, 68, 0.3);
        }
        .hangup-pill:hover {
          background: #ff5555 !important;
          box-shadow: 0 15px 40px rgba(239, 68, 68, 0.5);
        }
        .status-indicator {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: #10b981;
          box-shadow: 0 0 15px #10b981;
          animation: pulse-green 2s infinite;
        }
        @keyframes pulse-green {
          0% { transform: scale(0.9); opacity: 0.6; }
          50% { transform: scale(1.1); opacity: 1; }
          100% { transform: scale(0.9); opacity: 0.6; }
        }
        .btn-icon-premium {
          background: rgba(255,255,255,0.05);
          border: 1px solid rgba(255,255,255,0.1);
          color: white;
          padding: 10px;
          border-radius: 12px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .btn-icon-premium:hover {
          background: rgba(255,255,255,0.1);
          border-color: rgba(255,255,255,0.2);
        }
        .icon-muted {
          color: #ef4444;
          filter: drop-shadow(0 0 5px rgba(239, 68, 68, 0.5));
        }
      `}</style>
    </motion.div>
  );
};

const RemoteVideo = ({ stream, user, socketId }) => {
  const videoRef = useRef();
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // Audio analysis for remote stream
  useEffect(() => {
    if (!stream) return;
    
    // Check if there is an audio track
    if (stream.getAudioTracks().length === 0) return;

    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      analyser.fftSize = 256;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      let animationFrameId;
      let speakingTimeout;

      const checkLevel = () => {
        analyser.getByteFrequencyData(dataArray);
        let values = 0;
        for (let i = 0; i < bufferLength; i++) {
          values += dataArray[i];
        }
        const average = values / bufferLength;
        
        if (average > 30) {
          if (!isSpeaking) setIsSpeaking(true);
          clearTimeout(speakingTimeout);
          speakingTimeout = setTimeout(() => setIsSpeaking(false), 1000);
        }
        
        animationFrameId = requestAnimationFrame(checkLevel);
      };

      checkLevel();

      return () => {
        cancelAnimationFrame(animationFrameId);
        clearTimeout(speakingTimeout);
        audioContext.close();
      };
    } catch (err) {
      console.warn("Audio analysis blocked or failed for remote stream:", err);
    }
  }, [stream]);

  return (
    <motion.div 
      layout
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className={`video-stage glass-premium ${isSpeaking ? 'speaking-glow' : ''}`}
    >
      <video 
        ref={videoRef} 
        autoPlay 
        playsInline 
        style={{ 
          width: '100%', 
          height: '100%', 
          objectFit: 'cover' 
        }} 
      />
      <div className="video-meta">
        <span className="user-tag">{user?.name || 'Guest'}</span>
      </div>
    </motion.div>
  );
};

export default CallOverlay;
