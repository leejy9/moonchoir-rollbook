import type { CumulativeMemberAttendance, Schedule } from '../../types/rollbook';
import type { PeriodOption } from '../../hooks/useAttendanceAdmin';
import { LiquidGauge } from '../LiquidGauge';
import { IconSearch, IconClose } from '../Icons';

export interface AdminStatsTabProps {
  periodOption: PeriodOption;
  setPeriodOption: (option: PeriodOption) => void;
  partFilter: string;
  setPartFilter: (part: string) => void;
  memberStatusFilter: string;
  setMemberStatusFilter: (status: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  selectedMemberIds: Set<string>;
  cumulativeSessions: Schedule[];
  filteredSummaries: CumulativeMemberAttendance[];
  selectedSummaries: CumulativeMemberAttendance[];
  selectedAvgRate: number;
  toggleSelectMember: (id: string) => void;
  selectAllFiltered: () => void;
  clearSelection: () => void;
  dynamicParts: string[];
  dynamicMemberStatuses: string[];
}

export const AdminStatsTab: React.FC<AdminStatsTabProps> = ({
  periodOption,
  setPeriodOption,
  partFilter,
  setPartFilter,
  memberStatusFilter,
  setMemberStatusFilter,
  searchQuery,
  setSearchQuery,
  selectedMemberIds,
  cumulativeSessions,
  filteredSummaries,
  selectedSummaries,
  selectedAvgRate,
  toggleSelectMember,
  selectAllFiltered,
  clearSelection,
  dynamicParts,
  dynamicMemberStatuses,
}) => {
  return (
    <div className="admin-tab-body">
      {/* 1. Period Selector Chips */}
      <div className="toss-section-card">
        <div className="section-title-row">
          <h3 className="section-title">기간 ({cumulativeSessions.length}회)</h3>
        </div>

        <div className="toss-filter-row" style={{ marginTop: '4px' }}>
          {(
            [
              { key: '1M', label: '1개월' },
              { key: '3M', label: '3개월' },
              { key: '6M', label: '6개월' },
              { key: 'YEAR', label: '올해' },
              { key: 'ALL', label: '전체' },
            ] as const
          ).map((p) => (
            <button
              key={p.key}
              type="button"
              className={`toss-filter-chip ${periodOption === p.key ? 'active' : ''}`}
              onClick={() => setPeriodOption(p.key)}
            >
              <span>{p.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 2. Multi-Select Target Comparison Card (Appears when >= 1 checked) */}
      {selectedSummaries.length > 0 && (
        <div
          className="toss-section-card"
          style={{
            backgroundColor: 'var(--brand-purple-soft)',
            borderColor: 'var(--brand-accent)',
            borderWidth: '1.5px',
          }}
        >
          <div className="section-title-row" style={{ flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
            <div style={{ flex: '1 1 auto', minWidth: '180px' }}>
              <span
                className="part-badge"
                style={{ backgroundColor: 'var(--brand-accent)', color: '#fff', marginBottom: '4px' }}
              >
                선택 대원 {selectedSummaries.length}명 비교 분석
              </span>
              <h3 className="section-title" style={{ color: '#191f28', marginTop: '4px' }}>
                선택 그룹 평균 출석률: {selectedAvgRate}%
              </h3>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <LiquidGauge percentage={selectedAvgRate} size={70} />
              <button
                type="button"
                className="btn-sync"
                style={{ height: '36px', padding: '0 12px', fontSize: '13px' }}
                onClick={clearSelection}
              >
                선택 해제
              </button>
            </div>
          </div>

          {/* Selected Members Mini Comparison Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))',
              gap: '8px',
              marginTop: '12px',
            }}
          >
            {selectedSummaries.map((sm) => (
              <div
                key={sm.memberId}
                style={{
                  background: '#fff',
                  padding: '10px',
                  borderRadius: '12px',
                  border: '1px solid #ECEBFC',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  textAlign: 'center',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: '6px' }}>
                  <span style={{ fontWeight: 600, fontSize: '13px', color: '#191f28' }}>{sm.memberName}</span>
                  <span className={`part-badge part-${sm.part}`} style={{ fontSize: '10px', padding: '1px 5px' }}>
                    {sm.part}
                  </span>
                </div>
                <LiquidGauge percentage={sm.attendanceRate} size={44} />
                <div style={{ fontSize: '11px', color: '#8b95a1', marginTop: '6px' }}>
                  출석 {sm.attended} · 지각 {sm.late} · 결석 {sm.absent}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 3. Filter & Search Controls */}
      <div className="toss-section-card">
        <div className="section-title-row">
          <h3 className="section-title">단원 통계</h3>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              className="btn-sync"
              style={{ padding: '6px 10px', fontSize: '12px', width: 'auto' }}
              onClick={selectAllFiltered}
            >
              전체 선택
            </button>
            {selectedMemberIds.size > 0 && (
              <button
                type="button"
                className="btn-sync"
                style={{ padding: '6px 10px', fontSize: '12px', width: 'auto' }}
                onClick={clearSelection}
              >
                초기화
              </button>
            )}
          </div>
        </div>

        {/* Part Chips (User Voice: 동적 파트 태그 분류 버튼) */}
        <div className="toss-filter-row" style={{ marginBottom: '8px' }}>
          {['전체', ...dynamicParts].map((part) => (
            <button
              key={part}
              type="button"
              className={`toss-filter-chip ${partFilter === part ? 'active' : ''}`}
              onClick={() => setPartFilter(part)}
            >
              <span>{part}</span>
            </button>
          ))}
        </div>

        {/* Member Status Chips (User Voice: 동적 단원 구분 분류 버튼) */}
        <div className="toss-filter-row" style={{ marginBottom: '12px' }}>
          {['전체', ...dynamicMemberStatuses].map((status) => (
            <button
              key={status}
              type="button"
              className={`toss-filter-chip ${memberStatusFilter === status ? 'active' : ''}`}
              onClick={() => setMemberStatusFilter(status)}
            >
              <span>{status}</span>
            </button>
          ))}
        </div>

        {/* Search Input Box */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            marginBottom: '14px',
          }}
        >
          <span style={{ position: 'absolute', left: '12px', color: '#8b95a1' }}>
            <IconSearch size={18} />
          </span>
          <input
            type="text"
            className="input-text"
            placeholder="대원 이름, 파트, 특이사항 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ paddingLeft: '38px', height: '46px' }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: '12px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                color: '#8b95a1',
              }}
            >
              <IconClose size={16} />
            </button>
          )}
        </div>

        {/* Cumulative Member List Cells */}
        <div className="toss-member-list">
          {filteredSummaries.length > 0 ? (
            filteredSummaries.map((row) => {
              const isChecked = selectedMemberIds.has(row.memberId);
              return (
                <div
                  key={row.memberId}
                  className={`toss-member-item ${isChecked ? 'selected-item' : ''}`}
                  style={{
                    backgroundColor: isChecked ? 'rgba(49, 130, 246, 0.04)' : undefined,
                    cursor: 'pointer',
                  }}
                  onClick={() => toggleSelectMember(row.memberId)}
                >
                  {/* Checkbox Touch Target */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      paddingRight: '10px',
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelectMember(row.memberId);
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => {}}
                      style={{
                        width: '20px',
                        height: '20px',
                        cursor: 'pointer',
                        accentColor: 'var(--brand-accent)',
                      }}
                    />
                  </div>

                  {/* Member Info */}
                  <div className="toss-member-left">
                    <div className="toss-member-name-row">
                      <span className={`part-badge part-${row.part}`}>{row.part}</span>
                      <span className="toss-member-name">{row.memberName}</span>
                      <span
                        className="status-pill"
                        style={{
                          fontSize: '11px',
                          padding: '2px 6px',
                          backgroundColor:
                            row.memberStatus === '정단원'
                              ? 'var(--brand-purple-soft)'
                              : row.memberStatus === '휴단원'
                              ? '#fff0eb'
                              : '#f2f4f6',
                          color:
                            row.memberStatus === '정단원'
                              ? 'var(--brand-accent)'
                              : row.memberStatus === '휴단원'
                              ? '#f04452'
                              : '#4e5968',
                        }}
                      >
                        {row.memberStatus}
                      </span>

                      {row.badges.map((b) => (
                        <span
                          key={b}
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '2px 6px',
                            borderRadius: '6px',
                            backgroundColor:
                              b === '개근'
                                ? '#10b981'
                                : b === '우수'
                                ? 'var(--brand-accent)'
                                : b.startsWith('게스트')
                                ? '#8b5cf6'
                                : '#f04452',
                            color: '#fff',
                          }}
                        >
                          {b.startsWith('게스트') ? `💡 ${b}` : b}
                        </span>
                      ))}
                    </div>

                    <div className="toss-member-meta">
                      <span className="meta-text">
                        출석 <strong>{row.attended}</strong> · 지각 {row.late} · 공결 {row.excused} · 결석{' '}
                        <span style={{ color: row.absent > 0 ? '#f04452' : undefined }}>{row.absent}</span>
                        {row.joinedAt && (
                          <span className="meta-sub"> · {row.joinedAt.slice(0, 7)} 입단</span>
                        )}
                      </span>

                      {row.note && (
                        <div style={{ fontSize: '12px', color: '#6b7684', marginTop: '2px' }}>
                          📝 {row.note}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Rate Gauge & Recent Dots */}
                  <div className="toss-member-right" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <LiquidGauge percentage={row.attendanceRate} size={38} />
                    <div style={{ minWidth: '40px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '3px', justifyContent: 'flex-end' }}>
                        {row.recentStatusList.map((st, i) => (
                          <span
                            key={i}
                            title={st}
                            style={{
                              width: '7px',
                              height: '7px',
                              borderRadius: '50%',
                              backgroundColor:
                                st === '출석' || st === '수동인정'
                                  ? '#10b981'
                                  : st === '지각'
                                  ? '#f59e0b'
                                  : st === '사유결석'
                                  ? 'var(--brand-accent)'
                                  : '#f04452',
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="toss-empty-list">
              <p>선택한 조건에 일치하는 대원이 없습니다.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
