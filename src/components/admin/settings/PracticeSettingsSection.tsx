import React from 'react';
import type { AppConfig } from '../../../types/rollbook';
import { PracticeTrackKindsSettingSection } from './PracticeTrackKindsSettingSection';
import { PerformanceCategoriesSettingSection } from './PerformanceCategoriesSettingSection';

interface PracticeSettingsSectionProps {
  config: AppConfig;
  allCategories: string[];
  onDataChanged?: () => void;
}

export const PracticeSettingsSection: React.FC<PracticeSettingsSectionProps> = ({
  config,
  allCategories,
  onDataChanged,
}) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <PracticeTrackKindsSettingSection config={config} onSaved={onDataChanged} />
      <PerformanceCategoriesSettingSection
        config={config}
        allCategories={allCategories}
        onSaved={onDataChanged}
      />
    </div>
  );
};
