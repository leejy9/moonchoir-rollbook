import React from 'react';
import { sheetsService } from '../services/sheets';
import type { Schedule } from '../types/rollbook';
import { TodayTab, type TodayTabProps } from './TodayTab';

export interface HomeViewProps extends Omit<TodayTabProps, 'onOpenQRScanner'> {
  onOpenQRScanner: (schedule?: Schedule) => void;
}

/**
 * @deprecated Use TodayTab directly. Maintained as a compatibility adapter.
 */
export const HomeView: React.FC<HomeViewProps> = (props) => {
  const handleOpenQR = (scheduleId: string) => {
    const sch = sheetsService.getSchedules().find((s) => s.id === scheduleId);
    props.onOpenQRScanner(sch);
  };

  return <TodayTab {...props} onOpenQRScanner={handleOpenQR} />;
};

export default HomeView;
