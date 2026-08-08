import React from 'react';
import { Armchair, Sparkles } from 'lucide-react';

function SeatMap({ groupedSeats, selectedSeatIds, onToggleSeat, currentUserId }) {
  const rowKeys = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

  const getSeatStatusClass = (seat) => {
    const isSelected = selectedSeatIds.includes(seat.id);

    if (isSelected) {
      return 'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-500/50 scale-105 z-10';
    }

    if (seat.status === 'BOOKED') {
      return 'bg-red-500/10 border-red-500/20 text-red-500/40 cursor-not-allowed';
    }

    if (seat.status === 'LOCKED') {
      const isLockedBySelf = seat.bookedById === currentUserId;
      if (isLockedBySelf) {
        return 'bg-amber-500/20 border-amber-500/40 text-amber-300 animate-pulse cursor-pointer';
      }
      return 'bg-amber-500/10 border-amber-500/20 text-amber-500/40 cursor-not-allowed';
    }

    // Available Seat Styling based on Type
    if (seat.type === 'VIP') {
      return 'bg-purple-500/10 hover:bg-purple-500/30 border-purple-500/30 text-purple-300 hover:scale-105';
    } else if (seat.type === 'Premium') {
      return 'bg-indigo-500/10 hover:bg-indigo-500/30 border-indigo-500/30 text-indigo-300 hover:scale-105';
    }
    return 'bg-emerald-500/10 hover:bg-emerald-500/30 border-emerald-500/30 text-emerald-300 hover:scale-105';
  };

  return (
    <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl">
      {/* Stage / Screen Visual */}
      <div className="mb-10 text-center">
        <div className="w-3/4 mx-auto h-3 bg-gradient-to-r from-blue-600 via-indigo-500 to-blue-600 rounded-full shadow-lg shadow-blue-500/30 mb-2"></div>
        <p className="text-[10px] uppercase font-mono tracking-widest text-slate-500">STAGE / STRENGTH CURVE</p>
      </div>

      {/* Seat Map Legend */}
      <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 mb-8 text-xs font-medium text-slate-300 bg-slate-950/60 p-4 rounded-2xl border border-slate-800">
        <div className="flex items-center space-x-2">
          <span className="w-4 h-4 rounded-md bg-emerald-500/20 border border-emerald-500/50"></span>
          <span>🟢 Available</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="w-4 h-4 rounded-md bg-blue-600 border border-blue-400"></span>
          <span>🔵 Selected</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="w-4 h-4 rounded-md bg-amber-500/20 border border-amber-500/40"></span>
          <span>🟡 Locked (5m)</span>
        </div>
        <div className="flex items-center space-x-2">
          <span className="w-4 h-4 rounded-md bg-red-500/20 border border-red-500/30"></span>
          <span>🔴 Booked</span>
        </div>
      </div>

      {/* Seat Grid Layout */}
      <div className="space-y-3 overflow-x-auto pb-4">
        {rowKeys.map((rowLabel) => {
          const seatsInRow = groupedSeats[rowLabel] || [];
          const rowType = seatsInRow[0]?.type || (rowLabel <= 'B' ? 'VIP' : rowLabel <= 'F' ? 'Premium' : 'Regular');

          return (
            <div key={rowLabel} className="flex items-center justify-center space-x-2 min-w-[550px]">
              {/* Row Label */}
              <div className="w-8 text-center font-mono font-bold text-xs text-slate-400">
                {rowLabel}
              </div>

              {/* Seats Matrix */}
              <div className="flex items-center space-x-2">
                {seatsInRow.map((seat) => {
                  const isSelectable = seat.status === 'AVAILABLE' || (seat.status === 'LOCKED' && seat.bookedById === currentUserId);

                  return (
                    <button
                      key={seat.id}
                      disabled={!isSelectable && seat.status !== 'AVAILABLE'}
                      onClick={() => onToggleSeat(seat)}
                      className={`w-9 h-9 sm:w-10 sm:h-10 rounded-xl border flex flex-col items-center justify-center font-mono text-[11px] font-semibold transition-all ${getSeatStatusClass(seat)}`}
                      title={`Row ${seat.row} - Seat ${seat.seatNumber} | ${seat.type} ($${seat.price})`}
                    >
                      <span>{seat.seatNumber}</span>
                    </button>
                  );
                })}
              </div>

              {/* Row Tier Badge */}
              <div className="w-20 text-left pl-2">
                <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border ${
                  rowType === 'VIP' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                  rowType === 'Premium' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' :
                  'bg-slate-800 text-slate-400 border-slate-700'
                }`}>
                  {rowType}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default SeatMap;
