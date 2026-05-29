import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import './DateTimeBadge.css';

const DateTimeBadge = ({ compact = false }) => {
  const [now, setNow] = useState(() => new Date());

  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const time = now.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: compact ? undefined : '2-digit',
  });

  const date = now.toLocaleDateString([], {
    weekday: compact ? undefined : 'short',
    month: 'short',
    day: 'numeric',
    year: compact ? undefined : 'numeric',
  });

  const zoneName = now
    .toLocaleTimeString([], { timeZoneName: 'short' })
    .split(' ')
    .at(-1);

  return (
    <div className={`date-time-badge ${compact ? 'compact' : ''}`} title={timeZone}>
      <CalendarClock size={18} />
      <div className="date-time-copy">
        <span className="date-time-clock">{time}</span>
        <span className="date-time-date">{date} · {zoneName}</span>
      </div>
    </div>
  );
};

export default DateTimeBadge;
