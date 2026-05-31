import React from 'react';
import './Loader.css';

const BoltMark = ({ sm = false, className = '' }) => (
  <div className={`nar-bolt${sm ? ' nar-bolt-sm' : ''}${className ? ` ${className}` : ''}`}>
    <div className="nar-bolt-aura" />
    <div className="nar-bolt-ring" />
    <svg className="nar-bolt-symbol" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="narBoltGold" x1="13" y1="5" x2="53" y2="59" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#fff8bd" />
          <stop offset="0.42" stopColor="#ffd84f" />
          <stop offset="0.72" stopColor="#ffab16" />
          <stop offset="1" stopColor="#fff1a6" />
        </linearGradient>
      </defs>
      <path
        d="M38.6 4.8 12.4 36.2c-1.25 1.48-.2 3.75 1.74 3.75h15.4l-5.05 18.55c-.66 2.45 2.45 3.95 3.93 1.88l24.2-33.82c1.06-1.5-.02-3.56-1.86-3.56H36.34l5.92-15.4c.86-2.24-2.12-4.64-3.66-2.8Z"
        fill="url(#narBoltGold)"
      />
    </svg>
    <span className="nar-arc arc-one" />
    <span className="nar-arc arc-two" />
    <span className="nar-spark spark-one" />
    <span className="nar-spark spark-two" />
    <span className="nar-spark spark-three" />
    <span className="nar-particle particle-one" />
    <span className="nar-particle particle-two" />
    <span className="nar-particle particle-three" />
    <span className="nar-particle particle-four" />
    <span className="nar-particle particle-five" />
  </div>
);

export { BoltMark };

const NarLoader = ({
  overlay = true,
  fullscreen = false,
  label = 'Loading...',
  size = 'md',
}) => {
  if (size === 'sm') {
    return (
      <span className="nar-loader-inline">
        <BoltMark sm />
        {label && (
          <span className="nar-loader-inline-label">{label}</span>
        )}
      </span>
    );
  }

  if (!overlay) return <BoltMark />;

  return (
    <div
      className={`nar-loader-overlay${fullscreen ? ' fullscreen' : ''}`}
      role="status"
      aria-label={label || 'Loading'}
    >
      <BoltMark />
      {label && <p className="nar-loader-label">{label}</p>}
    </div>
  );
};

export default NarLoader;
