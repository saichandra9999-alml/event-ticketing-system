import React, { useState, useEffect } from 'react';
import { Clock, AlertTriangle } from 'lucide-react';

function LockTimer({ expiresAt, onExpire }) {
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    if (!expiresAt) return;

    const targetTime = new Date(expiresAt).getTime();

    const updateTimer = () => {
      const now = new Date().getTime();
      const difference = Math.max(0, Math.floor((targetTime - now) / 1000));
      setTimeLeft(difference);

      if (difference <= 0) {
        if (onExpire) onExpire();
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [expiresAt, onExpire]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const formattedTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const isUrgent = timeLeft < 60;

  return (
    <div className={`inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-xl border font-mono text-xs font-bold ${
      isUrgent
        ? 'bg-red-500/20 text-red-400 border-red-500/40 animate-pulse'
        : 'bg-amber-500/10 text-amber-300 border-amber-500/30'
    }`}>
      {isUrgent ? (
        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
      ) : (
        <Clock className="w-4 h-4 text-amber-400 shrink-0 animate-spin" />
      )}
      <span>Seats reserved for {formattedTime}</span>
    </div>
  );
}

export default LockTimer;
