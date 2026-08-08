import React from 'react';
import { Calendar, MapPin, Ticket, ArrowRight, Tag } from 'lucide-react';

function EventCard({ event, onSelectEvent }) {
  const formattedDate = new Date(event.date).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const formattedTime = new Date(event.date).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-2xl p-6 shadow-xl hover:border-slate-700 transition-all group flex flex-col justify-between">
      <div>
        {/* Top Badges */}
        <div className="flex items-center justify-between mb-4">
          <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[11px] font-semibold tracking-wider">
            <Tag className="w-3 h-3 mr-1" />
            {event.category || 'CONCERT'}
          </span>
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] font-medium">
            <Ticket className="w-3 h-3 mr-1" />
            {event.availableTickets} Available
          </span>
        </div>

        {/* Title & Description */}
        <h3 className="text-lg font-bold text-slate-100 group-hover:text-blue-400 transition-colors line-clamp-1 mb-2">
          {event.title}
        </h3>
        <p className="text-xs text-slate-400 line-clamp-2 mb-6 leading-relaxed">
          {event.description}
        </p>
      </div>

      <div>
        {/* Date & Location Meta */}
        <div className="space-y-2 mb-6 text-xs text-slate-300">
          <div className="flex items-center space-x-2 text-slate-400">
            <Calendar className="w-4 h-4 text-blue-400 shrink-0" />
            <span>{formattedDate} &bull; {formattedTime}</span>
          </div>
          <div className="flex items-center space-x-2 text-slate-400">
            <MapPin className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="truncate">{event.venue?.name || 'Venue'}, {event.venue?.city || ''}</span>
          </div>
        </div>

        {/* Price & Action */}
        <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between">
          <div>
            <span className="text-[10px] text-slate-500 block uppercase font-mono">From</span>
            <span className="text-lg font-bold text-white">${event.price.toFixed(2)}</span>
          </div>
          <button
            onClick={() => onSelectEvent(event.id)}
            className="inline-flex items-center space-x-2 px-4 py-2 bg-slate-800 hover:bg-blue-600 text-slate-200 hover:text-white rounded-xl text-xs font-semibold transition-all group-hover:shadow-lg group-hover:shadow-blue-500/20"
          >
            <span>Book Tickets</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default EventCard;
