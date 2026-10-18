import { useState } from 'react';
import { sheetsService } from '../services/sheets';
import type { ProgramCard, Schedule, ScheduleCategory } from '../types/rollbook';
import type { AdminScheduleFormSavePayload } from '../components/admin/AdminScheduleForm';
import { duplicateScheduleSeries } from '../utils/calendar';
import { getKSTDateString, getKSTTimestampString } from '../utils/date';

export interface CardGroupToDelete {
  cardId: string;
  title: string;
  category: ScheduleCategory;
  schedules: Schedule[];
  isRegisteredCard: boolean;
  rawCard?: ProgramCard;
}

export interface UseScheduleAdminOptions {
  schedules: Schedule[];
  programCards: ProgramCard[];
  onDataChanged: () => void;
  setSelectedScheduleId: (id: string) => void;
}

export function useScheduleAdmin({
  schedules,
  programCards,
  onDataChanged,
  setSelectedScheduleId,
}: UseScheduleAdminOptions) {
  // Panel Modes & Active Form Bindings
  const [rightPanelMode, setRightPanelMode] = useState<'SCHEDULE_FORM' | 'CARD_FORM'>('SCHEDULE_FORM');
  const [editingScheduleForForm, setEditingScheduleForForm] = useState<Schedule | null>(null);
  const [editingProgramCard, setEditingProgramCard] = useState<ProgramCard | null>(null);
  const [selectedProgramCardId, setSelectedProgramCardId] = useState<string>('');
  const [scheduleSuccessMsg, setScheduleSuccessMsg] = useState('');

  // View & Batch Operations
  const [scheduleViewTab, setScheduleViewTab] = useState<'CALENDAR' | 'ALL_LIST' | 'PROGRAM_CARDS'>('CALENDAR');
  const [selectedBatchScheduleIds, setSelectedBatchScheduleIds] = useState<string[]>([]);
  const [isBatchScheduleEditModalOpen, setIsBatchScheduleEditModalOpen] = useState(false);

  // Deletion Modal Targets
  const [scheduleToDelete, setScheduleToDelete] = useState<Schedule | null>(null);
  const [forceHardDeleteSelected, setForceHardDeleteSelected] = useState(false);
  const [cardGroupToDelete, setCardGroupToDelete] = useState<CardGroupToDelete | null>(null);

  // Form Navigation Helpers
  const handleOpenCreateProgramCard = () => {
    setEditingProgramCard(null);
    setRightPanelMode('CARD_FORM');
  };

  const handleOpenEditProgramCard = (card: ProgramCard) => {
    setEditingProgramCard(card);
    setRightPanelMode('CARD_FORM');
  };

  const handleBindScheduleToForm = (sch: Schedule) => {
    setRightPanelMode('SCHEDULE_FORM');
    setEditingScheduleForForm(sch);
    setScheduleSuccessMsg(
      `[${sch.title}] 일정이 우측 수정 폼에 로드되었습니다. 대상자 및 세부 속성을 수정한 뒤 하단 저장 버튼을 눌러주세요.`
    );
    setTimeout(() => setScheduleSuccessMsg(''), 4500);
    setTimeout(() => {
      const el = document.getElementById('admin-schedule-form-container');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  };

  const handleCloneScheduleToForm = (sch: Schedule) => {
    setRightPanelMode('SCHEDULE_FORM');
    const todayStr = getKSTDateString();
    const clonedSch: Schedule = {
      ...sch,
      id: '',
      title: `${sch.title} (복제)`,
      date: todayStr,
    };
    setEditingScheduleForForm(clonedSch);
    setScheduleSuccessMsg(
      `[${sch.title}] 일정을 복제하여 오늘 날짜(${todayStr}) 기준으로 우측 폼에 세팅했습니다.`
    );
    setTimeout(() => setScheduleSuccessMsg(''), 4500);
    setTimeout(() => {
      const el = document.getElementById('admin-schedule-form-container');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 50);
  };

  // Create / Update Schedule
  const handleSaveScheduleFromForm = async (payload: AdminScheduleFormSavePayload) => {
    try {
      if (payload.mode === 'UPDATE' && payload.targetScheduleId && payload.updates) {
        await sheetsService.updateSchedule(payload.targetScheduleId, payload.updates);
        setEditingScheduleForForm(null);
        setScheduleSuccessMsg(`[${payload.updates.title || '선택한'}] 일정이 수정되었습니다.`);
        onDataChanged();
        setTimeout(() => setScheduleSuccessMsg(''), 4000);
      } else if (payload.mode === 'CREATE' && payload.schedules) {
        const generated = payload.schedules;
        if (generated.length === 1) {
          await sheetsService.addSchedule(generated[0]);
          setSelectedScheduleId(generated[0].id);
          setScheduleSuccessMsg(`새 일정 [${generated[0].title}]이 등록되었습니다.`);
        } else {
          await sheetsService.addSchedules(generated);
          setSelectedScheduleId(generated[0]?.id || '');
          setScheduleSuccessMsg(
            `반복 엔진을 통해 ${generated.length}개의 일정이 일괄 생성되어 등록되었습니다!`
          );
        }
        setEditingScheduleForForm(null);
        onDataChanged();
        setTimeout(() => setScheduleSuccessMsg(''), 4000);
      }
    } catch (err: unknown) {
      alert('일정 저장 중 오류가 발생했습니다: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  // Create / Update Program Card
  const handleSaveProgramCard = async (cardData: ProgramCard) => {
    try {
      await sheetsService.saveProgramCard(cardData);

      if (editingProgramCard) {
        const childSchedules = schedules.filter((s) => s.programId === editingProgramCard.id);
        const audienceChanged =
          editingProgramCard.targetAudienceType !== cardData.targetAudienceType ||
          JSON.stringify(editingProgramCard.targetParts || []) !==
            JSON.stringify(cardData.targetParts || []) ||
          JSON.stringify(editingProgramCard.targetMemberIds || []) !==
            JSON.stringify(cardData.targetMemberIds || []);

        if (childSchedules.length > 0 && audienceChanged) {
          const syncConfirm = window.confirm(
            `[${cardData.title}] 카드의 참여 대상자 설정이 변경되었습니다.\n소속된 기존 세부 일정(${childSchedules.length}개)의 참여 대상자도 동일하게 일괄 변경하시겠습니까?`
          );
          if (syncConfirm) {
            await sheetsService.batchUpdateSchedules(
              childSchedules.map((s) => s.id),
              {
                targetAudienceType: cardData.targetAudienceType,
                targetParts: cardData.targetParts,
                targetMemberIds: cardData.targetMemberIds,
              }
            );
          }
        }
      }

      setScheduleSuccessMsg(
        `일정 카드 [${cardData.title}]가 저장되었습니다. 이어서 일정을 등록할 수 있습니다.`
      );
      setRightPanelMode('SCHEDULE_FORM');
      setEditingProgramCard(null);
      setEditingScheduleForForm(null);
      setSelectedProgramCardId(cardData.id);
      onDataChanged();
      setTimeout(() => setScheduleSuccessMsg(''), 4500);
      setTimeout(() => {
        const el = document.getElementById('admin-schedule-form-container');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 50);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '일정 카드 저장 중 오류가 발생했습니다.');
    }
  };

  // Deletion Operations
  const handleDeleteScheduleSingle = async (
    scheduleId: string,
    title: string,
    forceHardDelete: boolean = false
  ) => {
    await sheetsService.deleteSchedule(scheduleId, forceHardDelete);
    setScheduleSuccessMsg(
      forceHardDelete
        ? `'${title}' 일정이 구글 시트 및 로컬에서 영구 삭제되었습니다.`
        : `'${title}' 일정이 정상적으로 삭제되었습니다.`
    );
    setSelectedBatchScheduleIds((prev) => prev.filter((id) => id !== scheduleId));
    onDataChanged();
    setTimeout(() => setScheduleSuccessMsg(''), 3500);
  };

  const handleDeleteScheduleSeries = async (
    matchingIds: string[],
    title: string,
    forceHardDelete: boolean = false
  ) => {
    await sheetsService.deleteSchedules(matchingIds, forceHardDelete);
    setScheduleSuccessMsg(
      forceHardDelete
        ? `'${title}' 소속 ${matchingIds.length}개 일정이 영구 삭제되었습니다.`
        : `'${title}' 소속 ${matchingIds.length}개 일정이 일괄 삭제되었습니다.`
    );
    setSelectedBatchScheduleIds((prev) => prev.filter((id) => !matchingIds.includes(id)));
    onDataChanged();
    setTimeout(() => setScheduleSuccessMsg(''), 3500);
  };

  const handleRestoreScheduleSingle = async (scheduleId: string, title: string) => {
    await sheetsService.restoreSchedule(scheduleId);
    setScheduleSuccessMsg(`'${title}' 일정이 정상적으로 복원되었습니다.`);
    onDataChanged();
    setTimeout(() => setScheduleSuccessMsg(''), 3500);
  };

  const handleDeleteSchedule = (scheduleId: string) => {
    const target = schedules.find((s) => s.id === scheduleId);
    if (target) {
      setScheduleToDelete(target);
    }
  };

  // Batch Operations
  const handleApplyBatchScheduleUpdates = async (ids: string[], updates: Partial<Schedule>) => {
    await sheetsService.batchUpdateSchedules(ids, updates);
    setScheduleSuccessMsg(`선택한 ${ids.length}개 일정이 성공적으로 일괄 수정되었습니다.`);
    onDataChanged();
    setTimeout(() => setScheduleSuccessMsg(''), 3500);
  };

  const handleBatchDeleteSelected = async () => {
    if (selectedBatchScheduleIds.length === 0) return;
    if (
      !window.confirm(
        `선택하신 ${selectedBatchScheduleIds.length}개의 일정을 일괄 삭제하시겠습니까?\n구글 스프레드시트에서도 모두 영구 삭제됩니다.`
      )
    ) {
      return;
    }
    const count = selectedBatchScheduleIds.length;
    await sheetsService.deleteSchedules(selectedBatchScheduleIds);
    setSelectedBatchScheduleIds([]);
    setScheduleSuccessMsg(`선택한 ${count}개 일정이 일괄 삭제되었습니다.`);
    onDataChanged();
    setTimeout(() => setScheduleSuccessMsg(''), 3500);
  };

  const handleToggleSelectSchedule = (id: string) => {
    setSelectedBatchScheduleIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllSchedules = (filteredIds: string[]) => {
    const allSelected =
      filteredIds.length > 0 && filteredIds.every((id) => selectedBatchScheduleIds.includes(id));
    if (allSelected) {
      setSelectedBatchScheduleIds((prev) => prev.filter((id) => !filteredIds.includes(id)));
    } else {
      setSelectedBatchScheduleIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
    }
  };

  // Archive Operations
  const handleToggleArchiveSchedule = async (scheduleId: string, isArchived: boolean) => {
    try {
      await sheetsService.updateSchedule(scheduleId, { isArchived });
      setScheduleSuccessMsg(
        isArchived
          ? '선택한 일정을 지난 시즌 아카이브로 보관했습니다.'
          : '선택한 일정을 일반 목록으로 복원했습니다.'
      );
      setTimeout(() => setScheduleSuccessMsg(''), 3000);
      onDataChanged();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '아카이브 처리 중 오류가 발생했습니다.');
    }
  };

  const handleBatchArchiveSelected = async (isArchived: boolean) => {
    if (selectedBatchScheduleIds.length === 0) return;
    try {
      await sheetsService.batchUpdateSchedules(selectedBatchScheduleIds, { isArchived });
      setScheduleSuccessMsg(
        isArchived
          ? `${selectedBatchScheduleIds.length}개 일정을 지난 시즌 아카이브로 보관했습니다.`
          : `${selectedBatchScheduleIds.length}개 일정을 보관 해제(복원)했습니다.`
      );
      setSelectedBatchScheduleIds([]);
      setTimeout(() => setScheduleSuccessMsg(''), 3500);
      onDataChanged();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '일괄 아카이브 처리 중 오류가 발생했습니다.');
    }
  };

  const handleToggleArchiveGroup = async (scheduleIds: string[], isArchived: boolean) => {
    try {
      await sheetsService.batchUpdateSchedules(scheduleIds, { isArchived });
      setScheduleSuccessMsg(
        isArchived
          ? '해당 묶음의 모든 일정을 지난 시즌 아카이브로 보관했습니다.'
          : '해당 묶음의 모든 일정을 일반 목록으로 복원했습니다.'
      );
      setTimeout(() => setScheduleSuccessMsg(''), 3500);
      onDataChanged();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '묶음 아카이브 처리 중 오류가 발생했습니다.');
    }
  };

  // Series Duplication
  const handleDuplicateSelectedSeries = async (preferredSeriesId?: string) => {
    let targetItems = schedules.filter((s) => selectedBatchScheduleIds.includes(s.id));
    if (preferredSeriesId) {
      targetItems = schedules.filter(
        (s) => s.seriesId === preferredSeriesId || s.programId === preferredSeriesId
      );
    }
    if (targetItems.length === 0) {
      alert('복제할 일정을 선택해주세요.');
      return;
    }

    const seriesIdToDup = preferredSeriesId || targetItems[0].seriesId || targetItems[0].id;
    const defaultNextDate = new Date();
    defaultNextDate.setMonth(defaultNextDate.getMonth() + 4);
    const defaultDateStr = getKSTDateString(defaultNextDate);

    const userInput = window.prompt(
      `선택하신 [${targetItems[0].title}] ${targetItems.length}개 회차를 다음 학기/시즌으로 복제합니다.\n새 학기 첫 연습 시작 날짜를 입력해주세요 (YYYY-MM-DD):`,
      defaultDateStr
    );
    if (!userInput || !userInput.trim()) return;

    const newStartDate = userInput.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newStartDate)) {
      alert('올바른 날짜 형식(YYYY-MM-DD)으로 입력해주세요.');
      return;
    }

    try {
      const matchingCard = programCards.find((c) => c.id === preferredSeriesId);
      let newProgramCardId: string | undefined = undefined;

      if (matchingCard) {
        newProgramCardId = `card_${Date.now()}`;
        const newCard: ProgramCard = {
          ...matchingCard,
          id: newProgramCardId,
          title: `${matchingCard.title} (복제)`,
          createdAt: getKSTTimestampString(),
        };
        await sheetsService.saveProgramCard(newCard);
      }

      const duplicated = duplicateScheduleSeries(
        schedules.some((s) => s.seriesId === seriesIdToDup)
          ? schedules
          : targetItems.map((s) => ({ ...s, seriesId: seriesIdToDup })),
        seriesIdToDup,
        newStartDate
      );

      if (duplicated.length === 0) {
        alert('복제할 일정을 찾지 못했습니다.');
        return;
      }

      const finalDuplicated = newProgramCardId
        ? duplicated.map((s) => ({ ...s, programId: newProgramCardId }))
        : duplicated;

      await sheetsService.addSchedules(finalDuplicated);
      setSelectedBatchScheduleIds([]);
      setScheduleSuccessMsg(
        `🎉 ${finalDuplicated.length}개 회차가 새 학기(${newStartDate}~) 일정으로 복제 생성되었습니다!`
      );
      onDataChanged();
      setTimeout(() => setScheduleSuccessMsg(''), 4500);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : '시즌 복제 중 오류가 발생했습니다.');
    }
  };

  return {
    rightPanelMode,
    setRightPanelMode,
    editingScheduleForForm,
    setEditingScheduleForForm,
    editingProgramCard,
    setEditingProgramCard,
    selectedProgramCardId,
    setSelectedProgramCardId,
    scheduleSuccessMsg,
    setScheduleSuccessMsg,
    scheduleViewTab,
    setScheduleViewTab,
    selectedBatchScheduleIds,
    setSelectedBatchScheduleIds,
    isBatchScheduleEditModalOpen,
    setIsBatchScheduleEditModalOpen,
    scheduleToDelete,
    setScheduleToDelete,
    forceHardDeleteSelected,
    setForceHardDeleteSelected,
    cardGroupToDelete,
    setCardGroupToDelete,
    handleOpenCreateProgramCard,
    handleOpenEditProgramCard,
    handleBindScheduleToForm,
    handleCloneScheduleToForm,
    handleSaveScheduleFromForm,
    handleSaveProgramCard,
    handleDeleteScheduleSingle,
    handleDeleteScheduleSeries,
    handleRestoreScheduleSingle,
    handleDeleteSchedule,
    handleApplyBatchScheduleUpdates,
    handleBatchDeleteSelected,
    handleToggleSelectSchedule,
    handleSelectAllSchedules,
    handleToggleArchiveSchedule,
    handleBatchArchiveSelected,
    handleToggleArchiveGroup,
    handleDuplicateSelectedSeries,
  };
}
