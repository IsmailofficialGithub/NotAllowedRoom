import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';
import { 
  Plus, 
  Users, 
  LogOut, 
  MessageSquare, 
  Search, 
  ArrowRight,
  Hash,
  Layout
} from 'lucide-react';

const Home = () => {
  const [rooms, setRooms] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  const { user, logout, token } = useAuth();
  const navigate = useNavigate();

  const API_URL = 'http://localhost:9000/api/v1/rooms';

  useEffect(() => {
    fetchRooms();
  }, []);

  const [isPrivate, setIsPrivate] = useState(false);
  const [roomPassword, setRoomPassword] = useState('');

  const fetchRooms = async () => {
    try {
      const response = await axios.get(API_URL);
      setRooms(response.data.data);
    } catch (error) {
      console.error('Error fetching rooms:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    try {
      const response = await axios.post(`${API_URL}/create`, 
        { 
          room_name: newRoomName,
          is_private: isPrivate,
          room_password: isPrivate ? roomPassword : null
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setRooms([response.data.room, ...rooms]);
      setNewRoomName('');
      setRoomPassword('');
      setIsPrivate(false);
      setShowCreateModal(false);
      fetchRooms(); // Refresh the list
    } catch (error) {
      console.error('Error creating room:', error);
    }
  };

  const handleJoinRoom = async (roomId) => {
    try {
      await axios.post(`${API_URL}/join`, 
        { room_id: roomId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      navigate(`/room/${roomId}`);
    } catch (error) {
      console.error('Error joining room:', error);
    }
  };

  const filteredRooms = rooms.filter(room => 
    room.room_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <header style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '40px',
        padding: '20px 0'
      }}>
        <div>
          <h1 className="text-gradient" style={{ fontSize: '2rem', fontWeight: '800' }}>NotAllowedRoom</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Welcome back, {user?.name}</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={() => setShowCreateModal(true)} className="btn btn-primary">
            <Plus size={20} /> Create Room
          </button>
          <button onClick={logout} className="btn btn-secondary">
            <LogOut size={20} />
          </button>
        </div>
      </header>

      {/* Hero Stats / Search */}
      <div style={{ position: 'relative', marginBottom: '32px' }}>
        <Search size={20} style={{ 
          position: 'absolute', 
          left: '16px', 
          top: '50%', 
          transform: 'translateY(-50%)',
          color: 'var(--text-dim)'
        }} />
        <input 
          type="text" 
          placeholder="Search rooms..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ 
            width: '100%', 
            padding: '16px 16px 16px 48px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--glass-border)',
            borderRadius: 'var(--radius-lg)',
            color: 'white',
            fontSize: '1rem',
            outline: 'none'
          }}
        />
      </div>

      {/* Room Grid */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', 
        gap: '24px' 
      }}>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
                  <Users size={16} /> {room.participant_count || 0}
                </div>
              </div>
              <h3 style={{ marginBottom: '8px', fontSize: '1.25rem' }}>{room.room_name}</h3>
              <p style={{ color: 'var(--text-dim)', fontSize: '0.875rem', marginBottom: '20px' }}>
                Created by {room.host_name === user.name ? 'You' : room.host_name}
              </p>
              <div style={{ display: 'flex', alignItems: 'center', color: 'var(--accent-primary)', fontWeight: '600', gap: '4px' }}>
                Join Chat <ArrowRight size={16} />
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
        <div style={{ 
          position: 'fixed', 
          top: 0, left: 0, right: 0, bottom: 0, 
          background: 'rgba(0,0,0,0.8)', 
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '20px'
        }}>
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="glass card" 
            style={{ maxWidth: '400px', width: '100%' }}
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
    </div>
  );
};

export default Home;
