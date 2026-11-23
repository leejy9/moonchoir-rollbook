import React from 'react';

interface PieceBasicInfoSectionProps {
  title: string;
  composer: string;
  arranger: string;
  onChangeTitle: (val: string) => void;
  onChangeComposer: (val: string) => void;
  onChangeArranger: (val: string) => void;
}

export const PieceBasicInfoSection: React.FC<PieceBasicInfoSectionProps> = ({
  title,
  composer,
  arranger,
  onChangeTitle,
  onChangeComposer,
  onChangeArranger,
}) => {
  return (
    <>
      <div className="admin-field-group">
        <label className="admin-field-label">곡 이름 (필수)</label>
        <input
          type="text"
          className="admin-field-input"
          value={title}
          onChange={(e) => onChangeTitle(e.target.value)}
          placeholder="곡 이름을 입력해 주세요"
        />
      </div>

      <div style={{ display: 'flex', gap: '10px' }}>
        <div className="admin-field-group" style={{ flex: 1 }}>
          <label className="admin-field-label">작곡가</label>
          <input
            type="text"
            className="admin-field-input"
            value={composer}
            onChange={(e) => onChangeComposer(e.target.value)}
            placeholder="작곡가"
          />
        </div>
        <div className="admin-field-group" style={{ flex: 1 }}>
          <label className="admin-field-label">편곡자</label>
          <input
            type="text"
            className="admin-field-input"
            value={arranger}
            onChange={(e) => onChangeArranger(e.target.value)}
            placeholder="편곡자"
          />
        </div>
      </div>
    </>
  );
};
