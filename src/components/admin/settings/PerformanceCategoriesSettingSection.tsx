import React, { useState } from 'react';
import type { AppConfig } from '../../../types/rollbook';
import { sheetsService } from '../../../services/sheets';

interface PerformanceCategoriesSettingSectionProps {
  config: AppConfig;
  allCategories: string[];
  onSaved?: () => void;
}

const DEFAULT_PERFORMANCE_CATEGORIES = ['연주'];

export const PerformanceCategoriesSettingSection: React.FC<PerformanceCategoriesSettingSectionProps> = ({
  config,
  allCategories,
  onSaved,
}) => {
  const initialSelected =
    config.performanceCategories && config.performanceCategories.length > 0
      ? config.performanceCategories
      : DEFAULT_PERFORMANCE_CATEGORIES;

  const [selectedCategories, setSelectedCategories] = useState<string[]>(initialSelected);
  const [customInput, setCustomInput] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Union of base categories and currently selected ones
  const availableOptions = Array.from(new Set([...allCategories, ...selectedCategories]));

  const toggleCategory = (cat: string) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    if (selectedCategories.includes(cat)) {
      if (selectedCategories.length <= 1) {
        setErrorMsg('공연 일정 구분은 최소 1개 이상 선택해야 합니다.');
        return;
      }
      setSelectedCategories(selectedCategories.filter((c) => c !== cat));
    } else {
      setSelectedCategories([...selectedCategories, cat]);
    }
  };

  const handleAddCustomCategory = () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    const trimmed = customInput.trim();
    if (!trimmed) {
      setErrorMsg('일정 구분 이름을 입력해 주세요.');
      return;
    }
    if (!selectedCategories.includes(trimmed)) {
      setSelectedCategories([...selectedCategories, trimmed]);
    }
    setCustomInput('');
  };

  const handleSave = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    if (selectedCategories.length < 1) {
      setErrorMsg('공연 일정 구분은 1개 이상이어야 합니다.');
      return;
    }

    setIsSaving(true);
    try {
      await sheetsService.saveConfigConfirmed({
        performanceCategories: JSON.stringify(selectedCategories) as any,
      });
      setSuccessMsg('공연 일정 구분이 저장되었습니다.');
      if (onSaved) onSaved();
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : '저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="toss-section-card" style={{ padding: '20px', marginBottom: '20px' }}>
      <h3 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 700 }}>
        공연 인정 일정 구분 설정
      </h3>
      <p style={{ margin: '0 0 16px', fontSize: '13px', color: 'var(--text-muted)' }}>
        내 활동에서 '공연' 횟수로 집계할 일정 구분을 선택합니다. (기본값: 연주)
      </p>

      {errorMsg && (
        <div style={{ color: 'var(--status-danger)', fontSize: '13px', marginBottom: '12px' }}>
          {errorMsg}
        </div>
      )}
      {successMsg && (
        <div style={{ color: 'var(--brand-primary)', fontSize: '13px', marginBottom: '12px' }}>
          {successMsg}
        </div>
      )}

      {/* Chips */}
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {availableOptions.map((cat) => {
          const isChecked = selectedCategories.includes(cat);
          return (
            <button
              key={cat}
              type="button"
              onClick={() => toggleCategory(cat)}
              style={{
                minHeight: '44px',
                padding: '8px 16px',
                borderRadius: 'var(--radius-full, 9999px)',
                border: isChecked ? '1px solid var(--brand-primary)' : '1px solid var(--border-subtle)',
                background: isChecked ? 'var(--brand-primary-light)' : 'var(--bg-card)',
                color: isChecked ? 'var(--brand-primary)' : 'var(--text-main)',
                fontWeight: isChecked ? 700 : 500,
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              {isChecked ? `✓ ${cat}` : cat}
            </button>
          );
        })}
      </div>

      {/* Custom input */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <input
          type="text"
          className="admin-field-input"
          placeholder="새 일정 구분 직접 추가 (예: 특별공연)"
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleAddCustomCategory();
            }
          }}
          style={{ flex: 1 }}
        />
        <button
          type="button"
          onClick={handleAddCustomCategory}
          style={{
            minHeight: '44px',
            padding: '0 16px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            background: 'var(--bg-card)',
            color: 'var(--text-main)',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          선택 추가
        </button>
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={isSaving}
        style={{
          width: '100%',
          minHeight: '44px',
          borderRadius: 'var(--radius-md)',
          border: 'none',
          background: 'var(--brand-primary)',
          color: 'var(--text-white, #ffffff)',
          fontWeight: 700,
          cursor: isSaving ? 'not-allowed' : 'pointer',
        }}
      >
        {isSaving ? '저장 중…' : '공연 구분 저장'}
      </button>
    </div>
  );
};
