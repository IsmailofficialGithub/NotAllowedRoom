import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Send, 
  ArrowLeft, 
  Users, 
  MoreVertical,
  Paperclip,
  Smile,
  Hash
} from 'lucide-react';

const ChatRoom = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, token } = useAuth();
  const socket = useSocket();

  const [messages, setMessages] = useState([]);
  const [participants, setParticipants] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  
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

  const messagesEndRef = useRef(null);
  const hasJoined = useRef(false);
  const prevRoomId = useRef(id);

  // 1. Handle joining the room (once per room id)
  useEffect(() => {
    if (showGuestPrompt || showPasswordPrompt) return;
    
    // Reset guard if room changes
    if (prevRoomId.current !== id) {
      hasJoined.current = false;
      prevRoomId.current = id;
    }

    if (hasJoined.current) return;

    // Hard guard: If guest and no name, don't join yet
    if (!token && !guestName.trim()) {
      setShowGuestPrompt(true);
      return;
    }

    hasJoined.current = true;
    fetchRoomData();
    if (socket) {
      const performJoin = () => {
        console.log(`📡 Emitting join_room for room_${id}`);
        socket.emit('join_room', { room_id: id, guest_id: guestId });
      };

      if (socket.connected) {
        performJoin();
      }

      socket.on('connect', performJoin);
      return () => {
        socket.off('connect', performJoin);
      };
    }
  }, [id, socket, showGuestPrompt, showPasswordPrompt, guestName, token, guestId]);

  // 2. Handle socket listeners
  useEffect(() => {
    if (!socket) return;
    console.log(`🎧 Attaching listeners for room_${id}`);

    const handleReceiveMessage = (message) => {
      console.log('✅ Message received in frontend:', message);
      setMessages(prev => [...prev, message]);
    };

    const handleParticipantLeft = (data) => {
      setParticipants(prev => prev.filter(p => 
        (data.user_id && p.user_id !== data.user_id) || 
        (data.guest_id && p.user_tempeorary_id !== data.guest_id)
      ));
    };

    const handleError = (msg) => {
      console.error('Socket error received:', msg);
      setError(msg);
    };

    const handleCountUpdated = (data) => {
      if (parseInt(data.room_id) === parseInt(id)) {
        axios.get(`http://localhost:9000/api/v1/rooms/${id}/participants`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        }).then(res => setParticipants(res.data.data)).catch(console.error);
      }
    };

    socket.on('receive_message', handleReceiveMessage);
    socket.on('participant_left', handleParticipantLeft);
    socket.on('error', handleError);
    socket.on('participant_count_updated', handleCountUpdated);

    return () => {
      socket.off('receive_message', handleReceiveMessage);
      socket.off('participant_left', handleParticipantLeft);
      socket.off('error', handleError);
      socket.off('participant_count_updated', handleCountUpdated);
    };
  }, [socket, id, guestId, token]);

  // Handle Tab Close / Navigation away
  useEffect(() => {
    const handleUnload = () => {
      if (socket) {
        socket.emit('leave_room', { room_id: id, guest_id: guestId });
      }
      // Beacon for more reliability during close
      const data = JSON.stringify({ room_id: id, guest_id: guestId });
      navigator.sendBeacon('http://localhost:9000/api/v1/rooms/leave', new Blob([data], { type: 'application/json' }));
    };

    window.addEventListener('beforeunload', handleUnload);
    return () => window.removeEventListener('beforeunload', handleUnload);
  }, [id, guestId, socket]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchRoomData = async (joinPassword = '') => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      
      // Attempt to join first to verify access
      const joinRes = await axios.post(`http://localhost:9000/api/v1/rooms/join`, {
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
        axios.get(`http://localhost:9000/api/v1/rooms/${id}/messages`, { headers }),
        axios.get(`http://localhost:9000/api/v1/rooms/${id}/participants`, { headers })
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
    e.preventDefault();
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

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100vh',
      maxWidth: '1200px',
      margin: '0 auto',
      background: 'var(--bg-primary)',
      position: 'relative'
    }}>
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

      {/* Top Bar */}
      <header className="glass" style={{ 
        padding: '16px 24px', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button 
            onClick={() => navigate('/')} 
            className="btn-secondary" 
            style={{ padding: '8px', borderRadius: '50%', background: 'none' }}
          >
            <ArrowLeft size={24} />
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
             <div style={{ background: 'var(--accent-gradient)', padding: '10px', borderRadius: '12px' }}>
                <Hash size={20} color="white" />
             </div>
             <div>
                <h3 style={{ fontSize: '1.1rem' }}>Room Chat</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  <Users size={12} /> {participants.length} Active
                </div>
             </div>
          </div>
        </div>
        <button className="btn-secondary" style={{ background: 'none', padding: '8px' }}>
          <MoreVertical size={20} />
        </button>
      </header>

      {/* Messages Area */}
      <div style={{ 
        flex: 1, 
        overflowY: 'auto', 
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <AnimatePresence>
          {messages.map((msg, index) => {
            const isOwnMessage = (token && user && msg.user_id === user.id) || 
                                (!token && guestId && msg.user_tempeorary_id === guestId);
            
            return (
              <motion.div
                key={`${msg.id || 'msg'}-${index}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  alignSelf: isOwnMessage ? 'flex-end' : 'flex-start',
                  maxWidth: '70%',
                }}
              >
                <div style={{ 
                  fontSize: '0.75rem', 
                  color: 'var(--text-dim)', 
                  marginBottom: '4px',
                  textAlign: isOwnMessage ? 'right' : 'left',
                  marginLeft: '8px'
                }}>
                  {msg.user_name} • {new Date(msg.timestamp || msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div className="glass" style={{
                  padding: '12px 18px',
                  borderRadius: isOwnMessage ? '20px 20px 4px 20px' : '20px 20px 20px 4px',
                  background: isOwnMessage ? 'var(--accent-gradient)' : 'var(--bg-secondary)',
                  color: 'white',
                  border: 'none',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                }}>
                  {msg.message}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div style={{ padding: '24px', position: 'relative' }}>
        <form 
          onSubmit={handleSendMessage}
          className="glass"
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '12px', 
            padding: '8px 8px 8px 16px',
            borderRadius: '24px',
            border: '1px solid var(--glass-border)',
            zIndex: 10
          }}
        >
          <button type="button" style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}>
            <Paperclip size={20} />
          </button>
          <input 
            type="text" 
            placeholder="Type a message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            style={{ 
              flex: 1, 
              background: 'none', 
              border: 'none', 
              color: 'white', 
              outline: 'none',
              padding: '8px 0',
              fontSize: '1rem'
            }}
          />
          <button type="button" style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}>
            <Smile size={20} />
          </button>
          <button 
            type="submit" 
            className="btn btn-primary" 
            style={{ 
              borderRadius: '50%', 
              width: '44px', 
              height: '44px', 
              padding: 0,
              minWidth: 'auto'
            }}
            disabled={!newMessage.trim()}
            onClick={handleSendMessage}
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatRoom;
