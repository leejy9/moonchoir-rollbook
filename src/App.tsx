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
import { ProfileTab } from './components/ProfileTab';
import { StudioTab } from './components/StudioTab';
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
import type { BoundDeviceProfile } from './types/rollbook';
import { parseRoute, type MemberTab } from './utils/route';
import { AudioPlayerProvider } from './components/audio/AudioPlayerProvider';
import { useAudioPlayer } from './components/audio/audioPlayerContext';
import { MiniPlayer } from './components/audio/MiniPlayer';

function MainApp() {
  const { closePlayer } = useAudioPlayer();

  // Device binding state
  const [profile, setProfile] = useState<BoundDeviceProfile | null>(() => getBoundDeviceProfile());
  const [hasConfirmedRosterSync, setHasConfirmedRosterSync] = useState(false);
  const [showBindingModal, setShowBindingModal] = useState(false);

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
  const overlayKind = route.area === 'member' ? route.overlay?.kind : undefined;
  const isManagementArea = route.area === 'admin' || route.area === 'superAdmin';

  useEffect(() => {
    if (isManagementArea || overlayKind) {
      void sheetsService.refreshRemoteData();
    }
  }, [isManagementArea, overlayKind]);

  const activeSchedules = sheetsService.getSchedulesForMember(profile?.memberId);

  // Overlay 대상 일정이 없거나 비공개/숨김 대상인 경우 모달을 열지 않고 오버레이를 닫는다
  useEffect(() => {
    if (route.area === 'member' && route.overlay) {
      if (route.overlay.kind === 'qr' || route.overlay.kind === 'rsvp') {
        const targetId = route.overlay.scheduleId;
        const exists = activeSchedules.some((s) => s.id === targetId);
        if (!exists) {
          navigate({ type: 'CLOSE' });
        }
      }
    }
  }, [route, activeSchedules, navigate]);

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

  const qrSchedule =
    route.area === 'member' && route.overlay?.kind === 'qr'
      ? activeSchedules.find((s) => s.id === route.overlay?.scheduleId) ?? null
      : null;

  const targetRsvpSchedule =
    route.area === 'member' && route.overlay?.kind === 'rsvp'
      ? activeSchedules.find((s) => s.id === route.overlay?.scheduleId) ?? null
      : null;

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
                  navigate({ type: 'OPEN', overlay: { kind: 'qr', scheduleId: sch.id } });
                } else {
                  navigate({ type: 'TAB', tab: 'today' });
                }
              }}
              onOpenRSVP={(sch) => {
                navigate({ type: 'OPEN', overlay: { kind: 'rsvp', scheduleId: sch.id } });
              }}
              onOpenAdmin={handleOpenAdmin}
              onOpenSuperAdmin={handleOpenSuperAdmin}
              onChangeProfile={() => setShowBindingModal(true)}
              onOpenProfilePortal={() => navigate({ type: 'TAB', tab: 'profile' })}
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
              onOpenRSVP={(sch) => {
                navigate({ type: 'OPEN', overlay: { kind: 'rsvp', scheduleId: sch.id } });
              }}
              refreshTrigger={refreshKey}
            />
          )}

          {route.tab === 'studio' && profile && (
            <StudioTab
              onOpenAdmin={handleOpenAdmin}
            />
          )}

          {route.tab === 'profile' && profile && (
            <ProfileTab
              profile={profile}
              displayMode={displayMode}
              isDarkMode={isDarkMode}
              onChangeDisplayMode={handleDisplayModeChange}
              onChangeDarkMode={handleDarkModeChange}
              onChangeBinding={() => setShowBindingModal(true)}
              onLogout={async () => {
                closePlayer();
                clearDeviceProfile();
                setProfile(null);
                navigate({ type: 'RESET' });
              }}
              onRefreshData={triggerRefresh}
              onOpenRSVP={(sch) => {
                navigate({ type: 'OPEN', overlay: { kind: 'rsvp', scheduleId: sch.id } });
              }}
              onOpenQRScanner={(sch) => {
                if (sch) {
                  navigate({ type: 'OPEN', overlay: { kind: 'qr', scheduleId: sch.id } });
                } else {
                  navigate({ type: 'TAB', tab: 'today' });
                }
              }}
              onOpenAdmin={handleOpenAdmin}
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

      {/* Mini Audio Player (Fixed above BottomNav) */}
      {isBound && route.area === 'member' && <MiniPlayer />}

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



      {route.area === 'member' && route.overlay?.kind === 'qr' && qrSchedule && profile && (
        <QRScannerModal
          schedule={qrSchedule}
          profile={profile}
          onClose={() => navigate({ type: 'CLOSE' })}
          onSuccess={() => {
            navigate({ type: 'CLOSE' });
            triggerRefresh();
          }}
        />
      )}

      {route.area === 'member' && route.overlay?.kind === 'rsvp' && targetRsvpSchedule && profile && (
        <RSVPModal
          schedule={targetRsvpSchedule}
          profile={profile}
          currentVote={sheetsService.getRSVPVotes(targetRsvpSchedule.id).find((v) => v.memberId === profile.memberId)}
          onClose={() => navigate({ type: 'CLOSE' })}
          onSuccess={() => {
            navigate({ type: 'CLOSE' });
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

export function App() {
  return (
    <AudioPlayerProvider>
      <MainApp />
    </AudioPlayerProvider>
  );
}

export default App;
