import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Mic, MicOff, Video, VideoOff, Settings, Volume2 } from 'lucide-react';
import './PreJoinModal.css';

const PreJoinModal = ({ onJoin, userName }) => {
  const [micOn, setMicOn] = useState(true);
  const [videoOn, setVideoOn] = useState(true);
  const [stream, setStream] = useState(null);
  const videoRef = useRef(null);

  useEffect(() => {
    const getStream = async () => {
      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: videoOn,
          audio: micOn
        });
        setStream(newStream);
        if (videoRef.current) {
          videoRef.current.srcObject = newStream;
        }
      } catch (err) {
        console.error("Error accessing media devices:", err);
      }
    };

    getStream();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [videoOn, micOn]);

  const handleJoin = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    onJoin({ micOn, videoOn });
  };

  return (
    <div className="prejoin-container">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass card prejoin-card" 
      >
        <div className="prejoin-grid">
          {/* Left: Preview */}
          <div className="preview-wrapper">
            {videoOn ? (
              <video 
                ref={videoRef} 
                autoPlay 
                muted 
                playsInline 
                style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} 
              />
            ) : (
              <div style={{
                height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)'
              }}>
                <div className="user-avatar" style={{ width: '100px', height: '100px', fontSize: '2.5rem' }}>
                  {userName?.charAt(0).toUpperCase()}
                </div>
              </div>
            )}
            
            <div className="preview-overlay">
              <button 
                onClick={() => setMicOn(!micOn)}
                className={`media-btn ${micOn ? 'on' : 'off'}`}
                title={micOn ? 'Mute' : 'Unmute'}
              >
                {micOn ? <Mic size={20} /> : <MicOff size={20} />}
              </button>
              <button 
                onClick={() => setVideoOn(!videoOn)}
                className={`media-btn ${videoOn ? 'on' : 'off'}`}
                title={videoOn ? 'Stop Video' : 'Start Video'}
              >
                {videoOn ? <Video size={20} /> : <VideoOff size={20} />}
              </button>
            </div>
          </div>

          {/* Right: Controls & Join */}
          <div className="prejoin-info">
            <h1 className="text-gradient">Ready to join?</h1>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>
              Check your audio and video settings before entering the room.
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '32px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                <Volume2 size={18} />
                <span>Microphone is {micOn ? 'On' : 'Off'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                <Video size={18} />
                <span>Camera is {videoOn ? 'On' : 'Off'}</span>
              </div>
            </div>

            <button 
              onClick={handleJoin}
              className="btn btn-primary" 
              style={{ padding: '16px 32px', fontSize: '1.1rem', borderRadius: '16px', width: '100%' }}
            >
              Join Room Now
            </button>
            <p style={{ marginTop: '16px', fontSize: '0.8rem', color: 'var(--text-dim)', textAlign: 'center' }}>
              Joining as <strong>{userName}</strong>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default PreJoinModal;
