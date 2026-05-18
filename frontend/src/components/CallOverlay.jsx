import React, { useEffect, useRef, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import EmojiPicker from 'emoji-picker-react';
import { 
  Mic, MicOff, Video, VideoOff, PhoneOff, 
  Maximize2, Settings, Volume2, MessageSquare, X, Send, Smile
} from 'lucide-react';
import { useSocket } from '../context/SocketContext';

const CallOverlay = ({
  roomId,
  isRoomJoined,
  onLeave,
  onEndCall,
  initialVideo = true,
  initialMuted = false,
  messages = [],
  currentUser,
  token,
  guestId,
  chatInput = '',
  setChatInput,
  onSendMessage
}) => {
  const socket = useSocket();
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({}); 
  const [callParticipants, setCallParticipants] = useState({}); // { socketId: user }
  const [participantOrder, setParticipantOrder] = useState(['local']);
  const [isMuted, setIsMuted] = useState(initialMuted);
  const [isCameraOff, setIsCameraOff] = useState(!initialVideo);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [localIsSpeaking, setLocalIsSpeaking] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [remoteAudioSpeaks, setRemoteAudioSpeaks] = useState({}); // { socketId: boolean }
  const [devices, setDevices] = useState({ video: [], audio: [] });
  const [selectedDevices, setSelectedDevices] = useState({ videoId: '', audioId: '' });
  const [showSettings, setShowSettings] = useState(false);
  const [isJoined, setIsJoined] = useState(false); // Lobby state
  const [openDeviceMenu, setOpenDeviceMenu] = useState(null);
  const [showChat, setShowChat] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  
  const localVideoRef = useRef();
  const localStreamRef = useRef(null);
  const peersRef = useRef({});
  const screenStreamRef = useRef(null);
  const isInitializing = useRef(false);
  const hasJoinedCall = useRef(false);
  const makingOfferRef = useRef({});
  const ignoreOfferRef = useRef({});
  const iceCandidatesQueue = useRef({}); // { socketId: [candidates] }
  const containerRef = useRef(null);
  const itemRefs = useRef({});

  // Fetch available devices
  useEffect(() => {
    const getDevices = async () => {
      try {
        const devs = await navigator.mediaDevices.enumerateDevices();
        const video = devs.filter(d => d.kind === 'videoinput');
        const audio = devs.filter(d => d.kind === 'audioinput');
        setDevices({ video, audio });
        
        setSelectedDevices(prev => ({
          videoId: prev.videoId || (video[0]?.deviceId || ''),
          audioId: prev.audioId || (audio[0]?.deviceId || '')
        }));
      } catch (err) { console.error('Error fetching devices:', err); }
    };
    getDevices();
    navigator.mediaDevices.addEventListener('devicechange', getDevices);

    // Initial stream for lobby preview
    const startPreview = async () => {
      try {
        const isMobile = window.matchMedia('(max-width: 800px)').matches;
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: isMobile ? 720 : 960 },
            height: { ideal: isMobile ? 960 : 720 },
            aspectRatio: { ideal: isMobile ? 0.75 : 1.333333333 }
          },
          audio: true
        });
        setLocalStream(stream);
        localStreamRef.current = stream;
        if (initialMuted) stream.getAudioTracks().forEach(t => t.enabled = false);
        if (!initialVideo) {
          stream.getVideoTracks().forEach(t => t.enabled = false);
          setIsCameraOff(true);
        }
      } catch (e) { console.error('Preview failed:', e); }
    };
    startPreview();

    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', getDevices);
      if (localStreamRef.current && !isJoined) {
        localStreamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // Main call initialization (runs after Join Now)
  useEffect(() => {
    if (!socket?.connected || !socket?.id || !isRoomJoined || !isJoined) return;

    const init = async () => {
      if (isInitializing.current || hasJoinedCall.current || !socket.id) return;
      isInitializing.current = true;
      
      try {
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
      Object.values(peersRef.current).forEach(peer => peer.close());
      hasJoinedCall.current = false;
    };
  }, [socket, socket?.connected, socket?.id, roomId, isRoomJoined, isJoined]);

  // Audio Logic with change guards
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
      setMicLevel(Math.min(100, Math.floor(average * 1.5)));

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
  }, [localStream, isJoined]);

  const changeDevice = async (type, deviceId) => {
    try {
      const isMobile = window.matchMedia('(max-width: 800px)').matches;
      const constraints = {
        video: type === 'video'
          ? {
              deviceId: { exact: deviceId },
              width: { ideal: isMobile ? 720 : 960 },
              height: { ideal: isMobile ? 960 : 720 },
              aspectRatio: { ideal: isMobile ? 0.75 : 1.333333333 }
            }
          : (selectedDevices.videoId ? { deviceId: { exact: selectedDevices.videoId } } : true),
        audio: type === 'audio' ? { deviceId: { exact: deviceId } } : (selectedDevices.audioId ? { deviceId: { exact: selectedDevices.audioId } } : true)
      };

      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      const newTrack = type === 'video' ? newStream.getVideoTracks()[0] : newStream.getAudioTracks()[0];
      const oldTracks = type === 'video' ? localStreamRef.current?.getVideoTracks() : localStreamRef.current?.getAudioTracks();
      
      if (oldTracks) {
        oldTracks.forEach(t => {
          localStreamRef.current?.removeTrack(t);
          t.stop();
        });
      }
      
      if (!localStreamRef.current) {
        setLocalStream(newStream);
        localStreamRef.current = newStream;
      } else {
        localStreamRef.current.addTrack(newTrack);
      }

      // Replace in all peer connections if already joined
      if (isJoined) {
        Object.values(peersRef.current).forEach(peer => {
          const sender = peer.getSenders().find(s => s.track?.kind === type);
          if (sender) sender.replaceTrack(newTrack);
        });
      }

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

  // Sync participant list with order
  useEffect(() => {
    const remoteIds = Object.keys(callParticipants);
    setParticipantOrder(prev => {
      const newOrder = prev.filter(id => id === 'local' || remoteIds.includes(id));
      remoteIds.forEach(id => { if (!newOrder.includes(id)) newOrder.push(id); });
      return [...newOrder];
    });
  }, [callParticipants]);

  const createPeer = (targetSocketId, user, isInitiator) => {
    if (peersRef.current[targetSocketId]) return peersRef.current[targetSocketId];
    
    console.log(`[WebRTC] Creating peer for ${targetSocketId} (Initiator: ${isInitiator})`);
    
    const peer = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });
    
    peersRef.current[targetSocketId] = peer;
    makingOfferRef.current[targetSocketId] = false;
    ignoreOfferRef.current[targetSocketId] = false;
    iceCandidatesQueue.current[targetSocketId] = [];

    peer.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('call_signal', { 
          to: targetSocketId, 
          signal: { type: 'ice-candidate', candidate: event.candidate } 
        });
      }
    };

    peer.ontrack = (event) => {
      console.log(`[WebRTC] Received track from ${targetSocketId}`);
      const [remoteStream] = event.streams;
      setRemoteStreams(prev => ({ ...prev, [targetSocketId]: { stream: remoteStream, user } }));
    };

    peer.onnegotiationneeded = async () => {
      try {
        if (makingOfferRef.current[targetSocketId] || peer.signalingState !== 'stable') return;
        
        console.log(`[WebRTC] Negotiation needed for ${targetSocketId}`);
        makingOfferRef.current[targetSocketId] = true;
        await peer.setLocalDescription();
        socket.emit('call_signal', { to: targetSocketId, signal: peer.localDescription });
      } catch (err) { 
        console.error(`[WebRTC] Negotiation failed for ${targetSocketId}:`, err); 
      } finally { 
        makingOfferRef.current[targetSocketId] = false; 
      }
    };

    peer.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection state with ${targetSocketId}: ${peer.connectionState}`);
    };

    if (localStreamRef.current) {
      console.log(`[WebRTC] Adding tracks to peer ${targetSocketId}`);
      localStreamRef.current.getTracks().forEach(track => {
        peer.addTrack(track, localStreamRef.current);
      });
    }

    return peer;
  };

  const handleUserJoined = ({ socket_id, user }) => {
    if (socket_id === socket.id) return;
    console.log(`[WebRTC] User joined: ${socket_id}`);
    setCallParticipants(prev => ({ ...prev, [socket_id]: user }));
    createPeer(socket_id, user, true);
  };

  const handleCurrentParticipants = ({ participants }) => {
    console.log(`[WebRTC] Current participants:`, participants);
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
    if (!peer) peer = createPeer(from, user, false);

    try {
      if (signal.type === 'offer') {
        const polite = socket.id > from;
        const offerCollision = (makingOfferRef.current[from] || peer.signalingState !== 'stable');
        
        ignoreOfferRef.current[from] = !polite && offerCollision;
        if (ignoreOfferRef.current[from]) {
          console.log(`[WebRTC] Ignoring offer from ${from} (collision)`);
          return;
        }

        console.log(`[WebRTC] Handling offer from ${from}`);
        await peer.setRemoteDescription(new RTCSessionDescription(signal));
        await peer.setLocalDescription();
        socket.emit('call_signal', { to: from, signal: peer.localDescription });
        
        // Process queued candidates
        if (iceCandidatesQueue.current[from]) {
          console.log(`[WebRTC] Processing ${iceCandidatesQueue.current[from].length} queued candidates for ${from}`);
          for (const candidate of iceCandidatesQueue.current[from]) {
            await peer.addIceCandidate(candidate).catch(e => console.warn(e));
          }
          iceCandidatesQueue.current[from] = [];
        }

      } else if (signal.type === 'answer') {
        console.log(`[WebRTC] Handling answer from ${from}`);
        if (peer.signalingState === 'have-local-offer') {
          await peer.setRemoteDescription(new RTCSessionDescription(signal));
          
          // Process queued candidates
          if (iceCandidatesQueue.current[from]) {
            console.log(`[WebRTC] Processing ${iceCandidatesQueue.current[from].length} queued candidates for ${from}`);
            for (const candidate of iceCandidatesQueue.current[from]) {
              await peer.addIceCandidate(candidate).catch(e => console.warn(e));
            }
            iceCandidatesQueue.current[from] = [];
          }
        }
      } else if (signal.type === 'ice-candidate' && signal.candidate) {
        const candidate = new RTCIceCandidate(signal.candidate);
        if (peer.remoteDescription && peer.remoteDescription.type) {
          try {
            await peer.addIceCandidate(candidate);
          } catch (err) {
            if (!ignoreOfferRef.current[from]) console.warn(`[WebRTC] ICE error for ${from}:`, err);
          }
        } else {
          // Queue candidate
          if (!iceCandidatesQueue.current[from]) iceCandidatesQueue.current[from] = [];
          iceCandidatesQueue.current[from].push(candidate);
          console.log(`[WebRTC] Queued ICE candidate from ${from}`);
        }
      }
    } catch (err) { 
      console.error(`[WebRTC] Signaling error with ${from}:`, err); 
    }
  };

  const handleUserLeft = ({ socket_id }) => {
    console.log(`[WebRTC] User left: ${socket_id}`);
    if (peersRef.current[socket_id]) { 
      peersRef.current[socket_id].close(); 
      delete peersRef.current[socket_id]; 
    }
    delete iceCandidatesQueue.current[socket_id];
    setCallParticipants(prev => { const next = { ...prev }; delete next[socket_id]; return next; });
    setRemoteStreams(prev => { const next = { ...prev }; delete next[socket_id]; return next; });
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const state = !isMuted;
      localStreamRef.current.getAudioTracks().forEach(t => t.enabled = !state);
      setIsMuted(state);
      if (isJoined) socket.emit('toggle_media', { room_id: roomId, type: 'mic', status: !state });
    }
  };

  const toggleCamera = async () => {
    if (!localStreamRef.current || isScreenSharing) return;
    let videoTrack = localStreamRef.current.getVideoTracks()[0];
    if (videoTrack) {
      const isCurrentlyOff = !videoTrack.enabled;
      videoTrack.enabled = isCurrentlyOff;
      setIsCameraOff(!isCurrentlyOff);
      if (isJoined) socket.emit('toggle_media', { room_id: roomId, type: 'video', status: isCurrentlyOff });
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

  const handleLeave = () => {
    if (localStreamRef.current) localStreamRef.current.getTracks().forEach(track => track.stop());
    if (onEndCall) onEndCall();
    else onLeave();
  };

  // 🛠 Drag Logic
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

  const formatDeviceLabel = (label, fallback) => {
    const value = label || fallback;
    return value
      .replace(/\s*\([^)]+\)\s*/g, '')
      .replace(/^default\s*-\s*/i, 'Default - ')
      .replace(/^communications\s*-\s*/i, 'Comms - ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const renderLobbyDevicePicker = (type, label, Icon, deviceList, selectedId, fallback) => {
    const selectedDevice = deviceList.find(device => device.deviceId === selectedId);
    const menuKey = `lobby-${type}`;

    return (
      <div className="lobby-select-group">
        <label><Icon size={14} /> {label}</label>
        <div className="lobby-device-select">
          <button
            type="button"
            className="lobby-device-trigger"
            onClick={() => setOpenDeviceMenu(openDeviceMenu === menuKey ? null : menuKey)}
          >
            <span>{formatDeviceLabel(selectedDevice?.label, fallback)}</span>
            <span className="lobby-device-caret">v</span>
          </button>
          {openDeviceMenu === menuKey && (
            <div className="lobby-device-menu">
              {deviceList.map(device => (
                <button
                  type="button"
                  key={device.deviceId}
                  title={device.label || fallback}
                  className={`lobby-device-option ${device.deviceId === selectedId ? 'selected' : ''}`}
                  onClick={() => {
                    changeDevice(type, device.deviceId);
                    setOpenDeviceMenu(null);
                  }}
                >
                  {formatDeviceLabel(device.label, fallback)}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const testSpeaker = () => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, ctx.currentTime);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.5);
  };

  // 🏛 Lobby / Join UI
  if (!isJoined) {
    return (
      <div className="lobby-root">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="lobby-container"
        >
          <div className="lobby-preview">
            <video ref={localVideoRef} autoPlay muted playsInline />
            {isCameraOff && (
              <div className="lobby-avatar-placeholder">
                <div className="lobby-avatar">?</div>
              </div>
            )}
            <div className="lobby-overlay-controls">
              <button onClick={toggleMute} className={`lobby-btn ${isMuted ? 'muted' : ''}`}>{isMuted ? <MicOff size={20}/> : <Mic size={20}/>}</button>
              <button onClick={toggleCamera} className={`lobby-btn ${isCameraOff ? 'off' : ''}`}>{isCameraOff ? <VideoOff size={20}/> : <Video size={20}/>}</button>
            </div>
          </div>

          <div className="lobby-details">
            <h2>Ready to join?</h2>
            <p>{remotesCount === 0 ? 'Be the first to join this conversation' : `${remotesCount} others are already in the call`}</p>

            <div className="lobby-test-area">
              <div className="mic-meter-container">
                <label><Volume2 size={14} /> Mic test</label>
                <div className="mic-meter-bg">
                  <motion.div
                    className="mic-meter-fill"
                    animate={{ width: `${micLevel}%` }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                </div>
              </div>
              <button className="test-sound-btn" type="button" onClick={testSpeaker}>
                Test speaker
              </button>
            </div>
            
            <div className="lobby-settings">
              {renderLobbyDevicePicker('video', 'Camera', Video, devices.video, selectedDevices.videoId, 'Camera')}
              {renderLobbyDevicePicker('audio', 'Microphone', Mic, devices.audio, selectedDevices.audioId, 'Microphone')}
            </div>

            <div className="lobby-actions">
              <button className="join-btn" onClick={() => setIsJoined(true)}>Join Meeting</button>
              <button className="cancel-btn" onClick={onLeave}>Back</button>
            </div>
          </div>
        </motion.div>

        <style>{`
          .lobby-root { position: fixed; inset: 0; background: var(--bg-primary); z-index: 10000; display: flex; align-items: center; justify-content: center; font-family: 'Inter', sans-serif; color: var(--text-primary); padding: 20px; overflow-y: auto; }
          .lobby-container { display: flex; background: var(--bg-secondary); border-radius: 12px; overflow: hidden; max-width: 900px; width: 100%; border: 1px solid var(--glass-border); box-shadow: 0 24px 60px rgba(38, 34, 28, 0.14); }
          .lobby-preview { width: 58%; background: #080808; position: relative; aspect-ratio: 4/3; display: flex; align-items: center; justify-content: center; }
          .lobby-preview video { width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1); }
          .lobby-overlay-controls { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); display: flex; gap: 15px; }
          .lobby-btn { width: 46px; height: 46px; border-radius: 50%; border: 1px solid rgba(255,255,255,0.22); background: rgba(34,32,28,0.58); color: white; cursor: pointer; backdrop-filter: blur(10px); transition: var(--transition); display: flex; align-items: center; justify-content: center; }
          .lobby-btn:hover { background: rgba(34,32,28,0.72); transform: translateY(-1px); }
          .lobby-btn.muted, .lobby-btn.off { background: #ef4444; }
          .lobby-details { width: 42%; padding: 34px; display: flex; flex-direction: column; justify-content: center; }
          .lobby-details h2 { margin: 0 0 8px 0; font-size: 1.75rem; letter-spacing: 0; color: var(--text-primary); }
          .lobby-details p { color: var(--text-secondary); margin: 0 0 20px 0; font-size: 0.92rem; line-height: 1.35; }
          .lobby-test-area { background: var(--bg-primary); border: 1px solid var(--glass-border); border-radius: 8px; padding: 14px; margin-bottom: 18px; }
          .mic-meter-container { margin-bottom: 12px; }
          .mic-meter-container label { font-size: 0.72rem; color: var(--text-secondary); font-weight: 700; text-transform: uppercase; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }
          .mic-meter-bg { height: 6px; background: var(--bg-tertiary); border-radius: 10px; overflow: hidden; }
          .mic-meter-fill { height: 100%; background: var(--accent-primary); border-radius: 10px; }
          .test-sound-btn { width: 100%; padding: 10px; background: var(--accent-soft); border: 1px solid #c8ddd5; border-radius: 8px; color: var(--accent-secondary); font-size: 0.82rem; font-weight: 800; cursor: pointer; transition: var(--transition); }
          .test-sound-btn:hover { background: #d8ebe4; }
          
          .lobby-settings { display: flex; flex-direction: column; gap: 14px; margin-bottom: 24px; }
          .lobby-select-group { display: flex; flex-direction: column; gap: 8px; }
          .lobby-select-group label { font-size: 0.72rem; color: var(--text-secondary); font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; display: flex; align-items: center; gap: 6px; }
          .lobby-device-select { position: relative; min-width: 0; }
          .lobby-device-trigger { width: 100%; min-width: 0; height: 44px; display: flex; align-items: center; justify-content: space-between; gap: 10px; background: var(--bg-secondary); border: 1px solid var(--glass-border); border-radius: 8px; color: var(--text-primary); padding: 0 12px; font-size: 0.9rem; cursor: pointer; text-align: left; }
          .lobby-device-trigger span:first-child { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .lobby-device-caret { color: var(--text-secondary); font-size: 1rem; line-height: 1; }
          .lobby-device-menu { position: absolute; top: calc(100% + 6px); left: 0; right: 0; z-index: 30; width: 100%; max-height: 132px; overflow-y: auto; border: 1px solid var(--glass-border); border-radius: 8px; background: var(--bg-secondary); box-shadow: 0 14px 28px rgba(38, 34, 28, 0.12); }
          .lobby-device-option { width: 100%; min-width: 0; display: block; padding: 10px 12px; border: 0; border-bottom: 1px solid var(--glass-border); background: transparent; color: var(--text-primary); font-size: 0.88rem; line-height: 1.25; text-align: left; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .lobby-device-option:last-child { border-bottom: 0; }
          .lobby-device-option:hover, .lobby-device-option.selected { background: var(--accent-soft); color: var(--accent-secondary); }
          .lobby-actions { display: flex; gap: 12px; }
          .join-btn { flex: 2; padding: 14px; background: var(--accent-primary); border: none; border-radius: 8px; color: white; font-weight: 800; font-size: 1rem; cursor: pointer; transition: var(--transition); }
          .join-btn:hover { background: var(--accent-secondary); }
          .cancel-btn { flex: 1; padding: 14px; background: transparent; border: 1px solid var(--glass-border); border-radius: 8px; color: var(--text-secondary); cursor: pointer; transition: var(--transition); font-weight: 700; }
          .cancel-btn:hover { color: var(--text-primary); background: var(--bg-tertiary); }
          .lobby-avatar-placeholder { position: absolute; inset: 0; background: #000; display: flex; align-items: center; justify-content: center; }
          .lobby-avatar { width: 104px; height: 104px; border-radius: 50%; background: var(--accent-primary); display: flex; align-items: center; justify-content: center; font-size: 2.7rem; font-weight: 800; border: 4px solid rgba(255,255,255,0.2); }
          
          @media (max-width: 800px) { 
            .lobby-root { padding: 16px; align-items: flex-start; }
            .lobby-container { flex-direction: column; border-radius: 12px; margin-top: 8px; margin-bottom: 18px; max-width: 430px; } 
            .lobby-preview, .lobby-details { width: 100%; } 
            .lobby-preview { aspect-ratio: 4/3; }
            .lobby-details { padding: 22px; }
            .lobby-details h2 { font-size: 1.55rem; }
            .lobby-details p { margin-bottom: 18px; }
            .lobby-actions { flex-direction: column; gap: 10px; }
            .join-btn { order: 1; }
            .cancel-btn { order: 2; border: none; padding: 10px; }
          }
          
          @media (max-height: 700px) and (max-width: 800px) {
            .lobby-root { padding-top: 10px; }
            .lobby-preview { aspect-ratio: 16/10; }
            .lobby-avatar { width: 72px; height: 72px; font-size: 1.8rem; }
            .lobby-test-area { padding: 12px; margin-bottom: 12px; }
            .lobby-settings { margin-bottom: 14px; }
            .lobby-details { padding: 18px 22px; }
            .lobby-device-menu { max-height: 96px; }
          }
        `}</style>
      </div>
    );
  }

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
                dragElastic={0.01}
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
                    onSpeaking={(speaking) => setRemoteAudioSpeaks(prev => speaking === prev[id] ? prev : ({...prev, [id]: speaking}))}
                  />
                )}
              </motion.div>
            );
          })}
        </div>
      </main>

      <footer className="call-controls">
        <div className="controls-inner">
          <button onClick={toggleMute} className={`action-btn ${isMuted ? 'muted' : ''}`}>
            {isMuted ? <MicOff /> : <Mic />}
            <label>{isMuted ? 'Unmute' : 'Mute'}</label>
          </button>
          <button 
            onClick={toggleCamera} 
            disabled={isScreenSharing} 
            className={`action-btn ${isCameraOff ? 'camera-off' : ''}`}
          >
            {isCameraOff ? <VideoOff /> : <Video />}
            <label>{isCameraOff ? 'Camera On' : 'Camera Off'}</label>
          </button>
          <button onClick={toggleScreenShare} className={`action-btn ${isScreenSharing ? 'sharing' : ''}`}>
            <Maximize2 />
            <label>Share</label>
          </button>
          <button onClick={() => setShowChat(true)} className={`action-btn ${showChat ? 'active' : ''}`}>
            <MessageSquare />
            <label>Chat</label>
          </button>
          <button onClick={() => setShowSettings(!showSettings)} className={`action-btn ${showSettings ? 'active' : ''}`}>
            <Settings />
            <label>Settings</label>
          </button>
          <button onClick={handleLeave} className="action-btn end-call">
            <PhoneOff />
            <label>End</label>
          </button>
        </div>
      </footer>

      <AnimatePresence>
        {showChat && (
          <motion.aside
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            className="call-chat-panel"
          >
            <div className="call-chat-header">
              <div>
                <h3>Room Chat</h3>
                <span>{messages.length} {messages.length === 1 ? 'message' : 'messages'}</span>
              </div>
              <button type="button" className="call-chat-close" onClick={() => setShowChat(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="call-chat-messages">
              {messages.length > 0 ? (
                messages.map((msg, index) => {
                  const isOwnMessage = (token && currentUser && msg.user_id === currentUser.id) ||
                    (!token && guestId && msg.user_tempeorary_id === guestId);

                  return (
                    <div
                      key={`${msg.id || 'call-msg'}-${index}`}
                      className={`call-chat-message ${isOwnMessage ? 'own' : 'other'}`}
                    >
                      <div className="call-chat-meta">
                        {msg.user_name} · {new Date(msg.timestamp || msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div className="call-chat-bubble">{msg.message}</div>
                    </div>
                  );
                })
              ) : (
                <div className="call-chat-empty">No messages yet.</div>
              )}
            </div>

            <form className="call-chat-form" onSubmit={onSendMessage}>
              <div className="call-emoji-wrap">
                <button
                  type="button"
                  className="call-emoji-button"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                >
                  <Smile size={18} />
                </button>
                {showEmojiPicker && (
                  <div className="call-emoji-picker">
                    <EmojiPicker
                      width="100%"
                      height={340}
                      theme="dark"
                      previewConfig={{ showPreview: false }}
                      skinTonesDisabled
                      onEmojiClick={(emojiData) => {
                        setChatInput?.(`${chatInput}${emojiData.emoji}`);
                      }}
                    />
                  </div>
                )}
              </div>
              <input
                type="text"
                placeholder="Type a message..."
                value={chatInput}
                onChange={(e) => setChatInput?.(e.target.value)}
                onFocus={() => setShowEmojiPicker(false)}
              />
              <button type="submit" disabled={!chatInput.trim()}>
                <Send size={17} />
              </button>
            </form>
          </motion.aside>
        )}
      </AnimatePresence>

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
                <select value={selectedDevices.videoId} onChange={(e) => changeDevice('video', e.target.value)}>
                  {devices.video.map(d => (
                    <option key={d.deviceId} value={d.deviceId} title={d.label || 'Camera'}>
                      {formatDeviceLabel(d.label, 'Camera')}
                    </option>
                  ))}
                </select>
              </div>
              <div className="setting-group">
                <label><Mic size={16} /> Microphone</label>
                <select value={selectedDevices.audioId} onChange={(e) => changeDevice('audio', e.target.value)}>
                  {devices.audio.map(d => (
                    <option key={d.deviceId} value={d.deviceId} title={d.label || 'Microphone'}>
                      {formatDeviceLabel(d.label, 'Microphone')}
                    </option>
                  ))}
                </select>
              </div>
              <button className="close-settings" onClick={() => setShowSettings(false)}>Done</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        .call-root-wrapper { position: fixed; inset: 0; height: 100dvh; background: #050508; z-index: 9999; display: flex; flex-direction: column; color: white; overflow: hidden; font-family: 'Inter', sans-serif; }
        .call-header { padding: 12px 20px; background: rgba(0,0,0,0.8); flex-shrink: 0; display: flex; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.05); backdrop-filter: blur(20px); }
        .header-info { display: flex; gap: 10px; align-items: center; }
        .header-info h1 { font-size: 0.9rem; margin: 0; font-weight: 600; letter-spacing: -0.01em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px; }
        .room-subtext { font-size: 0.6rem; color: #64748b; font-weight: 500; }
        .pulse-dot { width: 6px; height: 6px; border-radius: 50%; background: #10b981; box-shadow: 0 0 10px #10b981; animation: pulse 2s infinite; }
        @keyframes pulse { 0% { opacity: 0.4; transform: scale(0.9); } 50% { opacity: 1; transform: scale(1.1); } 100% { opacity: 0.4; transform: scale(0.9); } }
        
        .video-grid-container { flex: 1; overflow: hidden; display: flex; align-items: center; justify-content: center; padding: 16px; position: relative; }
        .video-grid { display: grid; gap: 12px; width: 100%; height: 100%; max-width: 1400px; margin: 0 auto; }
        
        /* Responsive Grid Logic */
        .video-grid.grid-1 { grid-template-columns: 1fr; }
        .video-grid.grid-2 { grid-template-columns: 1fr 1fr; }
        @media (max-width: 600px) { .video-grid.grid-2 { grid-template-columns: 1fr; grid-template-rows: 1fr 1fr; } }
        
        .video-grid.grid-3, .video-grid.grid-4 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
        @media (max-width: 600px) { .video-grid.grid-3, .video-grid.grid-4 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; } }
        
        .video-grid.grid-more { grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
        @media (max-width: 600px) { 
          .video-grid.grid-more { 
            grid-template-columns: 1fr 1fr; 
            grid-auto-rows: minmax(150px, 1fr);
          } 
        }
        @media (max-width: 400px) {
          .video-grid.grid-more { 
             grid-template-columns: 1fr;
          }
        }

        .video-container { background: #0f172a; border-radius: 16px; overflow: hidden; position: relative; border: 2px solid rgba(255,255,255,0.05); transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); background-image: radial-gradient(circle at center, #1e293b 0%, #0f172a 100%); cursor: grab; touch-action: none; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; box-shadow: 0 10px 30px rgba(0,0,0,0.4); }
        .video-container video { width: 100%; height: 100%; object-fit: cover; }
        .video-container.local video { transform: scaleX(-1); }
        .active-speaker { border-color: #6366f1 !important; box-shadow: 0 0 30px rgba(99, 102, 241, 0.4); }
        
        .participant-label { position: absolute; bottom: 12px; left: 12px; background: rgba(15, 23, 42, 0.7); padding: 4px 10px; border-radius: 8px; font-size: 0.7rem; backdrop-filter: blur(12px); display: flex; align-items: center; gap: 6px; font-weight: 600; border: 1px solid rgba(255,255,255,0.1); z-index: 5; }
        .camera-off-placeholder { position: absolute; inset: 0; background: #0f172a; display: flex; align-items: center; justify-content: center; }
        .user-avatar { width: 80px; height: 80px; border-radius: 50%; background: linear-gradient(135deg, #6366f1, #a855f7); display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 2rem; box-shadow: 0 10px 25px rgba(0,0,0,0.5); border: 3px solid rgba(255,255,255,0.15); }
        
        .call-controls { padding: 20px; background: linear-gradient(transparent, rgba(0,0,0,0.9)); flex-shrink: 0; display: flex; justify-content: center; }
        .controls-inner { display: flex; gap: 12px; background: rgba(15, 23, 42, 0.9); padding: 12px 20px; border-radius: 24px; border: 1px solid rgba(255,255,255,0.1); backdrop-filter: blur(30px); }
        
        .action-btn { width: 50px; height: 50px; border-radius: 14px; border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.05); color: white; cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; transition: all 0.2s; }
        .action-btn:hover { background: rgba(255,255,255,0.1); transform: translateY(-2px); }
        .action-btn label { font-size: 0.5rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.7; }
        .action-btn svg { width: 20px; height: 20px; }
        
        .action-btn.muted, .action-btn.camera-off { color: #f87171; background: rgba(239,68,68,0.15); border-color: rgba(239,68,68,0.25); }
        .action-btn.sharing { color: #34d399; background: rgba(16,185,129,0.15); border-color: rgba(16,185,129,0.25); }
        .action-btn.active { color: #fbbf24; border-color: rgba(251,191,36,0.8); background: rgba(251,191,36,0.12); }
        .action-btn.end-call { background: #ef4444; border: none; width: 60px; color: white; }
        .action-btn.end-call:hover { background: #dc2626; }

        .call-chat-panel { position: absolute; top: 76px; right: 18px; bottom: 104px; z-index: 900; width: min(360px, calc(100vw - 32px)); display: flex; flex-direction: column; overflow: hidden; border-radius: 16px; border: 1px solid rgba(255,255,255,0.12); background: rgba(15, 23, 42, 0.96); color: white; box-shadow: 0 20px 50px rgba(0,0,0,0.55); backdrop-filter: blur(20px); }
        .call-chat-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px; border-bottom: 1px solid rgba(255,255,255,0.1); }
        .call-chat-header h3 { margin: 0; font-size: 1rem; line-height: 1.2; }
        .call-chat-header span { color: #94a3b8; font-size: 0.74rem; }
        .call-chat-close { width: 34px; height: 34px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.06); color: white; display: flex; align-items: center; justify-content: center; cursor: pointer; }
        .call-chat-messages { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
        .call-chat-message { max-width: 88%; display: flex; flex-direction: column; gap: 3px; }
        .call-chat-message.own { align-self: flex-end; align-items: flex-end; }
        .call-chat-message.other { align-self: flex-start; align-items: flex-start; }
        .call-chat-meta { color: #94a3b8; font-size: 0.68rem; padding: 0 4px; }
        .call-chat-bubble { padding: 9px 11px; border-radius: 12px; background: rgba(255,255,255,0.08); color: white; font-size: 0.9rem; line-height: 1.35; word-break: break-word; }
        .call-chat-message.own .call-chat-bubble { background: var(--accent-primary); }
        .call-chat-empty { margin: auto; color: #94a3b8; font-size: 0.9rem; }
        .call-chat-form { display: flex; gap: 8px; padding: 12px; border-top: 1px solid rgba(255,255,255,0.1); }
        .call-emoji-wrap { position: relative; flex: 0 0 auto; }
        .call-emoji-button { width: 42px; height: 40px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.06); color: white; display: flex; align-items: center; justify-content: center; cursor: pointer; }
        .call-emoji-picker { position: absolute; left: 0; bottom: calc(100% + 10px); z-index: 20; width: min(320px, calc(100vw - 56px)); overflow: hidden; border-radius: 14px; box-shadow: 0 18px 42px rgba(0,0,0,0.5); }
        .call-chat-form input { flex: 1; min-width: 0; height: 40px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.12); background: rgba(255,255,255,0.06); color: white; outline: none; padding: 0 12px; font-size: 0.9rem; }
        .call-chat-form input::placeholder { color: #94a3b8; }
        .call-chat-form > button { width: 42px; height: 40px; border-radius: 10px; border: none; background: var(--accent-primary); color: white; display: flex; align-items: center; justify-content: center; cursor: pointer; }
        .call-chat-form > button:disabled { opacity: 0.45; cursor: not-allowed; }
        
        .settings-modal { --settings-width: min(360px, calc(100vw - 32px)); position: absolute; bottom: 104px; left: calc((100vw - var(--settings-width)) / 2); z-index: 1000; width: var(--settings-width); background: rgba(15, 23, 42, 0.96); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.12); border-radius: 16px; padding: 18px; box-shadow: 0 20px 50px rgba(0,0,0,0.6); color: white; }
        .settings-content { display: flex; flex-direction: column; gap: 14px; }
        .settings-content h3 { margin: 0; color: white; font-size: 1.05rem; line-height: 1.2; font-weight: 800; }
        .setting-group { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
        .setting-group label { color: #cbd5e1; display: flex; align-items: center; gap: 8px; font-size: 0.78rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.04em; }
        .setting-group select { width: 100%; min-width: 0; max-width: 100%; height: 42px; border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; background-color: rgba(255,255,255,0.06); color: white; padding: 0 38px 0 12px; font-size: 0.9rem; outline: none; appearance: none; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23cbd5e1' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 12px center;
        }
        .setting-group select:focus { border-color: #94a3b8; box-shadow: 0 0 0 3px rgba(148,163,184,0.16); }
        .setting-group select option { background: #0f172a; color: white; }
        .close-settings { width: 100%; height: 42px; border: none; border-radius: 10px; background: white; color: #0f172a; font-size: 0.92rem; font-weight: 800; cursor: pointer; transition: all 0.2s; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .close-settings:hover { background: #e5e7eb; }
        
        @media (max-width: 600px) {
          .call-header { padding: 10px 16px; }
          .call-controls { padding: 15px; }
          .controls-inner { padding: 10px 16px; gap: 8px; border-radius: 20px; }
          .action-btn { width: 44px; height: 44px; border-radius: 12px; }
          .action-btn label { display: none; }
          .action-btn.end-call { width: 54px; }
          .user-avatar { width: 60px; height: 60px; font-size: 1.5rem; }
          .call-chat-panel { top: 60px; left: 14px; right: 14px; bottom: 92px; width: auto; border-radius: 14px; }
          .call-emoji-picker { width: calc(100vw - 56px); }
          .settings-modal { --settings-width: calc(100vw - 28px); bottom: 92px; left: 14px; right: 14px; width: auto; padding: 16px; border-radius: 14px; }
        }
      `}</style>
    </div>
  );
};

const RemoteVideo = ({ stream, user, socketId, onSpeaking }) => {
  const videoRef = useRef();
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [playError, setPlayError] = useState(false);

  useEffect(() => {
    if (videoRef.current && stream) {
      console.log(`[WebRTC] Attaching stream to video for ${socketId}`);
      videoRef.current.srcObject = stream;
      
      const playVideo = async () => {
        try {
          await videoRef.current.play();
          setPlayError(false);
        } catch (err) {
          console.warn(`[WebRTC] Auto-play blocked for ${socketId}:`, err);
          setPlayError(true);
        }
      };

      playVideo();

      const handleAddTrack = () => {
        console.log(`[WebRTC] Track added to stream for ${socketId}`);
        // Reset srcObject to force re-evaluation of tracks
        videoRef.current.srcObject = null;
        videoRef.current.srcObject = stream;
        playVideo();
      };

      stream.addEventListener('addtrack', handleAddTrack);
      return () => stream.removeEventListener('addtrack', handleAddTrack);
    }
  }, [stream, socketId]);

  useEffect(() => {
    if (!stream || stream.getAudioTracks().length === 0) return;
    
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const analyser = audioContext.createAnalyser();
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser); 
      analyser.fftSize = 256;
      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      let animationId;
      let lastSpeaking = false;
      
      const checkVolume = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0; for (let i = 0; i < bufferLength; i++) sum += dataArray[i];
        const average = sum / bufferLength;
        const speaking = average > 30;
        if (speaking !== lastSpeaking) { 
          lastSpeaking = speaking; 
          setIsSpeaking(speaking); 
          if (onSpeaking) onSpeaking(speaking); 
        }
        animationId = requestAnimationFrame(checkVolume);
      };
      checkVolume();
      return () => { 
        cancelAnimationFrame(animationId); 
        if (audioContext.state !== 'closed') audioContext.close(); 
      };
    } catch (err) {
      console.error(`[WebRTC] Audio analysis error for ${socketId}:`, err);
    }
  }, [stream, socketId, onSpeaking]);

  return (
    <>
      {stream ? (
        <>
          <video 
            ref={videoRef} 
            autoPlay 
            playsInline 
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
          {playError && (
            <div className="play-error-overlay" onClick={() => videoRef.current?.play()}>
              <span>Click to unmute</span>
            </div>
          )}
        </>
      ) : (
        <div className="camera-off-placeholder">
          <div className="user-avatar" style={{ fontSize: '1rem' }}>{user?.name?.slice(0, 2).toUpperCase() || '...'}</div>
          <div style={{ position: 'absolute', bottom: '40px', fontSize: '0.65rem', color: '#94a3b8', fontWeight: 600 }}>CONNECTING...</div>
        </div>
      )}
      <div className="participant-label">
        {user?.name || 'Guest'} {user?.isMuted && <MicOff size={10} style={{ color: '#ef4444' }} />}
      </div>
      <style>{`
        .play-error-overlay {
          position: absolute; inset: 0; background: rgba(0,0,0,0.6);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; z-index: 10; border-radius: 20px;
        }
        .play-error-overlay span {
          background: #6366f1; padding: 8px 16px; border-radius: 20px;
          font-size: 0.8rem; font-weight: 600; color: white;
          box-shadow: 0 4px 15px rgba(99, 102, 241, 0.4);
        }
      `}</style>
    </>
  );
};

export default CallOverlay;
