import React from 'react';
import type { MemberTab } from '../utils/route';

export interface BottomNavProps {
  currentTab: MemberTab;
  onSelectTab: (tab: MemberTab) => void;
}

/**
 * 모바일 최우선 3탭 하단 내비게이션 바 (v3).
 * - 3개 탭: 홈(집) / 연습실(음표) / 내 활동(사람)
 * - 버튼 최소 44×44px 터치 타깃 보장
 * - 순수 SVG 아이콘과 텍스트 사용 (이모지 엄격 금지)
 * - 현재 탭에 aria-current="page" 부여
 */
export const BottomNav: React.FC<BottomNavProps> = ({ currentTab, onSelectTab }) => {
  return (
    <nav className="bottom-nav" aria-label="주요 메뉴">
      <button
        type="button"
        className={`bottom-nav-btn ${currentTab === 'home' ? 'active' : ''}`}
        aria-current={currentTab === 'home' ? 'page' : undefined}
        onClick={() => onSelectTab('home')}
      >
        <svg
          className="bottom-nav-icon"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
        <span className="bottom-nav-label">홈</span>
      </button>

      <button
        type="button"
        className={`bottom-nav-btn ${currentTab === 'studio' ? 'active' : ''}`}
        aria-current={currentTab === 'studio' ? 'page' : undefined}
        onClick={() => onSelectTab('studio')}
      >
        <svg
          className="bottom-nav-icon"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M9 18V5l12-2v13" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
        <span className="bottom-nav-label">연습실</span>
      </button>

      <button
        type="button"
        className={`bottom-nav-btn ${currentTab === 'profile' ? 'active' : ''}`}
        aria-current={currentTab === 'profile' ? 'page' : undefined}
        onClick={() => onSelectTab('profile')}
      >
        <svg
          className="bottom-nav-icon"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        <span className="bottom-nav-label">내 활동</span>
      </button>
    </nav>
  );
};
