import React, { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Mic, MicOff, Video, VideoOff, Settings, Volume2 } from 'lucide-react';

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
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'var(--bg-primary)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '20px'
    }}>
      <motion.div 
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="glass card" 
        style={{ maxWidth: '800px', width: '100%', padding: '32px' }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
          {/* Left: Preview */}
          <div>
            <div style={{
              aspectRatio: '16/9',
              background: '#0f172a',
              borderRadius: '16px',
              overflow: 'hidden',
              position: 'relative',
              boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
              border: '2px solid var(--glass-border)'
            }}>
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
                  <div style={{
                    width: '80px', height: '80px', borderRadius: '50%',
                    background: 'var(--accent-gradient)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '2rem', fontWeight: 'bold'
                  }}>
                    {userName?.charAt(0).toUpperCase()}
                  </div>
                </div>
              )}
              
              <div style={{
                position: 'absolute', bottom: '16px', left: '50%', transform: 'translateX(-50%)',
                display: 'flex', gap: '12px'
              }}>
                <button 
                  onClick={() => setMicOn(!micOn)}
                  style={{
                    width: '48px', height: '48px', borderRadius: '50%',
                    background: micOn ? 'rgba(255,255,255,0.1)' : '#ef4444',
                    border: '1px solid rgba(255,255,255,0.2)',
                    color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                >
                  {micOn ? <Mic size={20} /> : <MicOff size={20} />}
                </button>
                <button 
                  onClick={() => setVideoOn(!videoOn)}
                  style={{
                    width: '48px', height: '48px', borderRadius: '50%',
                    background: videoOn ? 'rgba(255,255,255,0.1)' : '#ef4444',
                    border: '1px solid rgba(255,255,255,0.2)',
                    color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                >
                  {videoOn ? <Video size={20} /> : <VideoOff size={20} />}
                </button>
              </div>
            </div>
          </div>

          {/* Right: Controls & Join */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <h1 style={{ fontSize: '2rem', marginBottom: '8px', fontWeight: '800' }}>Ready to join?</h1>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '32px' }}>Check your audio and video settings before entering the room.</p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '40px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-secondary)' }}>
                <Volume2 size={20} />
                <span>Default Microphone</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--text-secondary)' }}>
                <Settings size={20} />
                <span>System Settings</span>
              </div>
            </div>

            <button 
              onClick={handleJoin}
              className="btn btn-primary" 
              style={{ padding: '16px 32px', fontSize: '1.1rem', borderRadius: '16px' }}
            >
              Join Room Now
            </button>
            <p style={{ marginTop: '16px', fontSize: '0.8rem', color: 'var(--text-dim)', textAlign: 'center' }}>
              You are joining as <strong>{userName}</strong>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default PreJoinModal;
