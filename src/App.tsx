import { useEffect, useState } from 'react';
import { AdminDashboard } from './components/AdminDashboard';
import { AdminPinModal } from './components/AdminPinModal';
import { BindingModal } from './components/BindingModal';
import { CalendarView } from './components/CalendarView';
import { HomeView } from './components/HomeView';
import { MemberPortalModal } from './components/MemberPortalModal';
import { QRScannerModal } from './components/QRScannerModal';
import { RSVPModal } from './components/RSVPModal';
import { SyncStatus } from './components/SyncStatus';
import {
  clearDeviceProfile,
  getBoundDeviceProfile,
  isAdminLoggedIn,
  touchAdminSession,
  updateBoundDeviceProfile,
} from './services/auth';
import { sheetsService } from './services/sheets';
import {
  getDarkModePreference,
  getDisplayModePreference,
  saveDarkModePreference,
  saveDisplayModePreference,
  type DisplayMode,
} from './services/displayMode';
import type { BoundDeviceProfile, Schedule } from './types/rollbook';
import { getKSTDateString } from './utils/date';

export function App() {
  // Device binding state
  const [profile, setProfile] = useState<BoundDeviceProfile | null>(() => getBoundDeviceProfile());
  const [hasConfirmedRosterSync, setHasConfirmedRosterSync] = useState(false);
  const [showBindingModal, setShowBindingModal] = useState(false);
  const [showMemberPortalModal, setShowMemberPortalModal] = useState(false);

  // View state: 'HOME' | 'CALENDAR' | 'ADMIN'
  const [currentView, setCurrentView] = useState<'HOME' | 'CALENDAR' | 'ADMIN'>('HOME');
  const [displayMode, setDisplayMode] = useState<DisplayMode>(getDisplayModePreference);
  const [isDarkMode, setIsDarkMode] = useState(getDarkModePreference);

  // Modal states
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [qrTargetSchedule, setQrTargetSchedule] = useState<Schedule | null>(null);
  const [rsvpSchedule, setRsvSchedule] = useState<Schedule | null>(null);
  const [showAdminPinModal, setShowAdminPinModal] = useState(false);

  // Refresh trigger for re-rendering when data changes
  const [refreshKey, setRefreshKey] = useState(0);
  const triggerRefresh = () => setRefreshKey((k) => k + 1);

  // Automatic remote sync on initial load
  useEffect(() => {
    let isCancelled = false;
    sheetsService.refreshRemoteData({ force: true }).then((synced) => {
      if (synced && !isCancelled) {
        setHasConfirmedRosterSync(true);
        triggerRefresh();
      }
    });

    return () => {
      isCancelled = true;
    };
  }, []);

  // 시트에서 새 데이터를 받아오면(또는 상태가 바뀌면) 화면을 다시 그린다
  useEffect(() => sheetsService.subscribeSync(() => setRefreshKey((k) => k + 1)), []);

  // 다른 사람이 바꾼 내용을 보려면: 앱으로 돌아오거나 네트워크가 복구될 때 새로 받아온다(20초 이내 재요청은 건너뜀)
  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') void sheetsService.refreshRemoteData();
    };
    const refreshWhenOnline = () => void sheetsService.refreshRemoteData({ force: true });
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('online', refreshWhenOnline);
    return () => {
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('online', refreshWhenOnline);
    };
  }, []);

  // 화면 전환·주요 창을 열 때 최신 데이터를 받아온다
  const isRsvpOpen = rsvpSchedule !== null;
  useEffect(() => {
    void sheetsService.refreshRemoteData();
  }, [currentView, showMemberPortalModal, showQRScanner, isRsvpOpen]);

  const activeSchedules = sheetsService.getSchedules();
  const [todayStr, setTodayStr] = useState(() => getKSTDateString());

  useEffect(() => {
    const timer = setInterval(() => {
      const currentKst = getKSTDateString();
      setTodayStr((prev) => (prev !== currentKst ? currentKst : prev));
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (currentView !== 'ADMIN') return;

    let lastPersistedActivity = Date.now();
    const returnHomeIfExpired = () => {
      if (!isAdminLoggedIn()) {
        setCurrentView('HOME');
        triggerRefresh();
        return true;
      }
      return false;
    };
    const handleActivity = () => {
      if (returnHomeIfExpired()) return;
      if (Date.now() - lastPersistedActivity >= 30_000) {
        touchAdminSession();
        lastPersistedActivity = Date.now();
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') returnHomeIfExpired();
    };

    const activityEvents: Array<keyof WindowEventMap> = ['pointerdown', 'keydown', 'touchstart', 'scroll'];
    activityEvents.forEach((eventName) =>
      window.addEventListener(eventName, handleActivity, { passive: true })
    );
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', returnHomeIfExpired);
    const timer = window.setInterval(returnHomeIfExpired, 30_000);

    return () => {
      activityEvents.forEach((eventName) =>
        window.removeEventListener(eventName, handleActivity)
      );
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', returnHomeIfExpired);
      window.clearInterval(timer);
    };
  }, [currentView]);

  // Synchronize bound profile with remote/local member data if part or name changed in Sheets
  useEffect(() => {
    if (!profile || !hasConfirmedRosterSync) return;
    const members = sheetsService.getMembers(true);
    const current = members.find((m) => m.id === profile.memberId);
    if (!current) {
      clearDeviceProfile();
      queueMicrotask(() => {
        setShowMemberPortalModal(false);
        setCurrentView('HOME');
        setProfile(null);
      });
      return;
    }
    if (current.part !== profile.part || current.name !== profile.name) {
      const updated = updateBoundDeviceProfile({
        name: current.name,
        part: current.part,
      });
      if (updated) {
        queueMicrotask(() => {
          setProfile(updated);
        });
      }
    }
  }, [hasConfirmedRosterSync, profile, refreshKey]);

  const currentSchedule =
    qrTargetSchedule ||
    activeSchedules.find((s) => !s.isCancelled && !s.isArchived && s.date === todayStr) ||
    activeSchedules.find((s) => !s.isCancelled && !s.isArchived && s.date >= todayStr);

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

  const handleDisplayModeChange = (mode: DisplayMode) => {
    saveDisplayModePreference(mode);
    setDisplayMode(mode);
  };

  const handleDarkModeChange = (enabled: boolean) => {
    saveDarkModePreference(enabled);
    setIsDarkMode(enabled);
  };

  return (
    <div
      className={`app-shell ${currentView === 'ADMIN' ? 'admin-mode' : ''}`}
      data-display-mode={displayMode}
      data-theme={isDarkMode ? 'dark' : 'light'}
    >
      {/* If not bound, force initial binding modal */}
      {!isBound && (
        <BindingModal onSuccess={handleDeviceBound} />
      )}

      {/* Main Views */}
      {isBound && currentView === 'HOME' && (
        <HomeView
          profile={profile}
          onOpenQRScanner={(sch) => {
            if (sch) setQrTargetSchedule(sch);
            setShowQRScanner(true);
          }}
          onOpenRSVP={(sch) => setRsvSchedule(sch)}
          onOpenAdmin={handleOpenAdmin}
          onChangeProfile={() => setShowBindingModal(true)}
          onOpenProfilePortal={() => setShowMemberPortalModal(true)}
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
          refreshTrigger={refreshKey}
        />
      )}

      <SyncStatus />

      {/* Overlay Modals */}
      {showBindingModal && isBound && (
        <BindingModal
          onSuccess={handleDeviceBound}
          onClose={() => setShowBindingModal(false)}
        />
      )}

      {showMemberPortalModal && profile && (
        <MemberPortalModal
          profile={profile}
          onClose={() => setShowMemberPortalModal(false)}
          onChangeBinding={() => {
            setShowMemberPortalModal(false);
            setShowBindingModal(true);
          }}
          onOpenRSVP={(sch) => {
            setShowMemberPortalModal(false);
            setRsvSchedule(sch);
          }}
          onOpenQRScanner={(sch) => {
            setShowMemberPortalModal(false);
            if (sch) setQrTargetSchedule(sch);
            setShowQRScanner(true);
          }}
          displayMode={displayMode}
          isDarkMode={isDarkMode}
          onChangeDisplayMode={handleDisplayModeChange}
          onChangeDarkMode={handleDarkModeChange}
          onLogout={async () => {
            clearDeviceProfile();
            setProfile(null);
            setShowMemberPortalModal(false);
          }}
          onRefreshData={triggerRefresh}
        />
      )}

      {showQRScanner && currentSchedule && profile && (
        <QRScannerModal
          schedule={currentSchedule}
          profile={profile}
          onClose={() => {
            setShowQRScanner(false);
            setQrTargetSchedule(null);
          }}
          onSuccess={() => {
            setShowQRScanner(false);
            setQrTargetSchedule(null);
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
