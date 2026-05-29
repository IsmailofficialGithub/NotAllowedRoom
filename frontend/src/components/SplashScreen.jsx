import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import NarLoader from './Loader';
import './SplashScreen.css';

const PHASE_MESSAGES = [
  'Connecting to rooms…',
  'Setting up your space…',
  'Almost there…',
  'Loading the good stuff…',
  'Hang tight, nearly ready…',
  'Warming up the servers…',
];

/**
 * SplashScreen — shown once per session on app launch.
 *
 * Phase timeline:
 *   0 – 3 s  : Bolt only (no text)
 *   3 – 5 s  : Bolt + static message "Getting things ready…"
 *   5 – 8 s  : Bolt + rotating messages (cycling every ~1 s)
 *   8 s      : Fade out and dismiss
 *
 * @param {function} onDone — called when the splash finishes
 */
const SplashScreen = ({ onDone }) => {
  const [phase, setPhase] = useState(1);      // 1 | 2 | 3
  const [msgIndex, setMsgIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  /* Phase transitions */
  useEffect(() => {
    const t1 = setTimeout(() => setPhase(2), 3000);
    const t2 = setTimeout(() => setPhase(3), 5000);
    const t3 = setTimeout(() => {
      setVisible(false);
      setTimeout(onDone, 600); // wait for fade-out then unmount
    }, 8000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [onDone]);

  /* Rotate messages in phase 3 */
  useEffect(() => {
    if (phase !== 3) return;
    const iv = setInterval(() => {
      setMsgIndex(i => (i + 1) % PHASE_MESSAGES.length);
    }, 1100);
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
          {/* Brand mark */}
          <motion.div
            className="splash-brand"
            initial={{ opacity: 0, y: -18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <img src="/favicon.svg" alt="NAR" className="splash-logo" />
            <span className="splash-brand-name">NAR</span>
          </motion.div>

          {/* Bolt */}
          <motion.div
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.45, delay: 0.2, ease: 'backOut' }}
          >
            <NarLoader overlay={false} size="md" />
          </motion.div>

          {/* Phase 1 — no label */}

          {/* Phase 2 — static label */}
          <AnimatePresence mode="wait">
            {phase === 2 && (
              <motion.p
                key="phase2"
                className="splash-msg"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.35 }}
              >
                Getting things ready…
              </motion.p>
            )}

            {/* Phase 3 — rotating messages */}
            {phase === 3 && (
              <motion.p
                key={`phase3-${msgIndex}`}
                className="splash-msg"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.3 }}
              >
                {PHASE_MESSAGES[msgIndex]}
              </motion.p>
            )}
          </AnimatePresence>

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
