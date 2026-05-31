import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BoltMark } from './Loader';
import './SplashScreen.css';

const ROTATING_MESSAGES = [
  'Connecting to rooms…',
  'Setting up your space…',
  'Almost there…',
  'Loading the good stuff…',
  'Hang tight, nearly ready…',
  'Warming up the servers…',
];

/**
 * SplashScreen — premium dark fullscreen splash.
 *
 * Timeline:
 *   0 – 3 s  : Bolt animation only
 *   3 – 5 s  : Bolt + "Getting things ready…"
 *   5 – 8 s  : Bolt + rotating messages (every ~1.1 s)
 *   8 s      : Fade out → onDone()
 */
const SplashScreen = ({ onDone }) => {
  const [phase, setPhase]     = useState(1);
  const [msgIdx, setMsgIdx]   = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(2), 3000);
    const t2 = setTimeout(() => setPhase(3), 5000);
    const t3 = setTimeout(() => {
      setVisible(false);
      setTimeout(onDone, 600);
    }, 8000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  useEffect(() => {
    if (phase !== 3) return;
    const iv = setInterval(
      () => setMsgIdx(i => (i + 1) % ROTATING_MESSAGES.length),
      1100
    );
    return () => clearInterval(iv);
  }, [phase]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="splash-overlay"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.55, ease: 'easeInOut' } }}
        >
          {/* Ambient radial glow */}
          <div className="splash-glow" />

          {/* Brand */}
          <motion.p
            className="splash-title"
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
          >
            NAR
          </motion.p>
          <motion.p
            className="splash-subtitle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.35 }}
          >
            Not Allowed Room
          </motion.p>

          {/* Bolt — two halves using CSS clip-path on the actual favicon img */}
          <motion.div
            className="splash-bolt-wrap"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2, ease: 'backOut' }}
          >
            <BoltMark className="splash-bolt" />
          </motion.div>

          {/* Phase message */}
          <div className="splash-msg-wrap">
            <AnimatePresence mode="wait">
              {phase === 2 && (
                <motion.p
                  key="p2"
                  className="splash-msg"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3 }}
                >
                  Getting things ready…
                </motion.p>
              )}
              {phase === 3 && (
                <motion.p
                  key={`p3-${msgIdx}`}
                  className="splash-msg"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.28 }}
                >
                  {ROTATING_MESSAGES[msgIdx]}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          {/* Bouncing dots */}
          <div className="splash-dots">
            <div className="splash-dot" />
            <div className="splash-dot" />
            <div className="splash-dot" />
          </div>

          {/* Progress bar */}
          <div className="splash-progress-track">
            <motion.div
              className="splash-progress-fill"
              initial={{ width: '0%' }}
              animate={{ width: '100%' }}
              transition={{ duration: 8, ease: 'linear' }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default SplashScreen;
