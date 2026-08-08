import React from 'react';
import { CheckCircle2, Ticket, Calendar, MapPin, ArrowLeft, ShieldCheck, CreditCard } from 'lucide-react';

function ReceiptModal({ isOpen, booking, onClose }) {
  if (!isOpen || !booking) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 sm:p-8 shadow-2xl relative overflow-hidden text-center">
        {/* Success Icon */}
        <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/10">
          <CheckCircle2 className="w-10 h-10" />
        </div>

        <h2 className="text-2xl font-bold text-slate-100 mb-1">Demo Payment Successful!</h2>
        <p className="text-xs text-slate-400 mb-6">Your tickets have been issued successfully</p>

        {/* Ticket Digital Card */}
        <div className="bg-slate-950 rounded-2xl p-5 border border-slate-800/90 text-left mb-6 space-y-3 font-mono text-xs">
          <div className="flex justify-between items-center pb-2.5 border-b border-slate-800">
            <span className="text-slate-500 text-[10px]">BOOKING ID:</span>
            <span className="text-blue-400 font-bold truncate max-w-[180px]">{booking.id}</span>
          </div>

          {booking.payment?.transactionId && (
            <div className="flex justify-between items-center pb-2.5 border-b border-slate-800">
              <span className="text-slate-500 text-[10px]">TRANSACTION ID:</span>
              <span className="text-emerald-400 font-bold truncate max-w-[180px]">{booking.payment.transactionId}</span>
            </div>
          )}

          <div>
            <span className="text-slate-500 text-[10px] block">EVENT:</span>
            <span className="text-slate-200 font-bold text-sm">{booking.event?.title}</span>
          </div>

          <div className="flex justify-between items-center">
            <div>
              <span className="text-slate-500 text-[10px] block">TOTAL PAID:</span>
              <span className="text-emerald-400 font-bold text-base">${booking.totalAmount?.toFixed(2)}</span>
            </div>
            <div className="text-right">
              <span className="text-slate-500 text-[10px] block">METHOD:</span>
              <span className="text-blue-300 font-bold px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-[10px]">
                {booking.payment?.paymentMethod || 'CARD'}
              </span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800/80">
            <span className="text-slate-500 text-[10px] block mb-1">CONFIRMED SEATS:</span>
            <div className="flex flex-wrap gap-1.5">
              {booking.bookingSeats?.map((bs) => (
                <span key={bs.id} className="px-2 py-1 rounded bg-blue-600/20 text-blue-300 border border-blue-500/30 text-[11px] font-bold">
                  Row {bs.seat?.row}-{bs.seat?.seatNumber}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Navigation Actions */}
        <div className="flex space-x-3">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition-all shadow-lg shadow-blue-500/20 flex items-center justify-center space-x-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Events</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export default ReceiptModal;
