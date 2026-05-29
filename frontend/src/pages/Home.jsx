import React, { useRef, useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { motion } from 'framer-motion';
import { 
  LogIn,
  Plus, 
  Users, 
  LogOut, 
  LoaderCircle,
  MessageSquare, 
  Pencil,
  Search, 
  Share2,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Hash,
  Lock,
  Trash2
} from 'lucide-react';

import { useSocket } from '../context/SocketContext';
import DateTimeBadge from '../components/DateTimeBadge';
import { isDuplicateRequest } from '../lib/preventDuplicateRequests';
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
  const [createdRoom, setCreatedRoom] = useState(null);
  const [copiedRoomUrl, setCopiedRoomUrl] = useState(false);
  const [isCreatingRoom, setIsCreatingRoom] = useState(false);
  const [createRoomError, setCreateRoomError] = useState('');
  const [editingRoom, setEditingRoom] = useState(null);
  const [editingRoomName, setEditingRoomName] = useState('');
  const [isUpdatingRoom, setIsUpdatingRoom] = useState(false);
  const [deletingRoom, setDeletingRoom] = useState(null);
  const [participantsModal, setParticipantsModal] = useState(null);
  const [participantsLoading, setParticipantsLoading] = useState(false);
  const [participantsError, setParticipantsError] = useState('');
  const [removingParticipantId, setRemovingParticipantId] = useState(null);
  const createRoomLockRef = useRef(false);
  const updateRoomLockRef = useRef(false);
  const deleteRoomLockRef = useRef(false);
  const participantsLockRef = useRef(false);

  const { user, logout, token } = useAuth();
  const navigate = useNavigate();
  const cleanUserValue = (value) => {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    return trimmed && trimmed !== 'undefined' && trimmed !== 'null' ? trimmed : '';
  };
  const userEmail = cleanUserValue(user?.email);
  const displayName = cleanUserValue(user?.name) || userEmail || 'there';

  const API_URL = `${import.meta.env.VITE_BACKEND_URL}/api/v1/rooms`;

  useEffect(() => {
    fetchRooms();
  }, [token]);

  useEffect(() => {
    if (socket) {
      socket.on('room_created', (newRoom) => {
        setRooms(prev => {
          // Prevent duplicates
          if (prev.find(r => r.id === newRoom.id)) return prev;
          return [newRoom, ...prev];
        });
      });

      socket.on('room_deleted', (deletedRoom) => {
        const deletedRoomId = typeof deletedRoom === 'object' ? deletedRoom.room_id : deletedRoom;
        setRooms(prev => prev.filter(r => r.id !== parseInt(deletedRoomId)));
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
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const response = await axios.get(`${API_URL}?guest_id=${gId}`, { headers });
      setRooms(response.data.data);
    } catch (error) {
      if (isDuplicateRequest(error)) return;
      console.error('Error fetching rooms:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRoom = async (e) => {
    if (e) e.preventDefault();
    if (createRoomLockRef.current) return;
    
    if (!token && !guestName.trim()) {
      setShowGuestPrompt(true);
      setShowCreateModal(false);
      return;
    }

    try {
      createRoomLockRef.current = true;
      setIsCreatingRoom(true);
      setCreateRoomError('');
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
      setCreatedRoom(response.data.room);
      setCopiedRoomUrl(false);
    } catch (error) {
      if (isDuplicateRequest(error)) return;
      setCreateRoomError(error.response?.data?.message || 'Could not create room. Please try again.');
      console.error('Error creating room:', error);
    } finally {
      createRoomLockRef.current = false;
      setIsCreatingRoom(false);
    }
  };

  const getRoomUrl = (room) => {
    const roomId = typeof room === 'object' ? room.id : room;
    const inviteToken = typeof room === 'object' ? room.invite_token : null;
    const roomUrl = new URL(`/room/${roomId}`, window.location.origin);

    if (inviteToken) {
      roomUrl.searchParams.set('invite', inviteToken);
    }

    return roomUrl.toString();
  };

  const handleCopyRoomUrl = async (room) => {
    const roomUrl = getRoomUrl(room);

    try {
      await navigator.clipboard.writeText(roomUrl);
    } catch (error) {
      const input = document.createElement('input');
      input.value = roomUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
    }

    setCopiedRoomUrl(true);
    window.setTimeout(() => setCopiedRoomUrl(false), 1800);
  };

  const handleShareRoom = async (room) => {
    const roomUrl = getRoomUrl(room);

    if (navigator.share) {
      try {
        await navigator.share({
          title: room.room_name,
          text: `Join "${room.room_name}" on NotAllowedRoom`,
          url: roomUrl
        });
        return;
      } catch (error) {
        if (error.name === 'AbortError') return;
      }
    }

    await handleCopyRoomUrl(room);
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

  const isRoomOwner = (room) => {
    if (token && user?.id && Number(room.host_id) === Number(user.id)) return true;
    return !room.host_id && guestId && room.host_temporary_id === guestId;
  };

  const getHeaders = () => token ? { Authorization: `Bearer ${token}` } : {};

  const openEditRoom = (room) => {
    setEditingRoom(room);
    setEditingRoomName(room.room_name);
  };

  const handleUpdateRoom = async (e) => {
    e.preventDefault();
    if (!editingRoom || updateRoomLockRef.current) return;

    try {
      updateRoomLockRef.current = true;
      setIsUpdatingRoom(true);
      const response = await axios.patch(`${API_URL}/${editingRoom.id}`, {
        room_name: editingRoomName,
        guest_id: guestId
      }, { headers: getHeaders() });

      setRooms(prev => prev.map(room => (
        Number(room.id) === Number(editingRoom.id)
          ? { ...room, room_name: response.data.room.room_name }
          : room
      )));
      setEditingRoom(null);
    } catch (error) {
      if (isDuplicateRequest(error)) return;
      console.error('Error updating room:', error);
    } finally {
      updateRoomLockRef.current = false;
      setIsUpdatingRoom(false);
    }
  };

  const handleDeleteRoom = async () => {
    if (!deletingRoom || deleteRoomLockRef.current) return;

    try {
      deleteRoomLockRef.current = true;
      await axios.delete(`${API_URL}/${deletingRoom.id}`, {
        headers: getHeaders(),
        data: { guest_id: guestId }
      });
      setRooms(prev => prev.filter(room => Number(room.id) !== Number(deletingRoom.id)));
      setDeletingRoom(null);
    } catch (error) {
      if (isDuplicateRequest(error)) return;
      console.error('Error deleting room:', error);
    } finally {
      deleteRoomLockRef.current = false;
    }
  };

  const openParticipants = async (room, page = 1) => {
    const requestKey = `${room.id}:${page}`;
    if (participantsLockRef.current === requestKey) return;

    setParticipantsModal(prev => ({
      room,
      data: prev?.room?.id === room.id ? prev.data : [],
      pagination: prev?.room?.id === room.id ? prev.pagination : null
    }));
    setParticipantsLoading(true);
    setParticipantsError('');

    try {
      participantsLockRef.current = requestKey;
      const response = await axios.get(`${API_URL}/${room.id}/participants?page=${page}&limit=6`, {
        headers: getHeaders()
      });
      setParticipantsModal({
        room,
        data: response.data.data,
        pagination: response.data.pagination
      });
    } catch (error) {
      if (isDuplicateRequest(error)) return;
      setParticipantsError('Could not load participants.');
      console.error('Error loading participants:', error);
    } finally {
      participantsLockRef.current = false;
      setParticipantsLoading(false);
    }
  };

  const handleRemoveParticipant = async (participant) => {
    if (!participantsModal || removingParticipantId) return;

    try {
      setRemovingParticipantId(participant.id);
      await axios.delete(`${API_URL}/${participantsModal.room.id}/participants/${participant.id}`, {
        headers: getHeaders(),
        data: { guest_id: guestId }
      });

      const nextPage = participantsModal.pagination?.page || 1;
      await openParticipants(participantsModal.room, nextPage);
    } catch (error) {
      if (isDuplicateRequest(error)) return;
      setParticipantsError(error.response?.data?.message || 'Could not remove participant.');
      console.error('Error removing participant:', error);
    } finally {
      setRemovingParticipantId(null);
    }
  };

  const isCurrentParticipant = (participant) => {
    if (token && user?.id && Number(participant.user_id) === Number(user.id)) return true;
    return !participant.user_id && guestId && participant.user_tempeorary_id === guestId;
  };

  const filteredRooms = rooms.filter(room => 
    room.room_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="home-container">
      {/* Header */}
      <header className="home-header">
        <div className="home-brand">
          <img src="/favicon.svg" alt="" className="home-brand-logo" />
          <div className="home-brand-copy">
            <h1 className="home-brand-title" title="NotAllowedRoom" tabIndex={0}>
              NAR
            </h1>
            <p title={userEmail || undefined}>
            {token ? `Welcome back, ${displayName}` : 'Welcome, Explore public rooms'}
            </p>
          </div>
        </div>
        <DateTimeBadge />
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

      {/* Room Toolbar */}
      <div className="rooms-toolbar">
        <div className="rooms-summary">
          <span className="rooms-summary-title">Rooms</span>
          <span className="rooms-summary-count">
            {filteredRooms.length} {filteredRooms.length === 1 ? 'room' : 'rooms'}
          </span>
        </div>
        <label className="search-container" aria-label="Search rooms">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Search rooms"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </label>
      </div>

      {/* Room Grid */}
      <div className="room-grid">
        {loading ? (
           [1,2,3,4,5,6,7,8].map(i => <div key={i} className="glass card room-card" style={{ height: '120px', opacity: 0.5 }}></div>)
        ) : filteredRooms.length > 0 ? (
          filteredRooms.map((room) => (
            <motion.div 
              key={room.id}
              whileHover={{ y: -2 }}
              className="glass card room-card"
              onClick={() => handleJoinRoom(room.id)}
            >
              <div className="room-card-top">
                <div className="room-icon">
                  <Hash size={24} />
                </div>
                <div className="room-meta">
                  <button
                    type="button"
                    className="room-action-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleShareRoom(room);
                    }}
                    title="Share room link"
                  >
                    <Share2 size={15} />
                  </button>
                  {room.is_private && (
                    <div className="room-private-badge" title="Private room">
                      <Lock size={13} />
                    </div>
                  )}
                  <div className="room-count">
                    <Users size={16} /> {room.participant_count || 0}
                  </div>
                </div>
              </div>
              <h3 className="room-title">{room.room_name}</h3>
              <p className="room-host">
                Host: {room.host_name === user?.name ? 'You' : room.host_name}
              </p>
              {isRoomOwner(room) && (
                <div className="room-actions" onClick={(e) => e.stopPropagation()}>
                  <button type="button" className="room-action-btn" onClick={() => openEditRoom(room)} title="Rename room">
                    <Pencil size={15} />
                  </button>
                  <button type="button" className="room-action-btn" onClick={() => openParticipants(room)} title="View participants">
                    <Users size={15} />
                  </button>
                  <button type="button" className="room-action-btn danger" onClick={() => setDeletingRoom(room)} title="Delete room">
                    <Trash2 size={15} />
                  </button>
                </div>
              )}
              <div className="room-enter">
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
                  disabled={isCreatingRoom}
                  required
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                <input 
                  type="checkbox" 
                  id="isPrivate" 
                  checked={isPrivate}
                  onChange={(e) => setIsPrivate(e.target.checked)}
                  disabled={isCreatingRoom}
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
                    disabled={isCreatingRoom}
                  />
                </div>
              )}

              {createRoomError && (
                <p className="modal-error">{createRoomError}</p>
              )}

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button type="button" onClick={() => setShowCreateModal(false)} className="btn btn-secondary" style={{ flex: 1 }} disabled={isCreatingRoom}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={isCreatingRoom}>
                  {isCreatingRoom ? (
                    <>
                      <LoaderCircle size={18} className="spin-icon" />
                      Creating
                    </>
                  ) : (
                    'Create'
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {createdRoom && (
        <div className="modal-overlay">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="glass card modal-content"
          >
            <div className="created-room-header">
              <div className="room-icon">
                {createdRoom.is_private ? <Lock size={22} /> : <Hash size={22} />}
              </div>
              <div>
                <h2>{createdRoom.room_name}</h2>
                <p>{createdRoom.is_private ? 'Private room created' : 'Room created'}</p>
              </div>
            </div>

            <div className="room-url-box">
              <span>{getRoomUrl(createdRoom)}</span>
              <button
                type="button"
                className="btn-icon"
                onClick={() => handleCopyRoomUrl(createdRoom)}
                title="Copy room URL"
              >
                {copiedRoomUrl ? <Check size={18} /> : <Copy size={18} />}
              </button>
            </div>

            <div className="created-room-actions">
              <button
                type="button"
                onClick={() => setCreatedRoom(null)}
                className="btn btn-secondary"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => navigate(`/room/${createdRoom.id}`)}
                className="btn btn-primary"
              >
                Enter Room <ArrowRight size={16} />
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {editingRoom && (
        <div className="modal-overlay">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass card modal-content">
            <h2 style={{ marginBottom: '20px' }}>Rename Room</h2>
            <form onSubmit={handleUpdateRoom}>
              <div className="input-group">
                <label>Room Name</label>
                <input
                  type="text"
                  autoFocus
                  value={editingRoomName}
                  onChange={(e) => setEditingRoomName(e.target.value)}
                  disabled={isUpdatingRoom}
                  required
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setEditingRoom(null)} disabled={isUpdatingRoom}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isUpdatingRoom}>
                  {isUpdatingRoom ? <><LoaderCircle size={18} className="spin-icon" /> Saving</> : 'Save'}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {deletingRoom && (
        <div className="modal-overlay">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass card modal-content">
            <h2 style={{ marginBottom: '10px' }}>Delete Room</h2>
            <p className="modal-copy">This will remove "{deletingRoom.room_name}" from the room list.</p>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setDeletingRoom(null)}>
                Cancel
              </button>
              <button type="button" className="btn btn-danger" onClick={handleDeleteRoom}>
                Delete
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {participantsModal && (
        <div className="modal-overlay">
          <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="glass card modal-content participants-modal">
            <div className="participants-header">
              <div>
                <h2>{participantsModal.room.room_name}</h2>
                <p>{participantsModal.pagination?.total || 0} active participants</p>
              </div>
              <button type="button" className="btn-icon" onClick={() => setParticipantsModal(null)}>×</button>
            </div>

            {participantsLoading ? (
              <div className="participants-loading"><LoaderCircle size={20} className="spin-icon" /> Loading</div>
            ) : participantsError ? (
              <p className="modal-error">{participantsError}</p>
            ) : participantsModal.data.length > 0 ? (
              <div className="participants-list">
                {participantsModal.data.map((participant) => (
                  <div className="participant-row" key={participant.id}>
                    <div className="participant-avatar">
                      {(participant.user_name || participant.name || 'G').slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <strong>{participant.user_name || participant.name || 'Guest'}</strong>
                      <span>{participant.email || 'Guest user'}</span>
                    </div>
                    {!isCurrentParticipant(participant) && (
                      <button
                        type="button"
                        className="participant-remove-btn"
                        onClick={() => handleRemoveParticipant(participant)}
                        disabled={removingParticipantId === participant.id}
                        title="Remove from room"
                      >
                        {removingParticipantId === participant.id ? (
                          <LoaderCircle size={15} className="spin-icon" />
                        ) : (
                          <Trash2 size={15} />
                        )}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="modal-copy">No one is active in this room yet.</p>
            )}

            <div className="pagination-row">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={participantsLoading || (participantsModal.pagination?.page || 1) <= 1}
                onClick={() => openParticipants(participantsModal.room, participantsModal.pagination.page - 1)}
              >
                <ChevronLeft size={16} /> Prev
              </button>
              <span>
                Page {participantsModal.pagination?.page || 1} of {participantsModal.pagination?.totalPages || 1}
              </span>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={participantsLoading || (participantsModal.pagination?.page || 1) >= (participantsModal.pagination?.totalPages || 1)}
                onClick={() => openParticipants(participantsModal.room, participantsModal.pagination.page + 1)}
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
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
