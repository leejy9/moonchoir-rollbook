import React, { useState } from 'react';
import { useBlockingOverlay } from '../../hooks/useBlockingOverlay';
import { seenStateStore } from '../../services/seenStateStore';
import type { NewsItem, SeenStateItem } from '../../types/rollbook';
import type { EvaluatedSticker } from '../../utils/praiseStickerDefinitions';
import { stickerImageUrl } from '../../utils/praiseStickers';
import { IconCalendar, IconChat } from '../Icons';
import '../../styles/v3/news.css';

interface NewsSheetProps {
  canonicalId: string;
  unread: NewsItem[];
  read: NewsItem[];
  stickers: EvaluatedSticker[];
  windowDays: number;
  onShowMore: () => void;
  onSelectItem: (item: NewsItem) => void;
  onClose: () => void;
}

export const NewsSheet: React.FC<NewsSheetProps> = ({
  canonicalId,
  unread,
  read,
  stickers,
  windowDays,
  onShowMore,
  onSelectItem,
  onClose,
}) => {
  useBlockingOverlay(true);

  // 연 동안 새로 들어온 소식은 읽음이 되지 않도록 연 순간의 목록을 고정한다.
  const [frozenUnread, setFrozenUnread] = useState<NewsItem[]>(() => unread);
  const [frozenRead, setFrozenRead] = useState<NewsItem[]>(() => read);
  const [prevWindowDays, setPrevWindowDays] = useState(windowDays);
  if (windowDays !== prevWindowDays) {
    setPrevWindowDays(windowDays);
    setFrozenUnread(unread);
    setFrozenRead(read);
  }

  const stickerById = new Map(stickers.map((s) => [s.id, s]));

  const handleClose = () => {
    const items: SeenStateItem[] = [];
    let maxNewsAt = -Infinity;
    const unvotedScheduleIds = new Set<string>();

    for (const item of frozenUnread) {
      if (item.kind === 'reaction' || item.kind === 'comment' || item.kind === 'mention') {
        if (item.at > maxNewsAt) maxNewsAt = item.at;
      } else if (item.kind === 'unvoted' && item.scheduleId) {
        unvotedScheduleIds.add(item.scheduleId);
      }
    }

    if (maxNewsAt > -Infinity) {
      items.push({ kind: 'news', scope: '', upTo: new Date(maxNewsAt).toISOString() });
    }
    for (const sid of unvotedScheduleIds) {
      items.push({ kind: 'vote', scope: sid });
    }

    if (items.length > 0) {
      void seenStateStore.markSeen(canonicalId, items);
    }
    onClose();
  };

  const handleMarkAllRead = () => {
    if (frozenUnread.length === 0) return;
    const items: SeenStateItem[] = [{ kind: 'news', scope: '' }];
    for (const item of frozenUnread) {
      if (item.kind === 'sticker' && item.stickerId) {
        items.push({ kind: 'sticker', scope: item.stickerId });
      } else if (item.kind === 'unvoted' && item.scheduleId) {
        items.push({ kind: 'vote', scope: item.scheduleId });
      }
    }
    void seenStateStore.markSeen(canonicalId, items);
    setFrozenRead((prev) => [...frozenUnread, ...prev].sort((a, b) => b.at - a.at));
    setFrozenUnread([]);
  };

  const handleItemClick = (item: NewsItem) => {
    if (item.kind === 'sticker' && item.stickerId) {
      void seenStateStore.markSeen(canonicalId, [{ kind: 'sticker', scope: item.stickerId }]);
    } else if (item.kind === 'unvoted' && item.scheduleId) {
      void seenStateStore.markSeen(canonicalId, [{ kind: 'vote', scope: item.scheduleId }]);
    }
    onSelectItem(item);
  };

  const renderIcon = (item: NewsItem) => {
    if (item.kind === 'reaction') {
      return <span aria-hidden="true">{item.emoji ?? '👍'}</span>;
    }
    if (item.kind === 'comment' || item.kind === 'mention') {
      return <IconChat size={18} aria-hidden="true" />;
    }
    if (item.kind === 'unvoted') {
      return <IconCalendar size={18} aria-hidden="true" />;
    }
    const sticker = item.stickerId ? stickerById.get(item.stickerId) : undefined;
    if (sticker) {
      return <img src={stickerImageUrl(sticker.image)} alt="" className="news-sticker-img" />;
    }
    return <span aria-hidden="true">⭐</span>;
  };

  const renderList = (items: NewsItem[], isUnreadList: boolean) => (
    <ul className="news-list">
      {items.map((item) => (
        <li key={item.key}>
          <button
            type="button"
            className={`news-item-btn ${isUnreadList ? 'unread' : ''}`}
            onClick={() => handleItemClick(item)}
          >
            <span className="news-item-icon">{renderIcon(item)}</span>
            <span className="news-item-content">
              <div className="news-item-title">{item.title}</div>
              {item.sub && <div className="news-item-sub">{item.sub}</div>}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );

  const isEmpty = frozenUnread.length === 0 && frozenRead.length === 0;

  return (
    <div
      className="news-backdrop"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="news-sheet" role="dialog" aria-modal="true" aria-label="새 소식">
        <div className="news-handle" aria-hidden="true" />
        <div className="news-header">
          <h2 className="news-title">새 소식</h2>
          <div className="news-header-actions">
            <button
              type="button"
              className="news-mark-all-btn"
              disabled={frozenUnread.length === 0}
              onClick={handleMarkAllRead}
            >
              모두 읽음
            </button>
            <button type="button" className="news-close-btn" aria-label="닫기" onClick={handleClose}>
              ✕
            </button>
          </div>
        </div>

        <div className="news-body">
          {isEmpty ? (
            <div className="news-empty">
              <p className="news-empty-title">새 소식이 없어요</p>
              <p className="news-empty-sub">댓글에 반응이 달리거나 투표할 일정이 생기면 알려 드릴게요</p>
            </div>
          ) : (
            <>
              {frozenUnread.length > 0 && (
                <section>
                  <h3 className="news-section-label">새로 온 소식</h3>
                  {renderList(frozenUnread, true)}
                </section>
              )}
              {frozenRead.length > 0 && (
                <section>
                  <h3 className="news-section-label">지난 소식</h3>
                  {renderList(frozenRead, false)}
                </section>
              )}
            </>
          )}

          <div className="news-footer">
            {windowDays < 90 ? (
              <button type="button" className="news-more-btn" onClick={onShowMore}>
                이전 소식 더 보기
              </button>
            ) : (
              <span className="news-window-note">최근 {windowDays}일 소식만 보여요</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
