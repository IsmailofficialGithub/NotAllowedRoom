import React, { useEffect, useRef, useState, useMemo } from 'react';
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
  const [participantOrder, setParticipantOrder] = useState(['local']);
  const [isMuted, setIsMuted] = useState(initialMuted);
  const [isCameraOff, setIsCameraOff] = useState(!initialVideo);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [localIsSpeaking, setLocalIsSpeaking] = useState(false);
  const [remoteAudioSpeaks, setRemoteAudioSpeaks] = useState({}); // { socketId: boolean }
  const [devices, setDevices] = useState({ video: [], audio: [] });
  const [selectedDevices, setSelectedDevices] = useState({ videoId: '', audioId: '' });
  const [showSettings, setShowSettings] = useState(false);

  const localVideoRef = useRef();
  const localStreamRef = useRef(null);
  const peersRef = useRef({});
  const screenStreamRef = useRef(null);
  const isInitializing = useRef(false);
  const hasJoinedCall = useRef(false);
  const makingOfferRef = useRef({});
  const ignoreOfferRef = useRef({});
  const containerRef = useRef(null);
  const itemRefs = useRef({});

  // Sync participant list with order
  useEffect(() => {
    const remoteIds = Object.keys(callParticipants);
    setParticipantOrder(prev => {
      const newOrder = prev.filter(id => id === 'local' || remoteIds.includes(id));
      remoteIds.forEach(id => {
        if (!newOrder.includes(id)) newOrder.push(id);
      });
      return [...newOrder];
    });
  }, [callParticipants]);

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
          socket.on('user_joined_call', handleUserJoined);
          socket.on('current_participants', handleCurrentParticipants);
          socket.on('call_signal', handleSignal);
          socket.on('user_left_call', handleUserLeft);
          socket.emit('join_call', { room_id: roomId });
          socket.on('user_toggle_media', ({ socket_id, type, status }) => {
            setCallParticipants(prev => {
              const user = prev[socket_id];
              if (!user) return prev;
              return { ...prev, [socket_id]: { ...user, [type === 'mic' ? 'isMuted' : 'isCameraOff']: !status } };
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
      if (localStreamRef.current) localStreamRef.current.getTracks().forEach(track => track.stop());
      if (screenStreamRef.current) screenStreamRef.current.getTracks().forEach(track => track.stop());
      Object.values(peersRef.current).forEach(peer => peer.close());
      hasJoinedCall.current = false;
      isInitializing.current = false;
    };
  }, [socket, socket?.connected, socket?.id, roomId, isRoomJoined]);

  // Fetch available devices
  useEffect(() => {
    const getDevices = async () => {
      try {
        const devs = await navigator.mediaDevices.enumerateDevices();
        const video = devs.filter(d => d.kind === 'videoinput');
        const audio = devs.filter(d => d.kind === 'audioinput');
        setDevices({ video, audio });

        // Auto-select first devices if not set
        setSelectedDevices(prev => ({
          videoId: prev.videoId || (video[0]?.deviceId || ''),
          audioId: prev.audioId || (audio[0]?.deviceId || '')
        }));
      } catch (err) { console.error('Error fetching devices:', err); }
    };
    getDevices();
    navigator.mediaDevices.addEventListener('devicechange', getDevices);
    return () => navigator.mediaDevices.removeEventListener('devicechange', getDevices);
  }, []);

  const changeDevice = async (type, deviceId) => {
    if (!localStreamRef.current) return;

    try {
      const constraints = {
        video: type === 'video' ? { deviceId: { exact: deviceId }, width: 1280, height: 720 } : (selectedDevices.videoId ? { deviceId: { exact: selectedDevices.videoId } } : true),
        audio: type === 'audio' ? { deviceId: { exact: deviceId } } : (selectedDevices.audioId ? { deviceId: { exact: selectedDevices.audioId } } : true)
      };

      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      const newTrack = type === 'video' ? newStream.getVideoTracks()[0] : newStream.getAudioTracks()[0];
      const oldTracks = type === 'video' ? localStreamRef.current.getVideoTracks() : localStreamRef.current.getAudioTracks();

      // Replace in local stream
      oldTracks.forEach(t => {
        localStreamRef.current.removeTrack(t);
        t.stop();
      });
      localStreamRef.current.addTrack(newTrack);

      // Replace in all peer connections
      Object.values(peersRef.current).forEach(peer => {
        const sender = peer.getSenders().find(s => s.track?.kind === type);
        if (sender) sender.replaceTrack(newTrack);
      });

      if (type === 'video' && localVideoRef.current && !isScreenSharing) {
        localVideoRef.current.srcObject = localStreamRef.current;
      }

      setSelectedDevices(prev => ({ ...prev, [type === 'video' ? 'videoId' : 'audioId']: deviceId }));
      if (type === 'video') setIsCameraOff(false);
      else setIsMuted(false);

    } catch (err) {
      console.error('Failed to change device:', err);
    }
  };

  // Handle local speaking highlight
  useEffect(() => {
    if (!localStream || isMuted) { setLocalIsSpeaking(false); return; }
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(localStream);
    source.connect(analyser); analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    let animationId;
    let lastSpeaking = false;
    const checkVolume = () => {
      analyser.getByteFrequencyData(dataArray);
      let sum = 0; for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
      const average = sum / bufferLength;
      const speaking = average > 30;
      if (speaking !== lastSpeaking) { lastSpeaking = speaking; setLocalIsSpeaking(speaking); }
      animationId = requestAnimationFrame(checkVolume);
    };
    checkVolume();
    return () => { cancelAnimationFrame(animationId); audioContext.close(); };
  }, [localStream, isMuted]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.play().catch(e => console.error('Video play failed:', e));
    }
  }, [localStream]);

  const startLocalStream = async () => {
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach(track => track.stop());
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: initialVideo ? { width: 1280, height: 720 } : false, audio: true
      });
      if (initialMuted) stream.getAudioTracks().forEach(track => track.enabled = false);
      if (!initialVideo) stream.getVideoTracks().forEach(track => track.enabled = false);
      setLocalStream(stream); localStreamRef.current = stream; return stream;
    } catch (err) {
      try {
        const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true });
        setLocalStream(audioOnly); localStreamRef.current = audioOnly; setIsCameraOff(true); return audioOnly;
      } catch (audioErr) { return null; }
    }
  };

  const createPeer = (targetSocketId, user, isInitiator) => {
    if (peersRef.current[targetSocketId]) return peersRef.current[targetSocketId];
    const peer = new RTCPeerConnection(iceServers);
    peersRef.current[targetSocketId] = peer;
    makingOfferRef.current[targetSocketId] = false;
    ignoreOfferRef.current[targetSocketId] = false;
    peer.onicecandidate = (event) => {
      if (event.candidate) socket.emit('call_signal', { to: targetSocketId, signal: { type: 'ice-candidate', candidate: event.candidate } });
    };
    peer.ontrack = (event) => {
      const [remoteStream] = event.streams;
      setRemoteStreams(prev => ({ ...prev, [targetSocketId]: { stream: remoteStream, user } }));
    };
    peer.onnegotiationneeded = async () => {
      try {
        if (makingOfferRef.current[targetSocketId] || peer.signalingState !== 'stable') return;
        makingOfferRef.current[targetSocketId] = true;
        await peer.setLocalDescription();
        socket.emit('call_signal', { to: targetSocketId, signal: peer.localDescription });
      } catch (err) { console.error(`[WebRTC] Negotiation failed:`, err); } finally { makingOfferRef.current[targetSocketId] = false; }
    };
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach(track => peer.addTrack(track, localStreamRef.current));
    return peer;
  };

  const handleUserJoined = ({ socket_id, user }) => {
    if (socket_id === socket.id) return;
    setCallParticipants(prev => ({ ...prev, [socket_id]: user }));
    createPeer(socket_id, user, true);
  };

  const handleCurrentParticipants = ({ participants }) => {
    const newParticipants = {};
    participants.forEach(({ socket_id, user }) => {
      if (socket_id !== socket.id) {
        newParticipants[socket_id] = user; createPeer(socket_id, user, true);
      }
    });
    setCallParticipants(prev => ({ ...prev, ...newParticipants }));
  };

  const handleSignal = async ({ signal, from, user }) => {
    let peer = peersRef.current[from];
    if (!peer) peer = createPeer(from, user, false);
    try {
      if (signal.type === 'offer') {
        const polite = socket.id > from;
        const offerCollision = (makingOfferRef.current[from] || peer.signalingState !== 'stable');
        ignoreOfferRef.current[from] = !polite && offerCollision;
        if (ignoreOfferRef.current[from]) return;
        await peer.setRemoteDescription(new RTCSessionDescription(signal));
        await peer.setLocalDescription();
        socket.emit('call_signal', { to: from, signal: peer.localDescription });
      } else if (signal.type === 'answer') {
        if (peer.signalingState === 'have-local-offer') {
          await peer.setRemoteDescription(new RTCSessionDescription(signal));
        }
      } else if (signal.type === 'ice-candidate' && signal.candidate) {
        try {
          if (peer.remoteDescription) {
            await peer.addIceCandidate(new RTCIceCandidate(signal.candidate));
          }
        } catch (err) { if (!ignoreOfferRef.current[from]) console.warn(`[WebRTC] ICE error:`, err); }
      }
    } catch (err) { console.error(`[WebRTC] Signaling error:`, err); }
  };

  const handleUserLeft = ({ socket_id }) => {
    if (peersRef.current[socket_id]) { peersRef.current[socket_id].close(); delete peersRef.current[socket_id]; }
    setCallParticipants(prev => { const next = { ...prev }; delete next[socket_id]; return next; });
    setRemoteStreams(prev => { const next = { ...prev }; delete next[socket_id]; return next; });
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
          if (sender) sender.replaceTrack(track); else peer.addTrack(track, stream);
        });
        if (localVideoRef.current) { localVideoRef.current.srcObject = stream; localVideoRef.current.style.transform = 'none'; }
        setIsScreenSharing(true);
        track.onended = () => stopScreenShare();
      } catch (err) { console.error('Screen sharing failed:', err); }
    } else { stopScreenShare(); }
  };

  const stopScreenShare = () => {
    if (screenStreamRef.current) { screenStreamRef.current.getTracks().forEach(t => t.stop()); screenStreamRef.current = null; }
    const camTrack = localStreamRef.current?.getVideoTracks()[0];
    Object.values(peersRef.current).forEach(peer => {
      const sender = peer.getSenders().find(s => s.track?.kind === 'video');
      if (sender && camTrack) sender.replaceTrack(camTrack);
    });
    if (localVideoRef.current && localStreamRef.current) { localVideoRef.current.srcObject = localStreamRef.current; localVideoRef.current.style.transform = 'scaleX(-1)'; }
    setIsScreenSharing(false);
  };

  const handleLeave = () => { if (localStreamRef.current) localStreamRef.current.getTracks().forEach(track => track.stop()); onLeave(); };

  // 🛠 Rigid Grid Reorder Logic
  const handleDragUpdate = (event, info, draggedId) => {
    const centerX = info.point.x;
    const centerY = info.point.y;

    const targetId = participantOrder.find(id => {
      if (id === draggedId) return false;
      const rect = itemRefs.current[id]?.getBoundingClientRect();
      if (!rect) return false;
      return centerX > rect.left && centerX < rect.right && centerY > rect.top && centerY < rect.bottom;
    });

    if (targetId) {
      const oldIndex = participantOrder.indexOf(draggedId);
      const newIndex = participantOrder.indexOf(targetId);
      if (oldIndex !== newIndex) {
        const newOrder = [...participantOrder];
        newOrder.splice(oldIndex, 1);
        newOrder.splice(newIndex, 0, draggedId);
        setParticipantOrder(newOrder);
      }
    }
  };

  const remotesCount = Object.keys(callParticipants).length;
  const totalParticipants = remotesCount + 1;
  const getGridClass = () => {
    if (totalParticipants === 1) return 'grid-1';
    if (totalParticipants === 2) return 'grid-2';
    if (totalParticipants <= 4) return 'grid-4';
    return 'grid-more';
  };

  return (
    <div className="call-root-wrapper">
      <header className="call-header">
        <div className="header-info">
          <div className="pulse-dot" />
          <div>
            <h1>Live Conference</h1>
            <span className="room-subtext">{remotesCount === 0 ? 'Waiting for others...' : `${totalParticipants} participants in call`}</span>
          </div>
        </div>
      </header>

      <main className="video-grid-container" ref={containerRef}>
        <div className={`video-grid ${getGridClass()}`}>
          {participantOrder.map((id) => {
            const isLocal = id === 'local';
            const user = isLocal ? null : callParticipants[id];
            if (!isLocal && !user) return null;

            return (
              <motion.div
                key={id}
                layout
                drag
                dragConstraints={containerRef}
                dragSnapToOrigin={true}
                dragElastic={0.01} // Very rigid drag
                onDrag={(e, info) => handleDragUpdate(e, info, id)}
                whileDrag={{ zIndex: 50, scale: 0.95, opacity: 0.8 }}
                ref={el => itemRefs.current[id] = el}
                className={`video-container ${isLocal ? 'local' : ''} ${isLocal && localIsSpeaking ? 'active-speaker' : (!isLocal && remoteAudioSpeaks[id] ? 'active-speaker' : '')} ${isLocal && isScreenSharing ? 'is-sharing' : ''}`}
                style={{ cursor: 'grab' }}
              >
                {isLocal ? (
                  <>
                    <video ref={localVideoRef} autoPlay muted playsInline />
                    {isCameraOff && !isScreenSharing && (
                      <div className="camera-off-placeholder">
                        <div className="user-avatar">You</div>
                      </div>
                    )}
                    <div className="participant-label">
                      {isScreenSharing ? 'You (Screen)' : 'You'} {isMuted && <MicOff size={10} />}
                    </div>
                  </>
                ) : (
                  <RemoteVideo
                    socketId={id}
                    stream={remoteStreams[id]?.stream}
                    user={user}
                    onSpeaking={(speaking) => setRemoteAudioSpeaks(prev => speaking === prev[id] ? prev : ({ ...prev, [id]: speaking }))}
                  />
                )}
              </motion.div>
            );
          })}
        </div>
      </main>

      <footer className="call-controls">
        <div className="controls-inner">
          <button onClick={toggleMute} className={`action-btn ${isMuted ? 'muted' : ''}`}><MicOff /><label>Mute</label></button>
          <button onClick={toggleCamera} disabled={isScreenSharing} className={`action-btn ${isCameraOff ? 'camera-off' : ''}`}><VideoOff /><label>Camera</label></button>
          <button onClick={toggleScreenShare} className={`action-btn ${isScreenSharing ? 'sharing' : ''}`}><Maximize2 /><label>Share</label></button>
          <button onClick={() => setShowSettings(!showSettings)} className={`action-btn ${showSettings ? 'active' : ''}`}><Settings /><label>Settings</label></button>
          <button onClick={handleLeave} className="action-btn end-call"><PhoneOff /><label>End</label></button>
        </div>
      </footer>

      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="settings-modal"
          >
            <div className="settings-content">
              <h3>Device Settings</h3>
              <div className="setting-group">
                <label><Video size={16} /> Camera</label>
                <select
                  value={selectedDevices.videoId}
                  onChange={(e) => changeDevice('video', e.target.value)}
                >
                  {devices.video.map(d => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label || 'Camera ' + d.deviceId.slice(0, 5)}</option>
                  ))}
                </select>
              </div>
              <div className="setting-group">
                <label><Mic size={16} /> Microphone</label>
                <select
                  value={selectedDevices.audioId}
                  onChange={(e) => changeDevice('audio', e.target.value)}
                >
                  {devices.audio.map(d => (
                    <option key={d.deviceId} value={d.deviceId}>{d.label || 'Mic ' + d.deviceId.slice(0, 5)}</option>
                  ))}
                </select>
              </div>
              <button className="close-settings" onClick={() => setShowSettings(false)}>Done</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .settings-modal { position: absolute; bottom: 120px; left: 50%; transform: translateX(-50%); z-index: 1000; width: 320px; background: rgba(15, 23, 42, 0.9); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.1); border-radius: 24px; padding: 24px; box-shadow: 0 20px 50px rgba(0,0,0,0.5); }
        .settings-content h3 { margin: 0 0 20px 0; font-size: 1rem; color: #f8fafc; font-weight: 700; }
        .setting-group { margin-bottom: 16px; display: flex; flex-direction: column; gap: 8px; }
        .setting-group label { font-size: 0.75rem; color: #94a3b8; font-weight: 600; display: flex; align-items: center; gap: 6px; }
        .setting-group select { 
          background: #1e293b url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E") no-repeat right 12px center;
          border: 1px solid rgba(255,255,255,0.1); 
          border-radius: 12px; 
          color: white; 
          padding: 12px; 
          padding-right: 40px; 
          font-size: 0.85rem; 
          outline: none; 
          transition: 0.3s; 
          width: 100%; 
          cursor: pointer; 
          -webkit-appearance: none; 
          -moz-appearance: none; 
          appearance: none; 
        }
        .setting-group select option { background: #0f172a; color: white; padding: 10px; }
        .setting-group select:focus { border-color: #6366f1; box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2); }
        .close-settings { width: 100%; padding: 14px; background: #6366f1; border: none; border-radius: 14px; color: white; font-weight: 700; font-size: 0.9rem; cursor: pointer; margin-top: 10px; transition: 0.3s; }
        .close-settings:hover { background: #4f46e5; transform: scale(1.02); }
        .action-btn.active { background: rgba(99, 102, 241, 0.2); border-color: #6366f1; color: #6366f1; }
        
        .call-root-wrapper { position: fixed; inset: 0; height: 100dvh; background: #050508; z-index: 9999; display: flex; flex-direction: column; color: white; overflow: hidden; font-family: 'Inter', sans-serif; }
        .call-header { padding: 12px 30px; background: rgba(0,0,0,0.6); flex-shrink: 0; display: flex; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .header-info { display: flex; gap: 10px; align-items: center; }
        .header-info h1 { font-size: 0.95rem; margin: 0; font-weight: 600; letter-spacing: -0.01em; }
        .room-subtext { font-size: 0.65rem; color: #64748b; font-weight: 500; }
        .pulse-dot { width: 6px; height: 6px; border-radius: 50%; background: #10b981; box-shadow: 0 0 10px #10b981; animation: pulse 2s infinite; }
        @keyframes pulse { 0% { opacity: 0.4; transform: scale(0.9); } 50% { opacity: 1; transform: scale(1.1); } 100% { opacity: 0.4; transform: scale(0.9); } }
        .video-grid-container { flex: 1; overflow: hidden; display: flex; align-items: center; justify-content: center; padding: 20px; position: relative; }
        .video-grid { display: grid; gap: 16px; width: 100%; height: 100%; max-width: none; margin: 0; }
        .video-grid.grid-1 { grid-template-columns: 1fr; }
        .video-grid.grid-2 { grid-template-columns: 1fr 1fr; }
        .video-grid.grid-4 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
        .video-grid.grid-more { grid-template-columns: repeat(auto-fit, minmax(30%, 1fr)); }
        .video-container { background: #0f172a; border-radius: 20px; overflow: hidden; position: relative; border: 2px solid rgba(255,255,255,0.05); transition: border-color 0.3s; background-image: radial-gradient(circle at center, #1e293b 0%, #0f172a 100%); cursor: grab; touch-action: none; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; transform-origin: center; box-shadow: 0 10px 40px rgba(0,0,0,0.6); }
        .video-container video { width: 100%; height: 100%; object-fit: cover; border-radius: 18px; }
        .video-container.local video { transform: scaleX(-1); }
        .active-speaker { border-color: #6366f1 !important; box-shadow: 0 0 40px rgba(99, 102, 241, 0.5); }
        .participant-label { position: absolute; bottom: 15px; left: 15px; background: rgba(15, 23, 42, 0.8); padding: 6px 14px; border-radius: 10px; font-size: 0.75rem; backdrop-filter: blur(12px); display: flex; align-items: center; gap: 8px; font-weight: 600; border: 1px solid rgba(255,255,255,0.1); }
        .camera-off-placeholder { position: absolute; inset: 0; background: #0f172a; display: flex; align-items: center; justify-content: center; }
        .user-avatar { width: 100px; height: 100px; border-radius: 50%; background: linear-gradient(135deg, #6366f1, #a855f7); display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 2.5rem; box-shadow: 0 15px 35px rgba(0,0,0,0.7); border: 4px solid rgba(255,255,255,0.2); }
        .call-controls { padding: 40px; background: linear-gradient(transparent, rgba(0,0,0,0.98)); flex-shrink: 0; display: flex; justify-content: center; }
        .controls-inner { display: flex; gap: 20px; background: rgba(15, 23, 42, 0.95); padding: 16px 32px; border-radius: 28px; border: 1px solid rgba(255,255,255,0.12); backdrop-filter: blur(30px); }
        .action-btn { width: 64px; height: 64px; border-radius: 18px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.05); color: white; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; transition: all 0.3s; }
        .action-btn:hover { background: rgba(255,255,255,0.15); transform: translateY(-4px); }
        .action-btn label { font-size: 0.6rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.8; }
        .action-btn.muted, .action-btn.camera-off { color: #f87171; background: rgba(239,68,68,0.2); border-color: rgba(239,68,68,0.3); }
        .action-btn.sharing { color: #34d399; background: rgba(16,185,129,0.2); border-color: rgba(16,185,129,0.3); }
        .action-btn.end-call { background: #ef4444; border: none; width: 80px; }
        @media (max-width: 900px) { .video-container { aspect-ratio: 1/1; height: auto; } }
      `}</style>
    </div>
  );
};

const RemoteVideo = ({ stream, user, socketId, onSpeaking }) => {
  const videoRef = useRef();
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [, forceUpdate] = useState({});

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
      const handleAddTrack = () => { videoRef.current.srcObject = null; videoRef.current.srcObject = stream; forceUpdate({}); };
      stream.addEventListener('addtrack', handleAddTrack);
      return () => stream.removeEventListener('addtrack', handleAddTrack);
    }
  }, [stream]);

  useEffect(() => {
    if (!stream) return;
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser); analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    let animationId;
    let lastSpeaking = false;
    const checkVolume = () => {
      analyser.getByteFrequencyData(dataArray);
      let sum = 0; for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
      const average = sum / bufferLength;
      const speaking = average > 30;
      if (speaking !== lastSpeaking) { lastSpeaking = speaking; setIsSpeaking(speaking); if (onSpeaking) onSpeaking(speaking); }
      animationId = requestAnimationFrame(checkVolume);
    };
    checkVolume();
    return () => { cancelAnimationFrame(animationId); audioContext.close(); };
  }, [stream, onSpeaking]);

  return (
    <>
      {stream ? <video ref={videoRef} autoPlay playsInline /> : (
        <div className="camera-off-placeholder">
          <div className="user-avatar" style={{ fontSize: '1rem' }}>{user?.name?.slice(0, 2).toUpperCase() || '...'}</div>
          <div style={{ position: 'absolute', bottom: '40px', fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600 }}>CONNECTING...</div>
        </div>
      )}
      <div className="participant-label">{user?.name || 'Guest'} {user?.isMuted && <MicOff size={10} style={{ color: '#ef4444' }} />}</div>
    </>
  );
};

export default CallOverlay;
