import React from 'react';
import type { MemberTab } from '../utils/route';

export interface BottomNavProps {
  currentTab: MemberTab;
  onSelectTab: (tab: MemberTab) => void;
}

/**
 * 모바일 최우선 3탭 하단 내비게이션 바.
 * - 버튼 최소 44×44px 터치 타깃 보장
 * - 순수 텍스트와 활성 표시선만 사용 (아이콘 및 이모지 엄격 금지)
 * - 현재 탭에 aria-current="page" 부여
 */
export const BottomNav: React.FC<BottomNavProps> = ({ currentTab, onSelectTab }) => {
  return (
    <nav className="bottom-nav" aria-label="주요 메뉴">
      <button
        type="button"
        className={`bottom-nav-btn ${currentTab === 'today' ? 'active' : ''}`}
        aria-current={currentTab === 'today' ? 'page' : undefined}
        onClick={() => onSelectTab('today')}
      >
        <span className="bottom-nav-label">오늘</span>
      </button>

      <button
        type="button"
        className={`bottom-nav-btn ${currentTab === 'calendar' ? 'active' : ''}`}
        aria-current={currentTab === 'calendar' ? 'page' : undefined}
        onClick={() => onSelectTab('calendar')}
      >
        <span className="bottom-nav-label">일정</span>
      </button>

      <button
        type="button"
        className={`bottom-nav-btn ${currentTab === 'studio' ? 'active' : ''}`}
        aria-current={currentTab === 'studio' ? 'page' : undefined}
        onClick={() => onSelectTab('studio')}
      >
        <span className="bottom-nav-label">연습실</span>
      </button>

      <button
        type="button"
        className={`bottom-nav-btn ${currentTab === 'profile' ? 'active' : ''}`}
        aria-current={currentTab === 'profile' ? 'page' : undefined}
        onClick={() => onSelectTab('profile')}
      >
        <span className="bottom-nav-label">내 활동</span>
      </button>
    </nav>
  );
};
