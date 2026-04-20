import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Mic, MicOff, Video, VideoOff, PhoneOff, 
  Maximize2, Users, Settings 
} from 'lucide-react';
import { useSocket } from '../context/SocketContext';

const CallOverlay = ({ roomId, onLeave, initialVideo = true }) => {
  const socket = useSocket();
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({}); 
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(!initialVideo);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  
  const localVideoRef = useRef();
  const localStreamRef = useRef(null);
  const peersRef = useRef({});
  const screenStreamRef = useRef(null);
  const isInitializing = useRef(false);
  const hasJoinedCall = useRef(false);

  const iceServers = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ]
  };

  useEffect(() => {
    const init = async () => {
      if (isInitializing.current || hasJoinedCall.current) return;
      isInitializing.current = true;
      
      try {
        await new Promise(resolve => setTimeout(resolve, 500));
        const stream = await startLocalStream();
        
        if (stream && !hasJoinedCall.current) {
          hasJoinedCall.current = true;
          console.log('📡 [Call] Joining room:', roomId);
          socket.emit('join_call', { room_id: roomId });
        }
      } catch (err) {
        console.error('[Call] Init failed:', err);
      } finally {
        isInitializing.current = false;
      }
    };

    init();

    socket.on('user_joined_call', handleUserJoined);
    socket.on('call_signal', handleSignal);
    socket.on('user_left_call', handleUserLeft);

    return () => {
      console.log('🚮 [Call] Cleaning up...');
      socket.emit('leave_call', { room_id: roomId });
      socket.off('user_joined_call');
      socket.off('call_signal');
      socket.off('user_left_call');
      
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      if (screenStreamRef.current) {
        screenStreamRef.current.getTracks().forEach(track => track.stop());
      }
      Object.values(peersRef.current).forEach(peer => peer.close());
    };
  }, [socket, roomId]);

  const startLocalStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: initialVideo,
        audio: true
      });
      setLocalStream(stream);
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      return stream;
    } catch (err) {
      console.warn('[Call] Camera access failed, falling back to audio:', err);
      try {
        const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true });
        setLocalStream(audioOnly);
        localStreamRef.current = audioOnly;
        setIsCameraOff(true);
        return audioOnly;
      } catch (audioErr) {
        console.error('[Call] Mic access failed too:', audioErr);
        return null;
      }
    }
  };

  const createPeer = (targetSocketId, user, isInitiator) => {
    if (peersRef.current[targetSocketId]) return peersRef.current[targetSocketId];

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
      const [remoteStream] = event.streams;
      setRemoteStreams(prev => ({
        ...prev,
        [targetSocketId]: { stream: remoteStream, user }
      }));
    };

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        peer.addTrack(track, localStreamRef.current);
      });
    }

    if (isInitiator) {
      peer.createOffer().then(offer => {
        return peer.setLocalDescription(offer);
      }).then(() => {
        socket.emit('call_signal', {
          to: targetSocketId,
          signal: peer.localDescription
        });
      });
    }

    return peer;
  };

  const handleUserJoined = ({ socket_id, user }) => {
    if (socket_id === socket.id) return;
    const isInitiator = socket.id > socket_id;
    console.log(`👤 User joined cal: ${socket_id}. I am initiator: ${isInitiator}`);
    createPeer(socket_id, user, isInitiator);
  };

  const handleSignal = async ({ signal, from, user }) => {
    let peer = peersRef.current[from];
    if (signal.type === 'offer') {
      if (!peer) peer = createPeer(from, user, false);
      await peer.setRemoteDescription(new RTCSessionDescription(signal));
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      socket.emit('call_signal', { to: from, signal: peer.localDescription });
    } else if (signal.type === 'answer') {
      if (peer) await peer.setRemoteDescription(new RTCSessionDescription(signal));
    } else if (signal.type === 'ice-candidate') {
      if (peer && peer.remoteDescription) {
        await peer.addIceCandidate(new RTCIceCandidate(signal.candidate));
      }
    }
  };

  const handleUserLeft = ({ socket_id }) => {
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
      const state = !isMuted;
      localStreamRef.current.getAudioTracks().forEach(t => t.enabled = !state);
      setIsMuted(state);
    }
  };

  const toggleCamera = () => {
    if (localStreamRef.current && !isScreenSharing) {
      const state = !isCameraOff;
      localStreamRef.current.getVideoTracks().forEach(t => t.enabled = !state);
      setIsCameraOff(state);
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
          if (sender) sender.replaceTrack(track);
          else peer.addTrack(track, stream);
        });

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
          localVideoRef.current.style.transform = 'none';
        }
        setIsScreenSharing(true);
        track.onended = () => stopScreenShare();
      } catch (err) {
        console.error('Screen share failed:', err);
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

  const remotesCount = Object.keys(remoteStreams).length;

  return (
    <div className="call-root-wrapper">
      <header className="call-header">
        <div className="header-info">
          <div className="pulse-dot" />
          <div>
            <h1>Live Call Room</h1>
            <span className="room-subtext">{remotesCount === 0 ? 'Waitng for others...' : `${remotesCount + 1} participants connected`}</span>
          </div>
        </div>
      </header>

      <main className="video-grid-container">
        <div className="video-grid">
          <div className={`video-container local ${isSpeaking ? 'active-speaker' : ''} ${isScreenSharing ? 'is-sharing' : ''}`}>
            <video ref={localVideoRef} autoPlay muted playsInline />
            {isCameraOff && !isScreenSharing && (
              <div className="camera-off-placeholder">
                <div className="user-avatar">You</div>
              </div>
            )}
            <div className="participant-label">
              {isScreenSharing ? 'You (Screen)' : 'You'} {isMuted && <MicOff size={12} />}
            </div>
          </div>

          {Object.entries(remoteStreams).map(([id, data]) => (
            <RemoteVideo key={id} socketId={id} stream={data.stream} user={data.user} />
          ))}
        </div>
      </main>

      <footer className="call-controls">
        <div className="controls-inner">
          <button onClick={toggleMute} className={`action-btn ${isMuted ? 'muted' : ''}`}>
            {isMuted ? <MicOff /> : <Mic />}
            <label>{isMuted ? 'Mute' : 'Unmute'}</label>
          </button>

          <button 
            onClick={toggleCamera} 
            disabled={isScreenSharing} 
            className={`action-btn ${isCameraOff ? 'camera-off' : ''}`}
          >
            {isCameraOff ? <VideoOff /> : <Video />}
            <label>Camera</label>
          </button>

          <button 
            onClick={toggleScreenShare} 
            className={`action-btn ${isScreenSharing ? 'sharing' : ''}`}
          >
            <Maximize2 />
            <label>Share</label>
          </button>

          <button onClick={onLeave} className="action-btn end-call">
            <PhoneOff />
            <label>End</label>
          </button>
        </div>
      </footer>

      <style>{`
        .call-root-wrapper {
          position: fixed; inset: 0; height: 100dvh; background: #020205; z-index: 9999;
          display: flex; flex-direction: column; color: white; overflow: hidden;
        }
        .call-header { padding: 16px 32px; background: rgba(0,0,0,0.4); flex-shrink: 0; display: flex; align-items: center; }
        .header-info { display: flex; gap: 12px; align-items: center; }
        .header-info h1 { font-size: 1rem; margin: 0; font-weight: 600; }
        .room-subtext { font-size: 0.7rem; color: #94a3b8; }
        .pulse-dot { width: 8px; height: 8px; border-radius: 50%; background: #10b981; animation: pulse 2s infinite; }
        @keyframes pulse { 0% { opacity: 0.4; } 50% { opacity: 1; } 100% { opacity: 0.4; } }
        
        .video-grid-container {
          flex: 1; overflow-y: auto; display: flex; align-items: center; padding: 20px;
        }
        .video-grid {
          display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 20px; max-width: 1200px; width: 100%; margin: 0 auto;
        }
        .video-container {
          background: #0f172a; border-radius: 16px; overflow: hidden; aspect-ratio: 16/9;
          position: relative; border: 1px solid rgba(255,255,255,0.08);
        }
        .video-container video { width: 100%; height: 100%; object-fit: cover; }
        .video-container.local video { transform: scaleX(-1); }
        .video-container.is-sharing video { transform: none; object-fit: contain; background: black; }
        .active-speaker { border-color: #6366f1; box-shadow: 0 0 15px #6366f166; }
        
        .participant-label {
          position: absolute; bottom: 10px; left: 10px; background: rgba(0,0,0,0.4);
          padding: 4px 10px; border-radius: 6px; font-size: 0.7rem; backdrop-filter: blur(4px);
        }

        .camera-off-placeholder {
          position: absolute; inset: 0; background: #0f172a;
          display: flex; align-items: center; justify-content: center;
        }
        .user-avatar {
          width: 60px; height: 60px; border-radius: 50%; background: #6366f1;
          display: flex; align-items: center; justify-content: center; font-weight: bold;
        }

        .call-controls {
          padding: 24px; background: rgba(0,0,0,0.6); flex-shrink: 0;
          display: flex; justify-content: center;
        }
        .controls-inner { display: flex; gap: 12px; }
        .action-btn {
          width: 60px; height: 60px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.1);
          background: rgba(255,255,255,0.05); color: white; cursor: pointer;
          display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
          transition: all 0.2s;
        }
        .action-btn:hover { background: rgba(255,255,255,0.12); transform: translateY(-2px); }
        .action-btn label { font-size: 0.55rem; font-weight: 600; text-transform: uppercase; }
        .action-btn.muted, .action-btn.camera-off { color: #ef4444; background: rgba(239,68,68,0.1); }
        .action-btn.sharing { color: #10b981; background: rgba(16,185,129,0.1); }
        .action-btn.end-call { background: #ef4444; border: none; width: 70px; }
        .action-btn.end-call:hover { background: #dc2626; }
      `}</style>
    </div>
  );
};

const RemoteVideo = ({ stream, user, socketId }) => {
  const videoRef = useRef();
  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream]);

  return (
    <div className="video-container">
      <video ref={videoRef} autoPlay playsInline />
      <div className="participant-label">{user?.name || 'Guest'}</div>
    </div>
  );
};

export default CallOverlay;
