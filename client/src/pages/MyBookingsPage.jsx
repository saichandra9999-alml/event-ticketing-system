import React, { useState, useEffect } from 'react';
import { Ticket, Calendar, MapPin, CreditCard, ShieldCheck, Loader2, AlertCircle, ArrowRight, ExternalLink } from 'lucide-react';
import api from '../services/api';
import ReceiptModal from '../components/ReceiptModal';

function MyBookingsPage({ onBrowseEvents }) {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedBooking, setSelectedBooking] = useState(null);

  const fetchMyBookings = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/api/bookings/my-bookings');
      if (response.data.success) {
        setBookings(response.data.data);
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to fetch booking history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyBookings();
  }, []);

  if (loading) {
    return (
      <div className="py-24 text-center space-y-3">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto" />
        <p className="text-xs text-slate-400">Loading your booking history...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-slate-900/60 border border-slate-800 p-6 sm:p-8 rounded-3xl">
        <div>
          <span className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-semibold mb-2">
            <Ticket className="w-3.5 h-3.5" />
            <span>Customer Dashboard</span>
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">My Booking History</h1>
          <p className="text-xs text-slate-400">View and manage your confirmed event tickets & payment receipts</p>
        </div>

        <button
          onClick={onBrowseEvents}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs shadow-lg shadow-blue-500/20 transition-all flex items-center space-x-2"
        >
          <span>Browse Events</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center space-x-2 text-xs text-red-400">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Empty State */}
      {bookings.length === 0 ? (
        <div className="py-20 text-center bg-slate-900/40 rounded-3xl border border-slate-800 p-8 space-y-4 max-w-lg mx-auto">
          <div className="w-16 h-16 bg-slate-800/80 text-slate-500 rounded-2xl flex items-center justify-center mx-auto">
            <Ticket className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-200">No Bookings Found</h3>
            <p className="text-xs text-slate-500 mt-1">You haven't reserved any event tickets yet.</p>
          </div>
          <button
            onClick={onBrowseEvents}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition-all shadow-lg shadow-blue-500/20 inline-flex items-center space-x-2"
          >
            <span>Discover Events Now</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      ) : (
        /* Bookings List Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {bookings.map((booking) => (
            <div
              key={booking.id}
              onClick={() => setSelectedBooking(booking)}
              className="bg-slate-900/80 hover:bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-3xl p-6 transition-all duration-300 shadow-xl cursor-pointer flex flex-col justify-between space-y-4 group relative overflow-hidden"
            >
              <div className="space-y-3">
                {/* Event Title & Status */}
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <span className="text-[10px] font-mono text-slate-500 uppercase block mb-1">
                      {booking.event?.category || 'EVENT'}
                    </span>
                    <h3 className="text-base font-bold text-slate-100 group-hover:text-blue-400 transition-colors line-clamp-1">
                      {booking.event?.title}
                    </h3>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold shrink-0">
                    {booking.bookingStatus}
                  </span>
                </div>

                {/* Event Date & Venue */}
                <div className="space-y-1.5 text-xs text-slate-400 font-sans">
                  <div className="flex items-center space-x-2">
                    <Calendar className="w-3.5 h-3.5 text-blue-400" />
                    <span>{new Date(booking.event?.date).toLocaleDateString()} &bull; {new Date(booking.event?.date).toLocaleTimeString()}</span>
                  </div>
                  {booking.event?.venue && (
                    <div className="flex items-center space-x-2">
                      <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="truncate">{booking.event.venue.name}, {booking.event.venue.city}</span>
                    </div>
                  )}
                </div>

                {/* Seats List Badges */}
                <div className="pt-2 border-t border-slate-800/80">
                  <span className="text-[10px] font-mono text-slate-500 block mb-1.5">RESERVED SEATS:</span>
                  <div className="flex flex-wrap gap-1.5">
                    {booking.bookingSeats?.map((bs) => (
                      <span key={bs.id} className="px-2 py-0.5 rounded bg-blue-600/20 text-blue-300 border border-blue-500/30 text-[10px] font-mono font-bold">
                        Row {bs.seat?.row}-{bs.seat?.seatNumber}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Payment Details Footer */}
              <div className="pt-3 border-t border-slate-800 flex justify-between items-center text-xs">
                <div>
                  <span className="text-[10px] font-mono text-slate-500 block">TOTAL PAID</span>
                  <span className="text-base font-bold font-mono text-emerald-400">${booking.totalAmount?.toFixed(2)}</span>
                </div>

                <div className="text-right">
                  <span className="text-[10px] font-mono text-slate-500 block">TXN ID</span>
                  <span className="text-[11px] font-mono font-bold text-slate-300 truncate max-w-[120px] block">
                    {booking.payment?.transactionId || 'N/A'}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Full Digital Receipt Modal */}
      <ReceiptModal
        isOpen={!!selectedBooking}
        booking={selectedBooking}
        onClose={() => setSelectedBooking(null)}
      />
    </div>
  );
}

export default MyBookingsPage;
