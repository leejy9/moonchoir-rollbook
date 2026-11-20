import { useEffect, useRef, useState } from 'react';
import { AdminDashboard } from './components/AdminDashboard';
import { SuperAdminDashboard } from './components/admin/SuperAdminDashboard';
import { AdminPinModal } from './components/AdminPinModal';
import { AppHeader } from './components/AppHeader';
import { BindingModal } from './components/BindingModal';
import { BottomNav } from './components/BottomNav';
import { CalendarTab } from './components/CalendarTab';
import { HomeView } from './components/HomeView';
import { ScheduleDetailSheet } from './components/ScheduleDetailSheet';
import { MemberPortalModal } from './components/MemberPortalModal';
import { QRScannerModal } from './components/QRScannerModal';
import { RSVPModal } from './components/RSVPModal';
import { SyncStatus } from './components/SyncStatus';
import { useHashRoute } from './hooks/useHashRoute';
import {
  clearDeviceProfile,
  getBoundDeviceProfile,
  isAdminLoggedIn,
  isSuperAdminLoggedIn,
  touchAdminSession,
  touchSuperAdminSession,
  updateBoundDeviceProfile,
} from './services/auth';
import { sheetsService } from './services/sheets';
import {
  getActiveSupabaseRealtime,
  getBackupPollingIntervalMs,
  startSupabaseRealtime,
  stopSupabaseRealtime,
} from './services/realtime/supabaseRealtime';
import {
  getDarkModePreference,
  getDisplayModePreference,
  saveDarkModePreference,
  saveDisplayModePreference,
  type DisplayMode,
} from './services/displayMode';
import type { BoundDeviceProfile, Schedule } from './types/rollbook';
import { parseRoute, type MemberTab } from './utils/route';

export function App() {
  // Device binding state
  const [profile, setProfile] = useState<BoundDeviceProfile | null>(() => getBoundDeviceProfile());
  const [hasConfirmedRosterSync, setHasConfirmedRosterSync] = useState(false);
  const [showBindingModal, setShowBindingModal] = useState(false);
  const [showMemberPortalModal, setShowMemberPortalModal] = useState(false);

  // Hash-based routing state
  const { route, navigate } = useHashRoute();
  const pendingHashRef = useRef<string | null>(null);

  useEffect(() => {
    if (profile === null && typeof window !== 'undefined') {
      const raw = window.location.hash.trim().replace(/^#\/?/, '');
      if (raw && raw !== 'today') {
        pendingHashRef.current = window.location.hash;
      }
    }
  }, [profile]);

  const [displayMode, setDisplayMode] = useState<DisplayMode>(getDisplayModePreference);
  const [isDarkMode, setIsDarkMode] = useState(getDarkModePreference);

  // Modal states
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [qrTargetSchedule, setQrTargetSchedule] = useState<Schedule | null>(null);
  const [rsvpSchedule, setRsvSchedule] = useState<Schedule | null>(null);
  const [showAdminPinModal, setShowAdminPinModal] = useState(false);
  const [showSuperAdminPinModal, setShowSuperAdminPinModal] = useState(false);

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

  // Supabase 실시간 리스너 연결 및 해제
  useEffect(() => {
    if (sheetsService.getBackendKind() === 'supabase') {
      startSupabaseRealtime();
    }
    return () => {
      stopSupabaseRealtime();
    };
  }, []);

  // 다른 사람이 바꾼 내용을 보려면: 앱으로 돌아오거나 네트워크가 복구될 때 새로 받아온다
  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        if (sheetsService.getBackendKind() === 'supabase') {
          getActiveSupabaseRealtime()?.checkAndReconnect();
        }
        void sheetsService.refreshRemoteData({ force: true });
      }
    };
    const refreshWhenOnline = () => {
      if (sheetsService.getBackendKind() === 'supabase') {
        getActiveSupabaseRealtime()?.checkAndReconnect();
      }
      void sheetsService.refreshRemoteData({ force: true });
    };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    window.addEventListener('online', refreshWhenOnline);

    // Supabase 환경: 실시간 웹소켓 연결 시 5분, 연결 끊김 시 30초 간격으로 백업 동기화
    let lastBackupFetchAt = Date.now();
    const backupTimer = setInterval(() => {
      if (document.visibilityState !== 'visible' || sheetsService.getBackendKind() !== 'supabase') {
        return;
      }
      const isConnected = getActiveSupabaseRealtime()?.getIsConnected() ?? false;
      const intervalMs = getBackupPollingIntervalMs(isConnected);
      if (Date.now() - lastBackupFetchAt >= intervalMs) {
        lastBackupFetchAt = Date.now();
        void sheetsService.refreshRemoteData({ force: true });
      }
    }, 10000);

    return () => {
      document.removeEventListener('visibilitychange', refreshWhenVisible);
      window.removeEventListener('online', refreshWhenOnline);
      clearInterval(backupTimer);
    };
  }, []);

  // 관리자 진입 또는 모달/오버레이 오픈 시에만 최신 데이터를 동기화합니다 (단순 탭 전환은 로컬 캐시 사용).
  const isRsvpOpen = rsvpSchedule !== null;
  const overlayKind = route.area === 'member' ? route.overlay?.kind : undefined;
  const isManagementArea = route.area === 'admin' || route.area === 'superAdmin';

  useEffect(() => {
    if (isManagementArea || overlayKind || showMemberPortalModal || showQRScanner || isRsvpOpen) {
      void sheetsService.refreshRemoteData();
    }
  }, [isManagementArea, overlayKind, showMemberPortalModal, showQRScanner, isRsvpOpen]);

  const activeSchedules = sheetsService.getSchedulesForMember(profile?.memberId);

  useEffect(() => {
    if (route.area !== 'admin' && route.area !== 'superAdmin') return;

    let lastPersistedActivity = Date.now();
    const returnHomeIfExpired = () => {
      if (route.area === 'admin' && !isAdminLoggedIn()) {
        navigate({ type: 'RESET' });
        triggerRefresh();
        return true;
      }
      if (route.area === 'superAdmin' && !isSuperAdminLoggedIn()) {
        navigate({ type: 'RESET' });
        triggerRefresh();
        return true;
      }
      return false;
    };
    const handleActivity = () => {
      if (returnHomeIfExpired()) return;
      if (Date.now() - lastPersistedActivity >= 30_000) {
        if (route.area === 'admin') touchAdminSession();
        if (route.area === 'superAdmin') touchSuperAdminSession();
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
  }, [route.area, navigate]);

  // Synchronize bound profile with remote/local member data if part or name changed in Sheets
  useEffect(() => {
    if (!profile || !hasConfirmedRosterSync) return;
    const members = sheetsService.getMembers(true);
    const current = members.find((m) => m.id === profile.memberId);
    if (!current) {
      clearDeviceProfile();
      queueMicrotask(() => {
        setShowMemberPortalModal(false);
        navigate({ type: 'RESET' });
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
  }, [hasConfirmedRosterSync, navigate, profile, refreshKey]);

  const currentSchedule = qrTargetSchedule;

  // If user has not bound a device yet, show binding prompt
  const isBound = profile !== null;

  const handleDeviceBound = (newProfile: BoundDeviceProfile) => {
    setProfile(newProfile);
    setShowBindingModal(false);
    triggerRefresh();
    if (pendingHashRef.current) {
      const savedHash = pendingHashRef.current;
      pendingHashRef.current = null;
      const parsed = parseRoute(savedHash);
      if (parsed.area === 'member') {
        navigate({ type: 'TAB', tab: parsed.tab });
        if (parsed.overlay) {
          navigate({ type: 'OPEN', overlay: parsed.overlay });
        }
      }
    }
  };

  const handleOpenAdmin = () => {
    if (isAdminLoggedIn()) {
      navigate({ type: 'ADMIN' });
    } else {
      setShowAdminPinModal(true);
    }
  };

  const handleOpenSuperAdmin = () => {
    if (isSuperAdminLoggedIn()) {
      navigate({ type: 'SUPER' });
    } else {
      setShowSuperAdminPinModal(true);
    }
  };

  const handleSelectTab = (tab: MemberTab) => {
    if (tab === 'profile') {
      setShowMemberPortalModal(true);
      return;
    }
    navigate({ type: 'TAB', tab });
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
      className={`app-shell ${route.area === 'admin' ? 'admin-mode' : ''}`}
      data-display-mode={displayMode}
      data-theme={isDarkMode ? 'dark' : 'light'}
    >
      {/* If not bound, force initial binding modal */}
      {!isBound && (
        <BindingModal onSuccess={handleDeviceBound} />
      )}

      {/* Member Header */}
      {isBound && route.area === 'member' && (
        <AppHeader
          onOpenAdmin={handleOpenAdmin}
          onOpenSuperAdmin={handleOpenSuperAdmin}
        />
      )}

      {/* Member Content wrapped in main */}
      {isBound && route.area === 'member' && (
        <main className="app-member-main">
          {route.tab === 'today' && (
            <HomeView
              profile={profile}
              onOpenQRScanner={(sch) => {
                if (sch) {
                  setQrTargetSchedule(sch);
                  setShowQRScanner(true);
                } else {
                  setQrTargetSchedule(null);
                  setShowQRScanner(false);
                  navigate({ type: 'TAB', tab: 'today' });
                }
              }}
              onOpenRSVP={(sch) => setRsvSchedule(sch)}
              onOpenAdmin={handleOpenAdmin}
              onOpenSuperAdmin={handleOpenSuperAdmin}
              onChangeProfile={() => setShowBindingModal(true)}
              onOpenProfilePortal={() => setShowMemberPortalModal(true)}
              onOpenDetail={(sch) =>
                navigate({
                  type: 'OPEN',
                  overlay: { kind: 'scheduleSheet', date: sch.date, scheduleId: sch.id },
                })
              }
              onViewCalendar={() => navigate({ type: 'TAB', tab: 'calendar' })}
              refreshTrigger={refreshKey}
            />
          )}

          {route.tab === 'calendar' && (
            <CalendarTab
              profile={profile}
              month={route.month}
              selectedDate={route.overlay?.kind === 'scheduleSheet' ? route.overlay.date : undefined}
              onNavigate={navigate}
              onOpenRSVP={(sch) => setRsvSchedule(sch)}
              refreshTrigger={refreshKey}
            />
          )}
        </main>
      )}

      {/* Admin Dashboards */}
      {isBound && route.area === 'admin' && (
        <AdminDashboard
          onBackToHome={() => {
            navigate({ type: 'RESET' });
            triggerRefresh();
          }}
          onDataChanged={triggerRefresh}
          refreshTrigger={refreshKey}
        />
      )}

      {route.area === 'superAdmin' && (
        <SuperAdminDashboard
          onBackToHome={() => {
            navigate({ type: 'RESET' });
            triggerRefresh();
          }}
          onDataChanged={triggerRefresh}
          refreshTrigger={refreshKey}
        />
      )}

      {/* Member Bottom Navigation (Only visible when bound in member area) */}
      {isBound && route.area === 'member' && (
        <BottomNav
          currentTab={route.tab}
          onSelectTab={handleSelectTab}
        />
      )}

      <SyncStatus />

      {/* Overlay Modals */}
      {isBound && profile && route.area === 'member' && route.overlay?.kind === 'scheduleSheet' && (
        <ScheduleDetailSheet
          isOpen={true}
          date={route.overlay.date}
          scheduleId={route.overlay.scheduleId}
          schedules={activeSchedules}
          member={
            sheetsService.getMembers().find((m) => m.id === profile.memberId) || {
              id: profile.memberId,
              name: profile.name,
              part: profile.part,
              phoneLast4: profile.phoneLast4,
              role: 'MEMBER',
              status: 'ACTIVE',
              createdAt: '2026-01-01T00:00:00Z',
              joinedAt: '2020-01-01',
            }
          }
          onClose={() => navigate({ type: 'CLOSE' })}
        />
      )}

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
            if (sch) {
              setQrTargetSchedule(sch);
              setShowQRScanner(true);
            } else {
              setQrTargetSchedule(null);
              setShowQRScanner(false);
              navigate({ type: 'TAB', tab: 'today' });
            }
          }}
          onOpenAdmin={handleOpenAdmin}
          displayMode={displayMode}
          isDarkMode={isDarkMode}
          onChangeDisplayMode={handleDisplayModeChange}
          onChangeDarkMode={handleDarkModeChange}
          onLogout={async () => {
            clearDeviceProfile();
            setProfile(null);
            setShowMemberPortalModal(false);
            navigate({ type: 'RESET' });
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
            navigate({ type: 'ADMIN' });
          }}
          onClose={() => setShowAdminPinModal(false)}
        />
      )}

      {showSuperAdminPinModal && (
        <AdminPinModal
          isSuperAdminMode={true}
          onSuccess={() => {
            setShowSuperAdminPinModal(false);
            navigate({ type: 'SUPER' });
          }}
          onClose={() => setShowSuperAdminPinModal(false)}
        />
      )}
    </div>
  );
}

export default App;
