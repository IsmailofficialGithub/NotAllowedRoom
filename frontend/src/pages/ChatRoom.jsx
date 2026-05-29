import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { motion, AnimatePresence } from 'framer-motion';
import EmojiPicker from 'emoji-picker-react';
import {
  Send,
  ArrowLeft,
  Users,
  MoreVertical,
  Paperclip,
  Smile,
  Hash,
  Phone,
  Video as VideoIcon,
  Trash2,
  CheckSquare
} from 'lucide-react';
import CallOverlay from '../components/CallOverlay';
import DateTimeBadge from '../components/DateTimeBadge';
import './ChatRoom.css';

const ChatRoom = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const socket = useSocket();

  const [messages, setMessages] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState(() => new Set());

  // Guest & Privacy States
  const [guestName, setGuestName] = useState(localStorage.getItem('guest_name') || '');
  const [guestId, setGuestId] = useState(() => {
    const saved = localStorage.getItem('guest_id');
    if (saved) return saved;
    const newId = crypto.randomUUID();
    localStorage.setItem('guest_id', newId);
    return newId;
  });
  const [showGuestPrompt, setShowGuestPrompt] = useState(!token && !localStorage.getItem('guest_name'));
  const [password, setPassword] = useState('');
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [error, setError] = useState('');
  
  // Call States
  const [isInCall, setIsInCall] = useState(false);
  const [callType, setCallType] = useState(null); // 'audio' or 'video'
  const [activeCall, setActiveCall] = useState(null); // { participants_count }
  const [isSocketJoined, setIsSocketJoined] = useState(false);
  const [initialSettings, setInitialSettings] = useState({ micOn: true, videoOn: true });
  const [hasShownCallLobby, setHasShownCallLobby] = useState(false);
  const [notification, setNotification] = useState(null);

  const messagesEndRef = useRef(null);
  const currentRoomInfo = useRef({ id, guestId });


  // Update ref whenever they change
  useEffect(() => {
    currentRoomInfo.current = { id, guestId };
  }, [id, guestId]);

  // 1. Cleanup for UNMOUNT and NAVIGATION (Back button, etc)
  useEffect(() => {
    // We use a ref to track if we've already sent leave_room for this unmount
    return () => {
      // Capture latest IDs from ref
      const { id: leaveId, guestId: leaveGuestId } = currentRoomInfo.current;
      if (socket?.connected && leaveId) {
        console.log(`👋 [Unmount] Sending leave_room for room_${leaveId}`);
        socket.emit('leave_room', { room_id: leaveId, guest_id: leaveGuestId });
      }
    };
  }, [socket]); // Only runs if socket object itself changes or on unmount

  // Sync scroll on messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 2. Browser Close cleanup (TAB CLOSE)
  useEffect(() => {
    const handleUnload = () => {
      // We must include user_id because beacon requests don't include the Authorization header
      const data = JSON.stringify({ 
        room_id: id, 
        user_id: user?.id, 
        guest_id: guestId 
      });
      navigator.sendBeacon(`${import.meta.env.VITE_BACKEND_URL}/api/v1/rooms/leave`, new Blob([data], { type: 'application/json' }));
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [id, guestId, user]);

  // 3. MAIN SOCKET LOGIC: Join and Listen
  useEffect(() => {
    if (!socket || !id || showGuestPrompt || showPasswordPrompt) return;

    // removed incorrect early return

    if (!token && !guestName.trim()) {
      setShowGuestPrompt(true);
      return;
    }

    const initializeRoom = async () => {
      await fetchRoomData();

      const roomIdInt = parseInt(id);
      const guestIdToUse = guestId || localStorage.getItem('guest_id');
      
      console.log(`🔗 [Socket] Joining room_${roomIdInt}`);
      socket.emit('join_room', { room_id: roomIdInt, guest_id: guestIdToUse }, (response) => {
        if (response?.success) {
          console.log(`✅ [Socket] Successfully joined room_${roomIdInt}`);
          setIsSocketJoined(true);
          if (!hasShownCallLobby) {
            setHasShownCallLobby(true);
            setInitialSettings({ micOn: true, videoOn: true });
            setCallType('video');
            setIsInCall(true);
          }
        }
      });
    };

    initializeRoom();
    
    socket.on('connect', initializeRoom);

    return () => {
      socket.off('connect', initializeRoom);
    };
  }, [socket, id, guestId, token, guestName, showGuestPrompt, showPasswordPrompt, hasShownCallLobby]);

  // 4. Socket Events Effect
  useEffect(() => {
    if (!socket || !id || !isSocketJoined) return;

    const onMessage = (data) => {
      console.log("📥 [Socket] Message Received:", data);
      setMessages(prev => [...prev, data]);
      scrollToBottom();
    };

    const onMessagesDeleted = (data) => {
      if (Number(data.room_id) !== Number(id)) return;
      const deletedIds = new Set((data.message_ids || []).map(Number));
      setMessages(prev => prev.filter(msg => !deletedIds.has(Number(msg.id))));
      setSelectedMessageIds(prev => {
        const next = new Set(prev);
        deletedIds.forEach(messageId => next.delete(messageId));
        return next;
      });
    };

    const onCountUpdate = (data) => {
      console.log("📊 Count updated for room", data.room_id, ":", data.participant_count);
      // We could use this to update local state if needed
    };

    const onParticipantLeft = (data) => {
      setParticipants(prev => prev.filter(p => {
        const pUserId = p.user_id ? String(p.user_id) : null;
        const pGuestId = p.user_tempeorary_id ? String(p.user_tempeorary_id) : null;
        const leftUserId = data.user_id ? String(data.user_id) : null;
        const leftGuestId = data.guest_id ? String(data.guest_id) : null;
        
        return (pUserId !== leftUserId || !leftUserId) && (pGuestId !== leftGuestId || !leftGuestId);
      }));
    };

    const playNotificationSound = () => {
      const audio = new Audio('/notification.mp3');
      audio.volume = 0.5;
      audio.play().catch(e => console.log('Sound play blocked'));
    };

    const showJoinNotification = (data) => {
      if (data.socket_id === socket.id) return;
      playNotificationSound();
      setNotification({ message: `${data.user_name} joined the room`, type: 'join' });
      setTimeout(() => setNotification(null), 3000);
    };

    const onCallInProgress = (data) => {
      console.log("☎️ [Socket] Call in progress notification:", data);
      setActiveCall(data);
      
      // Auto-join only if we are specifically authorized and not already in
      if (!isInCall && !showGuestPrompt && !showPasswordPrompt && hasShownCallLobby) {
        console.log("🚀 [Socket] Automatically joining existing call...");
        setCallType('video');
        setIsInCall(true);
      }
    };

    const onCallEnded = (data) => {
      console.log("📵 [Socket] Call ended notification:", data);
      setActiveCall(null);
      setIsInCall(false);
    };

    socket.on('receive_message', onMessage);
    socket.on('messages_deleted', onMessagesDeleted);
    socket.on('participant_count_updated', onCountUpdate);
    socket.on('participant_left', onParticipantLeft);
    socket.on('user_joined_room', showJoinNotification);
    socket.on('call_in_progress', onCallInProgress);
    socket.on('call_ended', onCallEnded);

    return () => {
      socket.off('receive_message', onMessage);
      socket.off('messages_deleted', onMessagesDeleted);
      socket.off('participant_count_updated', onCountUpdate);
      socket.off('participant_left', onParticipantLeft);
      socket.off('user_joined_room', showJoinNotification);
      socket.off('call_in_progress', onCallInProgress);
      socket.off('call_ended', onCallEnded);
    };
  }, [socket, id, isSocketJoined, isInCall]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchRoomData = async (joinPassword = '') => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      // Attempt to join first to verify access
      console.log(`🚀 [JoinRoom] Request: room=${id}, user=${user?.id}, guest=${guestId}`);
      const joinRes = await axios.post(`${import.meta.env.VITE_BACKEND_URL}/api/v1/rooms/join`, {
        room_id: id,
        password: joinPassword || password,
        guest_name: guestName,
        guest_id: guestId
      }, { headers });

      if (joinRes.data.guest_id) {
        setGuestId(joinRes.data.guest_id);
        localStorage.setItem('guest_id', joinRes.data.guest_id);
      }

      if (joinRes.data.name && !token) {
        setGuestName(joinRes.data.name);
        localStorage.setItem('guest_name', joinRes.data.name);
      }

      const [msgRes, partRes] = await Promise.all([
        axios.get(`${import.meta.env.VITE_BACKEND_URL}/api/v1/rooms/${id}/messages`, { headers }),
        axios.get(`${import.meta.env.VITE_BACKEND_URL}/api/v1/rooms/${id}/participants`, { headers })
      ]);

      setMessages(msgRes.data.data);
      setParticipants(partRes.data.data);
      setShowPasswordPrompt(false);
      setError('');
    } catch (error) {
      if (error.response?.status === 401) {
        setShowPasswordPrompt(true);
        if (joinPassword) setError('Invalid room password');
      } else if (error.response?.status === 400) {
        setShowGuestPrompt(true);
      }
      console.error('Error fetching room data:', error);
    }
  };

  const handleGuestSubmit = (e) => {
    e.preventDefault();
    if (guestName.trim()) {
      localStorage.setItem('guest_name', guestName);
      setShowGuestPrompt(false);
    }
  };

  const handlePasswordSubmit = (e) => {
    e.preventDefault();
    fetchRoomData(password);
  };

  const handleSendMessage = (e) => {
    if (e) e.preventDefault();
    console.log('Attempting to send message:', newMessage);
    console.log('Socket state:', socket ? 'Connected' : 'Disconnected');

    if (!newMessage.trim() || !socket) {
      if (!socket) console.error('Cannot send: Socket disconnected');
      return;
    }

    socket.emit('send_message', {
      room_id: id,
      message: newMessage,
      guest_id: guestId,
      guest_name: guestName
    });

    console.log('Message emitted');
    setNewMessage('');
  };

  const isOwnMessage = (msg) => (token && user && msg.user_id === user.id) ||
    (!token && guestId && msg.user_tempeorary_id === guestId);

  const toggleMessageSelection = (messageId) => {
    if (!messageId) return;
    setSelectedMessageIds(prev => {
      const next = new Set(prev);
      const normalizedId = Number(messageId);
      if (next.has(normalizedId)) next.delete(normalizedId);
      else next.add(normalizedId);
      return next;
    });
  };

  const handleDeleteSelectedMessages = () => {
    const messageIds = Array.from(selectedMessageIds);
    if (messageIds.length === 0 || !socket) return;

    socket.emit('delete_messages', {
      room_id: id,
      message_ids: messageIds,
      guest_id: guestId
    }, (response) => {
      if (!response?.success) {
        console.error('Delete messages failed:', response?.message);
      }
    });
  };

  return (
    <div className="chat-container">
      {/* Guest Name Prompt */}
      {showGuestPrompt && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 100, background: 'var(--bg-primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass card" style={{ width: '100%', maxWidth: '350px' }}>
            <h2 style={{ marginBottom: '16px' }}>Enter your Name</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '0.875rem' }}>Joining as a guest. Your name will be visible to others.</p>
            <form onSubmit={handleGuestSubmit}>
              <div className="input-group">
                <input
                  type="text"
                  autoFocus
                  placeholder="Your Name"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '12px' }}>Start Chatting</button>
            </form>
          </motion.div>
        </div>
      )}

      {/* Password Prompt */}
      {showPasswordPrompt && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 90, background: 'var(--bg-primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass card" style={{ width: '100%', maxWidth: '350px' }}>
            <h2 style={{ marginBottom: '16px' }}>Private Room</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '0.875rem' }}>This room is restricted. Please enter the password to join.</p>
            {error && <p style={{ color: 'var(--error)', fontSize: '0.875rem', marginBottom: '12px' }}>{error}</p>}
            <form onSubmit={handlePasswordSubmit}>
              <div className="input-group">
                <input
                  type="password"
                  autoFocus
                  placeholder="Room Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '12px' }}>Join Room</button>
              <button type="button" onClick={() => navigate('/')} className="btn-secondary btn" style={{ width: '100%', marginTop: '12px' }}>Go Back</button>
            </form>
          </motion.div>
        </div>
      )}

      {/* Join Notification Toast */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -50, x: '-50%' }}
            animate={{ opacity: 1, y: 50, x: '-50%' }}
            exit={{ opacity: 0, y: -50, x: '-50%' }}
            style={{
              position: 'fixed', top: 0, left: '50%', zIndex: 10000,
              background: 'var(--accent-gradient)', padding: '12px 24px',
              borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
              color: 'white', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '10px'
            }}
          >
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff' }} />
            {notification.message}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Bar */}
      <header className="glass chat-header">
        <div className="header-left">
          <button
            onClick={() => navigate('/')}
            className="btn-icon"
          >
            <ArrowLeft size={24} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: 'var(--accent-gradient)', padding: '8px', borderRadius: '10px' }} className="hide-mobile">
              <Hash size={18} color="white" />
            </div>
            <div className="room-info">
              <h3>Room Chat</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                <Users size={10} /> {participants.length} Active
                {activeCall && <span style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '4px' }}> • <VideoIcon size={10}/> Live</span>}
              </div>
            </div>
          </div>
        </div>
        <div className="header-right">
          <DateTimeBadge compact />
          {activeCall && !isInCall && (
            <motion.button
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              onClick={() => { setCallType('video'); setIsInCall(true); }}
              className="btn btn-primary"
              style={{ padding: '6px 12px', fontSize: '0.7rem', borderRadius: '10px' }}
            >
              Join
            </motion.button>
          )}
          <button 
            onClick={() => { setCallType('audio'); setIsInCall(true); }}
            className="btn-icon" 
            title="Audio Call"
          >
            <Phone size={20} />
          </button>
          <button 
            onClick={() => { setCallType('video'); setIsInCall(true); }}
            className="btn-icon" 
            title="Video Call"
          >
            <VideoIcon size={20} />
          </button>
          <button className="btn-icon">
            <MoreVertical size={20} />
          </button>
        </div>
      </header>

      {/* WebRTC Call Overlay */}
      <AnimatePresence>
        {isInCall && (
          <CallOverlay 
            roomId={id} 
            isRoomJoined={isSocketJoined}
            initialVideo={initialSettings.videoOn}
            initialMuted={!initialSettings.micOn}
            messages={messages}
            currentUser={user}
            token={token}
            guestId={guestId}
            selectedMessageIds={selectedMessageIds}
            onToggleMessageSelect={toggleMessageSelection}
            onDeleteSelectedMessages={handleDeleteSelectedMessages}
            chatInput={newMessage}
            setChatInput={setNewMessage}
            onSendMessage={handleSendMessage}
            onLeave={() => { 
              setIsInCall(false); 
              setCallType(null);
            }} 
            onEndCall={() => {
              setIsInCall(false);
              setCallType(null);
              navigate('/');
            }}
          />
        )}
      </AnimatePresence>

      {/* Messages Area */}
      {selectedMessageIds.size > 0 && (
        <div className="message-selection-bar">
          <span>{selectedMessageIds.size} selected</span>
          <button type="button" onClick={handleDeleteSelectedMessages}>
            <Trash2 size={16} />
            Delete
          </button>
        </div>
      )}
      <div className="messages-area">
        <AnimatePresence>
          {messages.map((msg, index) => {
            const ownMessage = isOwnMessage(msg);
            const isSelected = selectedMessageIds.has(Number(msg.id));

            return (
              <motion.div
                key={`${msg.id || 'msg'}-${index}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`message-bubble-wrapper ${ownMessage ? 'own' : 'other'} ${isSelected ? 'selected' : ''}`}
              >
                <div className="message-meta" style={{ textAlign: ownMessage ? 'right' : 'left' }}>
                  {msg.user_name} • {new Date(msg.timestamp || msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div className="message-row">
                  {ownMessage && msg.id && (
                    <button
                      type="button"
                      className={`message-select-btn ${isSelected ? 'active' : ''}`}
                      onClick={() => toggleMessageSelection(msg.id)}
                      title={isSelected ? 'Unselect message' : 'Select message'}
                    >
                      <CheckSquare size={15} />
                    </button>
                  )}
                <div className={`glass message-bubble ${ownMessage ? 'own' : 'other'}`} style={{
                  background: ownMessage ? 'var(--accent-gradient)' : 'var(--bg-secondary)',
                  color: ownMessage ? 'white' : 'var(--text-primary)',
                  border: 'none'
                }}>
                  {msg.message}
                </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="input-area">
        {showEmojiPicker && (
          <div className="room-emoji-picker">
            <EmojiPicker
              width="100%"
              height={340}
              theme="light"
              previewConfig={{ showPreview: false }}
              skinTonesDisabled
              onEmojiClick={(emojiData) => {
                setNewMessage(`${newMessage}${emojiData.emoji}`);
              }}
            />
          </div>
        )}
        <form
          onSubmit={handleSendMessage}
          className="glass input-form"
        >
          <button type="button" className="btn-icon" style={{ padding: '4px' }}>
            <Paperclip size={20} />
          </button>
          <input
            type="text"
            className="message-input"
            placeholder="Type a message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onFocus={() => setShowEmojiPicker(false)}
          />
          <button
            type="button"
            className="btn-icon"
            style={{ padding: '4px' }}
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          >
            <Smile size={20} />
          </button>
          <button
            type="submit"
            className="btn btn-primary send-btn"
            disabled={!newMessage.trim()}
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatRoom;
