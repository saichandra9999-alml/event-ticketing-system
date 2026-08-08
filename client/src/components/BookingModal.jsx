import React, { useState } from 'react';
import { X, CreditCard, Smartphone, Building2, Ticket, AlertCircle, Loader2, CheckCircle2, ShieldCheck } from 'lucide-react';
import LockTimer from './LockTimer';

function BookingModal({ isOpen, onClose, event, selectedSeats, lockExpiresAt, onConfirmBooking, onLockExpired }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CARD');
  const [simulateFailure, setSimulateFailure] = useState(false);

  if (!isOpen || !event) return null;

  const totalAmount = selectedSeats.reduce((sum, seat) => sum + seat.price, 0);

  const handleConfirm = async () => {
    setLoading(true);
    setError('');
    try {
      await onConfirmBooking({ paymentMethod, simulateFailure });
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Payment simulation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-2 mb-1">
          <ShieldCheck className="w-5 h-5 text-blue-400" />
          <h2 className="text-xl font-bold text-slate-100">Demo Payment Simulation</h2>
        </div>
        <p className="text-xs text-slate-400 mb-6">College Project &bull; No real money or payment keys required</p>

        {/* Lock Expiration Timer */}
        <div className="mb-6 flex justify-center">
          <LockTimer expiresAt={lockExpiresAt} onExpire={onLockExpired} />
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center space-x-2 text-xs text-red-400">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Event Summary */}
        <div className="bg-slate-950/60 rounded-2xl p-4 border border-slate-800/80 mb-5 space-y-2 text-xs text-slate-300">
          <div className="flex justify-between">
            <span className="text-slate-400">Event:</span>
            <span className="font-semibold text-slate-100">{event.title}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Venue:</span>
            <span>{event.venue?.name}, {event.venue?.city}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Date:</span>
            <span>{new Date(event.date).toLocaleDateString()}</span>
          </div>
        </div>

        {/* Selected Seats List */}
        <div className="mb-5">
          <h4 className="text-xs font-semibold text-slate-400 uppercase font-mono tracking-wider mb-2">Selected Seats ({selectedSeats.length})</h4>
          <div className="max-h-28 overflow-y-auto space-y-1.5 pr-1">
            {selectedSeats.map((seat) => (
              <div key={seat.id} className="flex justify-between items-center bg-slate-950 p-2 rounded-xl border border-slate-800 text-xs">
                <div className="flex items-center space-x-2">
                  <Ticket className="w-3.5 h-3.5 text-blue-400" />
                  <span className="font-mono font-bold text-slate-200">Row {seat.row} - Seat {seat.seatNumber}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">{seat.type}</span>
                </div>
                <span className="font-mono font-semibold text-white">${seat.price.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Demo Payment Method Selector */}
        <div className="mb-5">
          <h4 className="text-xs font-semibold text-slate-400 uppercase font-mono tracking-wider mb-2">Payment Method</h4>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setPaymentMethod('CARD')}
              className={`p-2.5 rounded-xl border text-xs font-semibold flex flex-col items-center justify-center space-y-1 transition-all ${
                paymentMethod === 'CARD'
                  ? 'bg-blue-600/20 border-blue-500 text-blue-400'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <CreditCard className="w-4 h-4" />
              <span>Card</span>
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod('UPI')}
              className={`p-2.5 rounded-xl border text-xs font-semibold flex flex-col items-center justify-center space-y-1 transition-all ${
                paymentMethod === 'UPI'
                  ? 'bg-blue-600/20 border-blue-500 text-blue-400'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <Smartphone className="w-4 h-4" />
              <span>UPI</span>
            </button>
            <button
              type="button"
              onClick={() => setPaymentMethod('NET_BANKING')}
              className={`p-2.5 rounded-xl border text-xs font-semibold flex flex-col items-center justify-center space-y-1 transition-all ${
                paymentMethod === 'NET_BANKING'
                  ? 'bg-blue-600/20 border-blue-500 text-blue-400'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <Building2 className="w-4 h-4" />
              <span>NetBanking</span>
            </button>
          </div>
        </div>

        {/* Development Test Toggle for Payment Failure */}
        <div className="mb-5 flex items-center space-x-2 bg-amber-500/10 border border-amber-500/20 p-2.5 rounded-xl">
          <input
            type="checkbox"
            id="simFailure"
            checked={simulateFailure}
            onChange={(e) => setSimulateFailure(e.target.checked)}
            className="w-4 h-4 text-blue-600 rounded bg-slate-900 border-slate-700"
          />
          <label htmlFor="simFailure" className="text-[11px] text-amber-300 font-medium cursor-pointer">
            Simulate Payment Failure (Test seat release lifecycle)
          </label>
        </div>

        {/* Total Price & Submit */}
        <div className="pt-3 border-t border-slate-800 flex justify-between items-center mb-5">
          <span className="text-xs font-semibold text-slate-300">Total Payable:</span>
          <span className="text-xl font-bold text-blue-400 font-mono">${totalAmount.toFixed(2)}</span>
        </div>

        <button
          onClick={handleConfirm}
          disabled={loading}
          className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-2xl text-xs shadow-xl shadow-blue-500/25 transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Processing Demo Payment...</span>
            </>
          ) : (
            <>
              <CheckCircle2 className="w-4 h-4" />
              <span>Pay Now & Confirm Booking</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default BookingModal;
