import { useEffect, useState } from 'react';
import { AdminDashboard } from './components/AdminDashboard';
import { AdminPinModal } from './components/AdminPinModal';
import { BindingModal } from './components/BindingModal';
import { CalendarView } from './components/CalendarView';
import { HomeView } from './components/HomeView';
import { QRScannerModal } from './components/QRScannerModal';
import { RSVPModal } from './components/RSVPModal';
import { getBoundDeviceProfile, isAdminLoggedIn } from './services/auth';
import { sheetsService } from './services/sheets';
import type { BoundDeviceProfile, Schedule } from './types/rollbook';

export function App() {
  // Device binding state
  const [profile, setProfile] = useState<BoundDeviceProfile | null>(() => getBoundDeviceProfile());
  const [showBindingModal, setShowBindingModal] = useState(false);

  // View state: 'HOME' | 'CALENDAR' | 'ADMIN'
  const [currentView, setCurrentView] = useState<'HOME' | 'CALENDAR' | 'ADMIN'>('HOME');

  // Modal states
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [rsvpSchedule, setRsvSchedule] = useState<Schedule | null>(null);
  const [showAdminPinModal, setShowAdminPinModal] = useState(false);

  // Refresh trigger for re-rendering when data changes
  const [refreshKey, setRefreshKey] = useState(0);
  const triggerRefresh = () => setRefreshKey((k) => k + 1);

  // Automatic remote sync on initial load
  useEffect(() => {
    let isCancelled = false;
    sheetsService
      .fetchRemoteData()
      .then(() => {
        if (!isCancelled) {
          triggerRefresh();
        }
      })
      .catch((err) => {
        console.warn('[App] Initial sheet sync fallback:', err);
      });

    return () => {
      isCancelled = true;
    };
  }, []);

  const activeSchedules = sheetsService.getSchedules();
  const currentSchedule = activeSchedules[0];

  // If user has not bound a device yet, show binding prompt
  const isBound = profile !== null;

  const handleDeviceBound = (newProfile: BoundDeviceProfile) => {
    setProfile(newProfile);
    setShowBindingModal(false);
    triggerRefresh();
  };

  const handleOpenAdmin = () => {
    if (isAdminLoggedIn()) {
      setCurrentView('ADMIN');
    } else {
      setShowAdminPinModal(true);
    }
  };

  return (
    <div className={`app-shell ${currentView === 'ADMIN' ? 'admin-mode' : ''}`}>
      {/* If not bound, force initial binding modal */}
      {!isBound && (
        <BindingModal onSuccess={handleDeviceBound} />
      )}

      {/* Main Views */}
      {isBound && currentView === 'HOME' && (
        <HomeView
          profile={profile}
          onOpenQRScanner={() => setShowQRScanner(true)}
          onOpenRSVP={(sch) => setRsvSchedule(sch)}
          onOpenAdmin={handleOpenAdmin}
          onChangeProfile={() => setShowBindingModal(true)}
          onViewCalendar={() => setCurrentView('CALENDAR')}
          refreshTrigger={refreshKey}
        />
      )}

      {isBound && currentView === 'CALENDAR' && (
        <CalendarView
          profile={profile}
          onOpenRSVP={(sch) => setRsvSchedule(sch)}
          onBackToHome={() => setCurrentView('HOME')}
        />
      )}

      {isBound && currentView === 'ADMIN' && (
        <AdminDashboard
          onBackToHome={() => {
            setCurrentView('HOME');
            triggerRefresh();
          }}
          onDataChanged={triggerRefresh}
        />
      )}

      {/* Overlay Modals */}
      {showBindingModal && isBound && (
        <BindingModal
          onSuccess={handleDeviceBound}
          onClose={() => setShowBindingModal(false)}
        />
      )}

      {showQRScanner && currentSchedule && profile && (
        <QRScannerModal
          schedule={currentSchedule}
          profile={profile}
          onClose={() => setShowQRScanner(false)}
          onSuccess={() => {
            setShowQRScanner(false);
            triggerRefresh();
          }}
        />
      )}

      {rsvpSchedule && profile && (
        <RSVPModal
          schedule={rsvpSchedule}
          profile={profile}
          currentVote={sheetsService.getRSVPVotes(rsvpSchedule.id).find((v) => v.memberId === profile.memberId)}
          onClose={() => setRsvSchedule(null)}
          onSuccess={() => {
            setRsvSchedule(null);
            triggerRefresh();
          }}
        />
      )}

      {showAdminPinModal && (
        <AdminPinModal
          onSuccess={() => {
            setShowAdminPinModal(false);
            setCurrentView('ADMIN');
          }}
          onClose={() => setShowAdminPinModal(false)}
        />
      )}
    </div>
  );
}

export default App;
