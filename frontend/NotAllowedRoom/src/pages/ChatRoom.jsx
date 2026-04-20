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
  const [roomInfo, setRoomInfo] = useState(null);
  
  // Guest & Privacy States
  const [guestName, setGuestName] = useState(localStorage.getItem('guest_name') || '');
  const [guestId, setGuestId] = useState(localStorage.getItem('guest_id') || '');
  const [showGuestPrompt, setShowGuestPrompt] = useState(!token && !localStorage.getItem('guest_name'));
  const [password, setPassword] = useState('');
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false);
  const [error, setError] = useState('');

  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (!token && !guestId) {
      const newGuestId = crypto.randomUUID();
      setGuestId(newGuestId);
      localStorage.setItem('guest_id', newGuestId);
    }
  }, [token]);

  useEffect(() => {
    if (showGuestPrompt || showPasswordPrompt) return;

    fetchRoomData();
    if (socket) {
      socket.emit('join_room', id);
      
      socket.on('receive_message', (message) => {
        setMessages(prev => [...prev, message]);
      });

      socket.on('error', (err) => {
        if (err.includes('Unauthorized') || err.includes('password')) {
           setShowPasswordPrompt(true);
        }
      });

      return () => {
        socket.off('receive_message');
        socket.off('error');
      };
    }
  }, [id, socket, showGuestPrompt, showPasswordPrompt]);

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
    if (!newMessage.trim() || !socket) return;

    socket.emit('send_message', {
      room_id: id,
      message: newMessage,
      guest_id: guestId,
      guest_name: guestName
    });

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
                key={msg.id || index}
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
            border: '1px solid var(--glass-border)'
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
          >
            <Send size={18} />
          </button>
        </form>
      </div>
    </div>
  );
};

export default ChatRoom;
