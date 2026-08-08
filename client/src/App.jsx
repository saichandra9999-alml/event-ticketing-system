import React, { useState } from 'react';
import { AuthProvider } from './context/AuthContext';
import Navbar from './components/Navbar';
import AuthModal from './components/AuthModal';
import EventListPage from './pages/EventListPage';
import EventDetailPage from './pages/EventDetailPage';
import MyBookingsPage from './pages/MyBookingsPage';

function MainApp() {
  const [currentView, setCurrentView] = useState('events'); // 'events', 'event-detail', 'my-bookings'
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  const handleSelectEvent = (eventId) => {
    setSelectedEventId(eventId);
    setCurrentView('event-detail');
  };

  const handleGoHome = () => {
    setSelectedEventId(null);
    setCurrentView('events');
  };

  const handleGoMyBookings = () => {
    setCurrentView('my-bookings');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans antialiased flex flex-col justify-between selection:bg-blue-600 selection:text-white">
      {/* Top Header Navbar */}
      <Navbar
        onOpenAuth={() => setIsAuthModalOpen(true)}
        onGoHome={handleGoHome}
        onNavigateMyBookings={handleGoMyBookings}
        currentView={currentView}
      />

      {/* Main View Router */}
      <main className="flex-grow">
        {currentView === 'my-bookings' ? (
          <MyBookingsPage onBrowseEvents={handleGoHome} />
        ) : currentView === 'event-detail' && selectedEventId ? (
          <EventDetailPage
            eventId={selectedEventId}
            onBack={handleGoHome}
            onOpenAuth={() => setIsAuthModalOpen(true)}
          />
        ) : (
          <EventListPage onSelectEvent={handleSelectEvent} />
        )}
      </main>

      {/* Auth Login & Registration Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
      />

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-6 text-center text-xs text-slate-500 font-mono">
        Eventix &bull; Production Real-Time Seat Booking Engine &bull; Milestones 1–8 Operational
      </footer>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}

export default App;
