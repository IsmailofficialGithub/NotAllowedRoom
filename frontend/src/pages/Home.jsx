import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';
import { 
  LogIn,
  Plus, 
  Users, 
  LogOut, 
  MessageSquare, 
  Search, 
  ArrowRight,
  Hash,
  Layout,
  Lock
} from 'lucide-react';

import { useSocket } from '../context/SocketContext';
import './Home.css';

const Home = () => {
  const [rooms, setRooms] = useState([]);
  const socket = useSocket();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [guestId, setGuestId] = useState(() => {
    const saved = localStorage.getItem('guest_id');
    if (saved) return saved;
    const newId = crypto.randomUUID();
    localStorage.setItem('guest_id', newId);
    return newId;
  });
  const [guestName, setGuestName] = useState(localStorage.getItem('guest_name') || '');
  const [showGuestPrompt, setShowGuestPrompt] = useState(false);

  const { user, logout, token } = useAuth();
  const navigate = useNavigate();

  const API_URL = `${import.meta.env.VITE_BACKEND_URL}/api/v1/rooms`;

  useEffect(() => {
    fetchRooms();
  }, []);

  useEffect(() => {
    if (socket) {
      socket.on('room_created', (newRoom) => {
        setRooms(prev => {
          // Prevent duplicates
          if (prev.find(r => r.id === newRoom.id)) return prev;
          return [newRoom, ...prev];
        });
      });

      socket.on('room_deleted', (deletedId) => {
        setRooms(prev => prev.filter(r => r.id !== parseInt(deletedId)));
      });

      socket.on('participant_count_updated', (data) => {
        console.log(`📊 Count updated for room ${data.room_id}: ${data.participant_count}`);
        setRooms(prev => prev.map(room => 
          Number(room.id) === Number(data.room_id) 
            ? { ...room, participant_count: data.participant_count } 
            : room
        ));
      });

      return () => {
        socket.off('room_created');
        socket.off('room_deleted');
        socket.off('participant_count_updated');
      };
    }
  }, [socket]);

  const [isPrivate, setIsPrivate] = useState(false);
  const [roomPassword, setRoomPassword] = useState('');

  const fetchRooms = async () => {
    try {
      const gId = guestId || localStorage.getItem('guest_id');
      const response = await axios.get(`${API_URL}?guest_id=${gId}`);
      setRooms(response.data.data);
    } catch (error) {
      console.error('Error fetching rooms:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRoom = async (e) => {
    if (e) e.preventDefault();
    
    if (!token && !guestName.trim()) {
      setShowGuestPrompt(true);
      setShowCreateModal(false);
      return;
    }

    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const response = await axios.post(`${API_URL}/create`, 
        { 
          room_name: newRoomName,
          is_private: isPrivate,
          room_password: isPrivate ? roomPassword : null,
          guest_name: guestName,
          guest_id: guestId
        },
        { headers }
      );
      
      if (response.data.guest_id) {
        setGuestId(response.data.guest_id);
        localStorage.setItem('guest_id', response.data.guest_id);
      }

      setRooms([response.data.room, ...rooms]);
      setNewRoomName('');
      setRoomPassword('');
      setIsPrivate(false);
      setShowCreateModal(false);
      
      // Navigate directly into the new room
      navigate(`/room/${response.data.room.id}`);
    } catch (error) {
      console.error('Error creating room:', error);
    }
  };

  const handleGuestSubmit = (e) => {
    e.preventDefault();
    if (guestName.trim()) {
      localStorage.setItem('guest_name', guestName);
      setShowGuestPrompt(false);
      setShowCreateModal(true); // Re-open create modal after name set
    }
  };

  const handleJoinRoom = (roomId) => {
    navigate(`/room/${roomId}`);
  };

  const filteredRooms = rooms.filter(room => 
    room.room_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="home-container">
      {/* Header */}
      <header className="home-header">
        <div>
          <h1 className="text-gradient" style={{ fontSize: '2rem', fontWeight: '800' }}>NotAllowedRoom</h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            {token ? `Welcome back, ${user?.name}` : 'Welcome, Explore public rooms'}
          </p>
        </div>
        <div className="home-header-actions">
          <button onClick={() => setShowCreateModal(true)} className="btn btn-primary">
            <Plus size={20} /> <span className="hide-mobile">Create Room</span>
          </button>
          {token ? (
            <button onClick={logout} className="btn btn-secondary">
              <LogOut size={20} />
            </button>
          ) : (
            <button onClick={() => navigate('/login')} className="btn btn-secondary">
              <LogIn size={20} /> <span className="hide-mobile">Login</span>
            </button>
          )}
        </div>
      </header>

      {/* Hero Stats / Search */}
      <div className="search-container" style={{ marginBottom: '32px' }}>
        <Search size={20} style={{ 
          position: 'absolute', 
          left: '16px', 
          top: '50%', 
          transform: 'translateY(-50%)',
          color: 'var(--text-dim)',
          zIndex: 1
        }} />
        <input 
          type="text" 
          className="search-input"
          placeholder="Search rooms..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Room Grid */}
      <div className="room-grid">
        {loading ? (
           [1,2,3].map(i => <div key={i} className="glass card" style={{ height: '180px', opacity: 0.5 }}></div>)
        ) : filteredRooms.length > 0 ? (
          filteredRooms.map((room) => (
            <motion.div 
              key={room.id}
              whileHover={{ scale: 1.02 }}
              className="glass card"
              style={{ cursor: 'pointer' }}
              onClick={() => handleJoinRoom(room.id)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
                <div style={{ 
                  background: 'rgba(99, 102, 241, 0.1)', 
                  padding: '8px', 
                  borderRadius: '12px',
                  color: 'var(--accent-primary)'
                }}>
                  <Hash size={24} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {room.is_private && (
                    <div style={{ 
                      background: 'rgba(239, 68, 68, 0.1)', 
                      padding: '4px 8px', 
                      borderRadius: '6px', 
                      color: '#ef4444',
                      fontSize: '0.7rem',
                      fontWeight: '700',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      <Lock size={12} /> PRIVATE
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                    <Users size={16} /> {room.participant_count || 0}
                  </div>
                </div>
              </div>
              <h3 style={{ marginBottom: '8px', fontSize: '1.25rem' }}>{room.room_name}</h3>
              <p style={{ color: 'var(--text-dim)', fontSize: '0.875rem', marginBottom: '20px' }}>
                Host: {room.host_name === user?.name ? 'You' : room.host_name}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', color: 'var(--accent-primary)', fontWeight: '600', gap: '4px' }}>
                Enter Room <ArrowRight size={16} />
              </div>
            </motion.div>
          ))
        ) : (
          <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '100px 0', color: 'var(--text-dim)' }}>
            <MessageSquare size={48} style={{ marginBottom: '16px', opacity: 0.2 }} />
            <p>No rooms found. Why not create one?</p>
          </div>
        )}
      </div>

      {/* Create Room Modal */}
      {showCreateModal && (
        <div className="modal-overlay">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="glass card modal-content" 
          >
            <h2 style={{ marginBottom: '20px' }}>New Chat Room</h2>
            <form onSubmit={handleCreateRoom}>
              <div className="input-group">
                <label>Room Name</label>
                <input 
                  type="text" 
                  autoFocus
                  placeholder="e.g. Design Sync"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                <input 
                  type="checkbox" 
                  id="isPrivate" 
                  checked={isPrivate}
                  onChange={(e) => setIsPrivate(e.target.checked)}
                />
                <label htmlFor="isPrivate" style={{ color: 'var(--text-secondary)', cursor: 'pointer' }}>Private Room</label>
              </div>

              {isPrivate && (
                <div className="input-group">
                  <label>Room Password</label>
                  <input 
                    type="password" 
                    placeholder="Optional access password"
                    value={roomPassword}
                    onChange={(e) => setRoomPassword(e.target.value)}
                  />
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button type="button" onClick={() => setShowCreateModal(false)} className="btn btn-secondary" style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  Create
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Guest Name Prompt */}
      {showGuestPrompt && (
        <div className="modal-overlay" style={{ zIndex: 1001 }}>
          <motion.div 
            initial={{ opacity: 0, y: 20 }} 
            animate={{ opacity: 1, y: 0 }} 
            className="glass card modal-content"
          >
            <h2 style={{ marginBottom: '16px' }}>Enter your Name</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '0.875rem' }}>You're creating a room as a guest. Please provide a name.</p>
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
              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button type="button" onClick={() => setShowGuestPrompt(false)} className="btn btn-secondary" style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
                  Continue
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default Home;
