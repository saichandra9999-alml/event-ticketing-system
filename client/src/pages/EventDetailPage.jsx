import React, { useState, useEffect } from 'react';
import { ArrowLeft, Calendar, MapPin, Ticket, AlertCircle, Loader2, Lock, CheckCircle2 } from 'lucide-react';
import api from '../services/api';
import { getSocket } from '../services/socket';
import { useAuth } from '../context/AuthContext';
import SeatMap from '../components/SeatMap';
import LockTimer from '../components/LockTimer';
import BookingModal from '../components/BookingModal';
import ReceiptModal from '../components/ReceiptModal';

function EventDetailPage({ eventId, onBack, onOpenAuth }) {
  const { user } = useAuth();
  const [event, setEvent] = useState(null);
  const [groupedSeats, setGroupedSeats] = useState({});
  const [selectedSeatIds, setSelectedSeatIds] = useState([]);
  const [lockedState, setLockedState] = useState({ isLocked: false, expiresAt: null });
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');

  // Modal States
  const [isBookingModalOpen, setIsBookingModalOpen] = useState(false);
  const [completedBooking, setCompletedBooking] = useState(null);

  const fetchEventAndSeats = async () => {
    try {
      const [eventRes, seatsRes] = await Promise.all([
        api.get(`/api/events/${eventId}`),
        api.get(`/api/events/${eventId}/seats`),
      ]);

      if (eventRes.data.success) {
        setEvent(eventRes.data.data);
      }

      if (seatsRes.data.success) {
        setGroupedSeats(seatsRes.data.data.rows);
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to load event details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEventAndSeats();

    // Subscribe to Real-time WebSockets
    const socket = getSocket();

    const handleSeatsLocked = (data) => {
      if (data.eventId === eventId) {
        setGroupedSeats((prevRows) => {
          const updatedRows = { ...prevRows };
          for (const rowKey in updatedRows) {
            updatedRows[rowKey] = updatedRows[rowKey].map((seat) => {
              if (data.seatIds.includes(seat.id)) {
                return {
                  ...seat,
                  status: 'LOCKED',
                  bookedById: data.lockedById,
                  lockExpiresAt: data.lockExpiresAt,
                };
              }
              return seat;
            });
          }
          return updatedRows;
        });
      }
    };

    const handleSeatsReleased = (data) => {
      setGroupedSeats((prevRows) => {
        const updatedRows = { ...prevRows };
        for (const rowKey in updatedRows) {
          updatedRows[rowKey] = updatedRows[rowKey].map((seat) => {
            if (data.seatIds.includes(seat.id)) {
              return {
                ...seat,
                status: 'AVAILABLE',
                bookedById: null,
                lockExpiresAt: null,
              };
            }
            return seat;
          });
        }
        return updatedRows;
      });
    };

    const handleSeatsBooked = (data) => {
      if (data.eventId === eventId) {
        setGroupedSeats((prevRows) => {
          const updatedRows = { ...prevRows };
          for (const rowKey in updatedRows) {
            updatedRows[rowKey] = updatedRows[rowKey].map((seat) => {
              if (data.seatIds.includes(seat.id)) {
                return {
                  ...seat,
                  status: 'BOOKED',
                  lockExpiresAt: null,
                };
              }
              return seat;
            });
          }
          return updatedRows;
        });
      }
    };

    socket.on('seats_locked', handleSeatsLocked);
    socket.on('seats_released', handleSeatsReleased);
    socket.on('seats_booked', handleSeatsBooked);

    return () => {
      socket.off('seats_locked', handleSeatsLocked);
      socket.off('seats_released', handleSeatsReleased);
      socket.off('seats_booked', handleSeatsBooked);
    };
  }, [eventId]);

  const handleToggleSeat = (seat) => {
    if (seat.status === 'BOOKED') return;
    if (seat.status === 'LOCKED' && seat.bookedById !== user?.id) return;

    if (selectedSeatIds.includes(seat.id)) {
      setSelectedSeatIds(selectedSeatIds.filter((id) => id !== seat.id));
    } else {
      setSelectedSeatIds([...selectedSeatIds, seat.id]);
    }
  };

  const getAllSelectedSeatObjects = () => {
    const selected = [];
    for (const rowKey in groupedSeats) {
      for (const seat of groupedSeats[rowKey]) {
        if (selectedSeatIds.includes(seat.id)) {
          selected.push(seat);
        }
      }
    }
    return selected;
  };

  const handleLockSeats = async () => {
    if (!user) {
      onOpenAuth();
      return;
    }

    if (selectedSeatIds.length === 0) return;

    setActionLoading(true);
    setError('');

    try {
      const response = await api.post('/api/bookings/lock', {
        eventId,
        seatIds: selectedSeatIds,
      });

      if (response.data.success) {
        setLockedState({
          isLocked: true,
          expiresAt: response.data.data.lockExpiresAt,
        });
        setIsBookingModalOpen(true);
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to lock seats');
      fetchEventAndSeats();
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmBooking = async ({ paymentMethod, simulateFailure }) => {
    try {
      const response = await api.post('/api/bookings/confirm', {
        eventId,
        seatIds: selectedSeatIds,
        paymentMethod,
        simulateFailure,
      });

      if (response.data.success) {
        setCompletedBooking(response.data.data);
        setIsBookingModalOpen(false);
        setSelectedSeatIds([]);
        setLockedState({ isLocked: false, expiresAt: null });
        fetchEventAndSeats();
      }
    } catch (err) {
      const errMsg = err.response?.data?.message || err.message || 'Payment process failed';
      setError(`Payment Simulation Failed: ${errMsg}`);
      setIsBookingModalOpen(false);
      setSelectedSeatIds([]);
      setLockedState({ isLocked: false, expiresAt: null });
      fetchEventAndSeats();
      throw err;
    }
  };

  const handleLockExpired = () => {
    setSelectedSeatIds([]);
    setLockedState({ isLocked: false, expiresAt: null });
    setIsBookingModalOpen(false);
    setError('Your 5-minute seat reservation has expired. Please re-select seats.');
    fetchEventAndSeats();
  };

  const selectedSeatObjects = getAllSelectedSeatObjects();
  const totalPrice = selectedSeatObjects.reduce((sum, s) => sum + s.price, 0);

  if (loading) {
    return (
      <div className="py-24 text-center space-y-3">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin mx-auto" />
        <p className="text-xs text-slate-400">Loading seat map...</p>
      </div>
    );
  }

  if (error && !event) {
    return (
      <div className="max-w-md mx-auto py-12 px-4 text-center">
        <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-2xl">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
          <p className="text-xs text-red-300 font-medium mb-4">{error}</p>
          <button onClick={onBack} className="px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-semibold">
            Back to Events
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Back Button */}
      <button
        onClick={onBack}
        className="inline-flex items-center space-x-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Events</span>
      </button>

      {/* Error Alert Header */}
      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-between text-xs text-red-400">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError('')} className="text-slate-400 hover:text-white">Dismiss</button>
        </div>
      )}

      {/* Event Details Banner */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <span className="inline-block px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[11px] font-semibold tracking-wider mb-2">
            {event.category}
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white mb-2">{event.title}</h1>
          <p className="text-xs text-slate-400 max-w-2xl leading-relaxed mb-4">{event.description}</p>
          <div className="flex flex-wrap gap-4 text-xs text-slate-300">
            <div className="flex items-center space-x-2 text-slate-400">
              <Calendar className="w-4 h-4 text-blue-400" />
              <span>{new Date(event.date).toLocaleDateString()} &bull; {new Date(event.date).toLocaleTimeString()}</span>
            </div>
            <div className="flex items-center space-x-2 text-slate-400">
              <MapPin className="w-4 h-4 text-emerald-400" />
              <span>{event.venue?.name}, {event.venue?.city}</span>
            </div>
          </div>
        </div>

        {/* Starting Price & Available Tickets Info */}
        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800/80 shrink-0 text-right space-y-1">
          <span className="text-[10px] text-slate-500 font-mono block uppercase">Base Price</span>
          <span className="text-2xl font-bold text-white">${event.price.toFixed(2)}</span>
          <span className="text-[11px] text-emerald-400 font-medium block">
            {event.availableTickets} Tickets Left
          </span>
        </div>
      </div>

      {/* Main Seat Map & Checkout Sidebar Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
        {/* Seat Map Column */}
        <div className="lg:col-span-2">
          <SeatMap
            groupedSeats={groupedSeats}
            selectedSeatIds={selectedSeatIds}
            onToggleSeat={handleToggleSeat}
            currentUserId={user?.id}
          />
        </div>

        {/* Selection & Checkout Sidebar Column */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6 sticky top-20">
          <div className="flex justify-between items-center pb-4 border-b border-slate-800">
            <h3 className="text-base font-bold text-slate-100">Selected Tickets</h3>
            {lockedState.isLocked && (
              <LockTimer expiresAt={lockedState.expiresAt} onExpire={handleLockExpired} />
            )}
          </div>

          {selectedSeatObjects.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-xs">
              <Ticket className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p>Click on available seats on the map to select</p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                {selectedSeatObjects.map((seat) => (
                  <div key={seat.id} className="flex justify-between items-center bg-slate-950 p-3 rounded-xl border border-slate-800 text-xs">
                    <div>
                      <span className="font-mono font-bold text-slate-200">Row {seat.row} - Seat {seat.seatNumber}</span>
                      <span className="text-[10px] text-slate-500 block">{seat.type} Tier</span>
                    </div>
                    <span className="font-mono font-semibold text-white">${seat.price.toFixed(2)}</span>
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-slate-800 flex justify-between items-center">
                <span className="text-xs font-semibold text-slate-400">Total Price:</span>
                <span className="text-xl font-bold text-blue-400 font-mono">${totalPrice.toFixed(2)}</span>
              </div>

              {lockedState.isLocked ? (
                <button
                  onClick={() => setIsBookingModalOpen(true)}
                  className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center space-x-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Proceed to Checkout</span>
                </button>
              ) : (
                <button
                  onClick={handleLockSeats}
                  disabled={actionLoading}
                  className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs shadow-lg shadow-blue-500/20 transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
                >
                  {actionLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Lock className="w-4 h-4" />
                      <span>Lock & Reserve Seats (5m)</span>
                    </>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Checkout Modal */}
      <BookingModal
        isOpen={isBookingModalOpen}
        onClose={() => setIsBookingModalOpen(false)}
        event={event}
        selectedSeats={selectedSeatObjects}
        lockExpiresAt={lockedState.expiresAt}
        onConfirmBooking={handleConfirmBooking}
        onLockExpired={handleLockExpired}
      />

      {/* Booking Success Receipt Modal */}
      <ReceiptModal
        isOpen={!!completedBooking}
        booking={completedBooking}
        onClose={() => {
          setCompletedBooking(null);
          onBack();
        }}
      />
    </div>
  );
}

export default EventDetailPage;
