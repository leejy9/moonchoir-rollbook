import React from 'react';
import moonchoirLogo from '../assets/moonchoir-logo.png';
import { useMasterEntryGesture } from '../hooks/useMasterEntryGesture';
import { IconSettings } from './Icons';

export interface AppHeaderProps {
  onOpenAdmin: () => void;
  onOpenSuperAdmin: () => void;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  onOpenAdmin,
  onOpenSuperAdmin,
}) => {
  const { showEasterEgg, setShowEasterEgg, easterEggRef, logoHandlers } =
    useMasterEntryGesture();

  return (
    <header className="home-header app-header" style={{ padding: '8px 16px 6px' }}>
      <div className="header-brand" style={{ position: 'relative' }}>
        <img
          src={moonchoirLogo}
          alt="Moonchoir"
          className="brand-logo-img"
          draggable={false}
          onTouchStart={logoHandlers.onTouchStart}
          onTouchMove={logoHandlers.onTouchMove}
          onTouchEnd={logoHandlers.onTouchEnd}
          onTouchCancel={logoHandlers.onTouchCancel}
          onContextMenu={logoHandlers.onContextMenu}
          title="우클릭(PC) 또는 3연타(모바일) 시 최고 관리자 메뉴를 엽니다"
          style={{
            width: 38,
            height: 38,
            borderRadius: '50%',
            objectFit: 'cover',
            cursor: 'pointer',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            WebkitTouchCallout: 'none',
            touchAction: 'manipulation',
          }}
        />
        <div>
          <h1 className="brand-title">문콰이어 출석부</h1>
          <p className="brand-subtitle">MOONCHOIR ATTENDANCE</p>
        </div>

        {/* Master Admin "Get in" Easter Egg Popover */}
        {showEasterEgg && (
          <div
            ref={easterEggRef}
            data-testid="easter-egg-popover"
            style={{
              position: 'absolute',
              top: '44px',
              left: '0px',
              zIndex: 1000,
              background: 'var(--bg-card, #1e293b)',
              border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.1))',
              borderRadius: '8px',
              padding: '4px',
              boxShadow: '0 4px 14px rgba(0, 0, 0, 0.2)',
              minWidth: '130px',
            }}
          >
            <button
              type="button"
              onClick={() => {
                setShowEasterEgg(false);
                onOpenSuperAdmin();
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
                width: '100%',
                background: 'transparent',
                border: 'none',
                color: 'var(--text-white, #FFFFFF)',
                padding: '8px 10px',
                borderRadius: '6px',
                fontSize: '12.5px',
                fontWeight: 500,
                cursor: 'pointer',
                minHeight: '44px',
                minWidth: '44px',
                textAlign: 'left',
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)')
              }
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span>Get in</span>
              <span
                style={{
                  fontSize: '10.5px',
                  fontWeight: 500,
                  color: 'var(--text-muted, #94a3b8)',
                  background: 'rgba(255, 255, 255, 0.08)',
                  padding: '1px 5px',
                  borderRadius: '4px',
                }}
              >
                Master
              </span>
            </button>
          </div>
        )}
      </div>

      <div className="header-actions">
        <button
          type="button"
          className="admin-icon-btn"
          onClick={onOpenAdmin}
          title="관리자 모드"
          aria-label="관리자 모드"
          style={{ minWidth: 44, minHeight: 44 }}
        >
          <IconSettings size={18} />
        </button>
      </div>
    </header>
  );
};
