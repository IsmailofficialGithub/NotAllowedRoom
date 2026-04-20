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
  
  const messagesEndRef = useRef(null);

  useEffect(() => {
    fetchRoomData();
    if (socket) {
      socket.emit('join_room', id);
      
      socket.on('receive_message', (message) => {
        setMessages(prev => [...prev, message]);
      });

      socket.on('error', (err) => {
        alert(err);
      });

      return () => {
        socket.off('receive_message');
        socket.off('error');
      };
    }
  }, [id, socket]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchRoomData = async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [msgRes, partRes] = await Promise.all([
        axios.get(`http://localhost:9000/api/v1/rooms/${id}/messages`, { headers }),
        axios.get(`http://localhost:9000/api/v1/rooms/${id}/participants`, { headers })
      ]);
      setMessages(msgRes.data.data);
      setParticipants(partRes.data.data);
    } catch (error) {
      console.error('Error fetching room data:', error);
    }
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !socket) return;

    socket.emit('send_message', {
      room_id: id,
      message: newMessage
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
      background: 'var(--bg-primary)'
    }}>
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
          {messages.map((msg, index) => (
            <motion.div
              key={msg.id || index}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                alignSelf: msg.user_id === user.id ? 'flex-end' : 'flex-start',
                maxWidth: '70%',
              }}
            >
              <div style={{ 
                fontSize: '0.75rem', 
                color: 'var(--text-dim)', 
                marginBottom: '4px',
                textAlign: msg.user_id === user.id ? 'right' : 'left',
                marginLeft: '8px'
              }}>
                {msg.user_name} • {new Date(msg.timestamp || msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
              <div className="glass" style={{
                padding: '12px 18px',
                borderRadius: msg.user_id === user.id ? '20px 20px 4px 20px' : '20px 20px 20px 4px',
                background: msg.user_id === user.id ? 'var(--accent-gradient)' : 'var(--bg-secondary)',
                color: 'white',
                border: 'none',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
              }}>
                {msg.message}
              </div>
            </motion.div>
          ))}
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
