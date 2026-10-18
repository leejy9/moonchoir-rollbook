/* eslint-disable */
/**
 * Moonchoir Rollbook — Google Apps Script (GAS) Web App
 * 대상 스프레드시트: https://docs.google.com/spreadsheets/d/1VYT0HgsrR82ORbd4bxq8doVXvyBvwobgIv3kjE3flX8/edit
 *
 * [배포 방법]
 * 1. 위 구글 시트에서 [확장 프로그램] > [Apps Script] 클릭
 * 2. 이 파일의 전체 코드를 복사하여 붙여넣기
 * 3. [배포] > [새 배포] 클릭
 * 4. 유형: [웹 앱] 선택
 * 5. 실행 대상: [나], 액세스 권한: [모든 사용자(Anyone)] 선택 후 [배포]
 * 6. 발급된 "웹 앱 URL"을 문콰이어 앱 [관리자 센터] > [환경설정]에 입력
 */

const SHEET_NAMES = {
  MEMBERS: '단원명부',
  SCHEDULES: '일정캘린더',
  RSVP: '사전투표_RSVP',
  LOGS: '출석원천로그',
  LOCATIONS: '장소정보',
  MEMBER_HISTORY: '단원변경로그',
  PROGRAM_CARDS: '일정카드',
  CONFIG: '환경설정',
};

// 헬퍼: 한국 표준시(KST, Asia/Seoul) YYYY-MM-DD HH:mm:ss 포맷팅
function toKSTString(val) {
  if (!val) {
    return Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
  }
  let d;
  if (val instanceof Date) {
    d = val;
  } else if (typeof val === 'string') {
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(val)) {
      return val;
    }
    d = new Date(val);
  } else if (typeof val === 'number') {
    d = new Date(val);
  } else {
    d = new Date();
  }
  if (isNaN(d.getTime())) {
    return String(val);
  }
  return Utilities.formatDate(d, 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
}

// 헬퍼: 날짜에 일수를 더한 YYYY-MM-DD 문자열 반환
function addDaysDateString(dateStr, days) {
  try {
    const d = new Date(dateStr + 'T00:00:00+09:00');
    if (isNaN(d.getTime())) return dateStr;
    d.setDate(d.getDate() + days);
    return Utilities.formatDate(d, 'Asia/Seoul', 'yyyy-MM-dd');
  } catch (e) {
    return dateStr;
  }
}

// 헬퍼: 환경설정 시트 읽기
function readConfigData(sheet) {
  if (!sheet) return {};
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return {};
  const config = {};
  for (let i = 1; i < rows.length; i++) {
    const key = String(rows[i][0] || '').trim();
    if (!key) continue;
    let val = rows[i][1];
    if (val !== undefined && val !== null) {
      val = String(val).trim();
      if (key === 'lateGraceMinutes' || key === 'defaultRadius') {
        const num = parseInt(val, 10);
        config[key] = isNaN(num) ? val : num;
      } else if (key === 'defaultLat' || key === 'defaultLon') {
        const num = parseFloat(val);
        config[key] = isNaN(num) ? val : num;
      } else if (key === 'customParts' || key === 'customMemberStatuses' || key === 'customCategories') {
        config[key] = val.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
      } else {
        config[key] = val;
      }
    }
  }
  return config;
}

// 1. GET: 전체 데이터 로드 및 헬스체크
function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureSheetStructure(ss);

    const members = readSheetData(ss.getSheetByName(SHEET_NAMES.MEMBERS));
    const schedules = readSheetData(ss.getSheetByName(SHEET_NAMES.SCHEDULES));
    const rawRsvpVotes = readSheetData(ss.getSheetByName(SHEET_NAMES.RSVP));

    // Deduplicate RSVP votes by scheduleId + memberId (keep latest by timestamp or last row)
    const rsvpMap = {};
    rawRsvpVotes.forEach(function (v) {
      if (!v.scheduleId || !v.memberId) return;
      const key = String(v.scheduleId).trim() + '_' + String(v.memberId).trim();
      const existing = rsvpMap[key];
      if (!existing || (v.timestamp && (!existing.timestamp || v.timestamp >= existing.timestamp))) {
        rsvpMap[key] = v;
      }
    });
    const rsvpVotes = Object.keys(rsvpMap).map(function (k) { return rsvpMap[k]; });
    const logs = readSheetData(ss.getSheetByName(SHEET_NAMES.LOGS));
    const locSheet = ss.getSheetByName(SHEET_NAMES.LOCATIONS);
    const locations = locSheet ? readSheetData(locSheet) : [];
    const histSheet = ss.getSheetByName(SHEET_NAMES.MEMBER_HISTORY);
    const memberHistory = histSheet ? readSheetData(histSheet) : [];
    const cardSheet = ss.getSheetByName(SHEET_NAMES.PROGRAM_CARDS);
    const programCards = cardSheet ? readSheetData(cardSheet) : [];
    const configSheet = ss.getSheetByName(SHEET_NAMES.CONFIG);
    const config = configSheet ? readConfigData(configSheet) : {};

    const response = {
      success: true,
      timestamp: toKSTString(new Date()),
      data: {
        members,
        schedules,
        rsvpVotes,
        logs,
        locations,
        memberHistory,
        programCards,
        config,
      },
      count: {
        members: members.length,
        schedules: schedules.length,
        logs: logs.length,
        rsvpVotes: rsvpVotes.length,
        locations: locations.length,
        memberHistory: memberHistory.length,
        programCards: programCards.length,
      },
    };

    return ContentService.createTextOutput(JSON.stringify(response))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.toString(),
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// 2. POST: 출석 체크, 사전 투표, 단원/일정 관리 이벤트 수신 (LockService 적용)
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    // 최대 15초간 스크립트 락 획득 (동시 다발적 QR 체크인 시 데이터 충돌 방지)
    lock.waitLock(15000);
  } catch (lockErr) {
    return jsonResponse({
      success: false,
      error: '동시 접속자가 많아 처리가 지연되었습니다. 잠시 후 다시 시도해 주세요.',
    });
  }

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    ensureSheetStructure(ss);

    const payload = JSON.parse(e.postData.contents);
    const { action, data } = payload;

    if (action === 'RECORD_ATTENDANCE' || action === 'SUBMIT_CHECKIN') {
      // 출석 체크 로그 Append Only (헤더 키 기반 동적 매핑)
      const sheet = ss.getSheetByName(SHEET_NAMES.LOGS);
      const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
      const newRow = headers.map(function (h) {
        if (h === 'id') return data.id || ('log_' + new Date().getTime());
        if (h === 'timestamp') return toKSTString(data.timestamp);
        if (h === 'scheduleId') return data.scheduleId || '';
        if (h === 'memberId') return data.memberId || '';
        if (h === 'memberName') return data.memberName || '';
        if (h === 'part') return data.part || '';
        if (h === 'authMethod') return data.authMethod || 'QR_WEB_CAM';
        if (h === 'isVerifiedLocation') return data.isVerifiedLocation ? 'TRUE' : 'FALSE';
        if (h === 'adminNote') return data.adminNote || '';
        if (h === 'distanceMeters') return data.distanceMeters !== undefined && data.distanceMeters !== null ? data.distanceMeters : '';
        return data[h] !== undefined ? data[h] : '';
      });
      sheet.appendRow(newRow);
      return jsonResponse({ success: true, message: '출석 로그 저장 완료' });
    }

    if (action === 'SUBMIT_RSVP') {
      // 사전 투표 등록/수정 (헤더 키 기반 1인 1투표 보장 및 중복 행 방지)
      const sheet = ss.getSheetByName(SHEET_NAMES.RSVP);
      const rows = sheet.getDataRange().getValues();
      const headers = rows[0];
      const sIdCol = headers.indexOf('scheduleId');
      const mIdCol = headers.indexOf('memberId');

      let rowIndex = -1;
      const duplicateRowIndices = [];

      for (let i = 1; i < rows.length; i++) {
        const rowSId = String(rows[i][sIdCol >= 0 ? sIdCol : 1]).trim();
        const rowMId = String(rows[i][mIdCol >= 0 ? mIdCol : 2]).trim();
        if (rowSId === String(data.scheduleId).trim() && rowMId === String(data.memberId).trim()) {
          if (rowIndex === -1) {
            rowIndex = i + 1;
          } else {
            duplicateRowIndices.push(i + 1);
          }
        }
      }

      const rowData = headers.map(function (h) {
        if (h === 'id') return data.id || ('vote_' + new Date().getTime());
        if (h === 'scheduleId') return data.scheduleId || '';
        if (h === 'memberId') return data.memberId || '';
        if (h === 'memberName') return data.memberName || '';
        if (h === 'part') return data.part || '';
        if (h === 'status') return data.status || 'ATTEND';
        if (h === 'reason') return data.reason || '';
        if (h === 'timestamp') return toKSTString(data.timestamp);
        return data[h] !== undefined ? data[h] : '';
      });

      if (rowIndex > 0) {
        sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
      } else {
        sheet.appendRow(rowData);
      }

      for (let d = duplicateRowIndices.length - 1; d >= 0; d--) {
        sheet.deleteRow(duplicateRowIndices[d]);
      }

      return jsonResponse({ success: true, message: '사전 투표 저장 완료' });
    }

    if (action === 'CANCEL_RSVP') {
      const sheet = ss.getSheetByName(SHEET_NAMES.RSVP);
      const rows = sheet.getDataRange().getValues();
      const headers = rows[0];
      const sIdCol = headers.indexOf('scheduleId');
      const mIdCol = headers.indexOf('memberId');

      for (let i = 1; i < rows.length; i++) {
        const rowSId = String(rows[i][sIdCol >= 0 ? sIdCol : 1]).trim();
        const rowMId = String(rows[i][mIdCol >= 0 ? mIdCol : 2]).trim();
        if (rowSId === String(data.scheduleId).trim() && rowMId === String(data.memberId).trim()) {
          sheet.deleteRow(i + 1);
          break;
        }
      }
      return jsonResponse({ success: true, message: '사전 투표 취소 완료' });
    }

    if (action === 'CLEAR_ATTENDANCE') {
      // 출결 취소: 물리 삭제 금지 (Event Sourcing), 취소 로그 한 줄 Append-Only
      const logSheet = ss.getSheetByName(SHEET_NAMES.LOGS);
      if (logSheet) {
        const headers = logSheet.getRange(1, 1, 1, Math.max(logSheet.getLastColumn(), 1)).getValues()[0];
        const cancelLog = {
          id: 'log_cancel_' + new Date().getTime(),
          timestamp: toKSTString(new Date()),
          scheduleId: data.scheduleId || '',
          memberId: data.memberId || '',
          memberName: data.memberName || '',
          part: data.part || '',
          authMethod: 'MANUAL_BY_ADMIN',
          isVerifiedLocation: false,
          adminNote: data.adminNote || '관리자 출결 취소 (결석 처리)',
          distanceMeters: '',
        };
        const newRow = headers.map(function (h) {
          if (h === 'timestamp') return cancelLog.timestamp;
          if (h === 'isVerifiedLocation') return 'FALSE';
          return cancelLog[h] !== undefined ? cancelLog[h] : '';
        });
        logSheet.appendRow(newRow);
      }
      return jsonResponse({ success: true, message: '출결 취소 로그 등록 완료 (원천 보존)' });
    }

    if (action === 'BIND_DEVICE') {
      const sheet = ss.getSheetByName(SHEET_NAMES.MEMBERS);
      const rows = sheet.getDataRange().getValues();
      const headers = rows[0];
      const idCol = headers.indexOf('id');
      const devCol = headers.indexOf('boundDeviceId');
      const timeCol = headers.indexOf('boundDeviceAt');

      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][idCol >= 0 ? idCol : 0]) === String(data.memberId)) {
          if (devCol >= 0) sheet.getRange(i + 1, devCol + 1).setValue(data.deviceId || '');
          if (timeCol >= 0) sheet.getRange(i + 1, timeCol + 1).setValue(toKSTString(new Date()));
          return jsonResponse({ success: true, message: '기기 바인딩 완료' });
        }
      }
      return jsonResponse({ success: false, message: '단원을 찾을 수 없습니다.' });
    }

    if (action === 'UNBIND_DEVICE') {
      const sheet = ss.getSheetByName(SHEET_NAMES.MEMBERS);
      const rows = sheet.getDataRange().getValues();
      const headers = rows[0];
      const idCol = headers.indexOf('id');
      const devCol = headers.indexOf('boundDeviceId');
      const timeCol = headers.indexOf('boundDeviceAt');

      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][idCol >= 0 ? idCol : 0]) === String(data.memberId)) {
          if (devCol >= 0) sheet.getRange(i + 1, devCol + 1).setValue('');
          if (timeCol >= 0) sheet.getRange(i + 1, timeCol + 1).setValue('');
          return jsonResponse({ success: true, message: '기기 연동 해제 완료' });
        }
      }
      return jsonResponse({ success: false, message: '단원을 찾을 수 없습니다.' });
    }

    if (action === 'REGISTER_MEMBER') {
      const sheet = ss.getSheetByName(SHEET_NAMES.MEMBERS);
      const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
      const newRow = headers.map(function (h) {
        if (h === 'id') return data.id;
        if (h === 'name') return data.name;
        if (h === 'part') return data.part;
        if (h === 'phone') return data.phone || '';
        if (h === 'phoneLast4') return data.phoneLast4 || (data.phone ? String(data.phone).replace(/\D/g, '').slice(-4) : '');
        if (h === 'role') return data.role || 'MEMBER';
        if (h === 'status') return data.status || 'ACTIVE';
        if (h === 'joinedAt') return data.joinedAt || toKSTString(new Date()).slice(0, 10);
        if (h === 'memberStatus') return data.memberStatus || '정단원';
        if (h === 'note') return data.note || '';
        if (h === 'boundDeviceId') return data.boundDeviceId || '';
        if (h === 'boundDeviceAt') return data.boundDeviceAt ? toKSTString(data.boundDeviceAt) : '';
        return data[h] !== undefined ? data[h] : '';
      });
      sheet.appendRow(newRow);
      return jsonResponse({ success: true, message: '단원 등록 완료' });
    }

    if (action === 'UPDATE_MEMBER') {
      const sheet = ss.getSheetByName(SHEET_NAMES.MEMBERS);
      const rows = sheet.getDataRange().getValues();
      const headers = rows[0];
      const idCol = headers.indexOf('id');
      const targetIdCol = idCol >= 0 ? idCol : 0;

      let rowIndex = -1;
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][targetIdCol]) === String(data.id)) {
          rowIndex = i + 1;
          break;
        }
      }

      if (rowIndex > 0) {
        const existingRow = rows[rowIndex - 1];
        const phoneIdx = headers.indexOf('phone');
        const phoneLast4Idx = headers.indexOf('phoneLast4');
        const memberStatusIdx = headers.indexOf('memberStatus');
        const partIdx = headers.indexOf('part');
        const boundDeviceAtIdx = headers.indexOf('boundDeviceAt');
        const existingPhone = phoneIdx >= 0 ? existingRow[phoneIdx] : '';
        const existingLast4 = phoneLast4Idx >= 0 ? existingRow[phoneLast4Idx] : '';

        const updateRow = headers.map(function (h, colIdx) {
          if (h === 'id') return data.id;
          if (h === 'name') return data.name !== undefined ? data.name : existingRow[colIdx];
          if (h === 'part') return data.part !== undefined ? data.part : existingRow[colIdx];
          if (h === 'phone') {
            if (data.phone && String(data.phone).trim()) return String(data.phone).trim();
            return existingPhone || '';
          }
          if (h === 'phoneLast4') {
            if (data.phoneLast4 && String(data.phoneLast4).trim()) return String(data.phoneLast4).trim();
            if (data.phone && String(data.phone).trim()) return String(data.phone).replace(/\D/g, '').slice(-4);
            return existingLast4 || (existingPhone ? String(existingPhone).replace(/\D/g, '').slice(-4) : '');
          }
          if (h === 'role') return data.role !== undefined ? data.role : (existingRow[colIdx] || 'MEMBER');
          if (h === 'status') return data.status !== undefined ? data.status : (existingRow[colIdx] || 'ACTIVE');
          if (h === 'joinedAt') return data.joinedAt || (existingRow[colIdx] || '');
          if (h === 'memberStatus') return data.memberStatus || (existingRow[colIdx] || '정단원');
          if (h === 'note') return data.note !== undefined ? data.note : (existingRow[colIdx] || '');
          if (h === 'boundDeviceId') return data.boundDeviceId !== undefined ? data.boundDeviceId : (existingRow[colIdx] || '');
          if (h === 'boundDeviceAt') return data.boundDeviceAt !== undefined ? (data.boundDeviceAt ? toKSTString(data.boundDeviceAt) : '') : (boundDeviceAtIdx >= 0 ? existingRow[boundDeviceAtIdx] : '');
          return data[h] !== undefined ? data[h] : (existingRow[colIdx] !== undefined ? existingRow[colIdx] : '');
        });
        sheet.getRange(rowIndex, 1, 1, updateRow.length).setValues([updateRow]);

        // 단원 변경 이력 기록 및 시트 상 이전 오픈 이력 자동 마감
        const isStatusOrPartChanged =
          data.historyItem ||
          (data.memberStatus && memberStatusIdx >= 0 && data.memberStatus !== existingRow[memberStatusIdx]) ||
          (data.part && partIdx >= 0 && data.part !== existingRow[partIdx]);

        if (isStatusOrPartChanged) {
          const histSheet = ss.getSheetByName(SHEET_NAMES.MEMBER_HISTORY);
          if (histSheet) {
            const hRows = histSheet.getDataRange().getValues();
            const hHeaders = hRows[0] || [];
            const hMIdCol = hHeaders.indexOf('memberId');
            const hEndCol = hHeaders.indexOf('endDate');
            const newStartDate = data.historyItem ? data.historyItem.startDate : toKSTString(new Date()).slice(0, 10);

            // 1) 시트의 이전 오픈 이력(2999-12-31) 마감: 새 시작일 - 1일
            if (hMIdCol >= 0 && hEndCol >= 0) {
              const prevDay = addDaysDateString(newStartDate, -1);
              for (let hi = 1; hi < hRows.length; hi++) {
                if (String(hRows[hi][hMIdCol]).trim() === String(data.id).trim()) {
                  const curEnd = String(hRows[hi][hEndCol]).trim();
                  if (curEnd === '2999-12-31' || curEnd >= newStartDate) {
                    histSheet.getRange(hi + 1, hEndCol + 1).setValue(prevDay);
                  }
                }
              }
            }

            // 2) 신규 이력 행 Append
            const h = data.historyItem || {
              id: 'hist_' + Date.now(),
              status: data.memberStatus || (memberStatusIdx >= 0 ? existingRow[memberStatusIdx] : '정단원'),
              part: data.part || (partIdx >= 0 ? existingRow[partIdx] : '소프라노'),
              startDate: newStartDate,
              endDate: '2999-12-31',
              reason: '단원 상태/파트 갱신',
              createdAt: toKSTString(new Date()),
            };

            const newHRow = hHeaders.map(function (hh) {
              if (hh === 'id') return h.id || ('hist_' + Date.now());
              if (hh === 'memberId') return data.id;
              if (hh === 'name') return data.name || (idCol >= 0 ? existingRow[headers.indexOf('name')] : '');
              if (hh === 'status') return h.status || '정단원';
              if (hh === 'part') return h.part || '소프라노';
              if (hh === 'startDate') return h.startDate || newStartDate;
              if (hh === 'endDate') return h.endDate || '2999-12-31';
              if (hh === 'reason') return h.reason || '';
              if (hh === 'createdAt') return toKSTString(h.createdAt);
              return '';
            });
            histSheet.appendRow(newHRow);
          }
        }

        return jsonResponse({ success: true, message: '단원 정보 수정 완료' });
      }
      return jsonResponse({ success: false, message: '해당 단원을 찾을 수 없습니다: ' + data.id });
    }

    if (action === 'ADD_MEMBER_HISTORY') {
      const histSheet = ss.getSheetByName(SHEET_NAMES.MEMBER_HISTORY);
      if (histSheet) {
        const headers = histSheet.getRange(1, 1, 1, Math.max(histSheet.getLastColumn(), 1)).getValues()[0];
        const newRow = headers.map(function (h) {
          if (h === 'id') return data.id || ('hist_' + Date.now());
          if (h === 'memberId') return data.memberId || '';
          if (h === 'name') return data.name || '';
          if (h === 'status') return data.status || '정단원';
          if (h === 'part') return data.part || '소프라노';
          if (h === 'startDate') return data.startDate || toKSTString(new Date()).slice(0, 10);
          if (h === 'endDate') return data.endDate || '2999-12-31';
          if (h === 'reason') return data.reason || '';
          if (h === 'createdAt') return toKSTString(data.createdAt);
          return '';
        });
        histSheet.appendRow(newRow);
        return jsonResponse({ success: true, message: '단원 변경 이력 기록 완료' });
      }
      return jsonResponse({ success: false, message: '단원변경로그 탭을 찾을 수 없습니다.' });
    }

    if (action === 'DELETE_MEMBER') {
      // 단원 삭제: 출석/투표 기록 유무에 따라 소프트 삭제 vs 물리 삭제 분기
      const memberId = String(data.id || data.memberId).trim();
      const logSheet = ss.getSheetByName(SHEET_NAMES.LOGS);
      const rsvpSheet = ss.getSheetByName(SHEET_NAMES.RSVP);
      let hasActivity = false;

      if (logSheet) {
        const logRows = logSheet.getDataRange().getValues();
        const lHeaders = logRows[0] || [];
        const mIdCol = lHeaders.indexOf('memberId');
        if (mIdCol >= 0) {
          for (let i = 1; i < logRows.length; i++) {
            if (String(logRows[i][mIdCol]).trim() === memberId) {
              hasActivity = true;
              break;
            }
          }
        }
      }

      if (!hasActivity && rsvpSheet) {
        const rsvpRows = rsvpSheet.getDataRange().getValues();
        const rHeaders = rsvpRows[0] || [];
        const mIdCol = rHeaders.indexOf('memberId');
        if (mIdCol >= 0) {
          for (let i = 1; i < rsvpRows.length; i++) {
            if (String(rsvpRows[i][mIdCol]).trim() === memberId) {
              hasActivity = true;
              break;
            }
          }
        }
      }

      const mSheet = ss.getSheetByName(SHEET_NAMES.MEMBERS);
      const mRows = mSheet.getDataRange().getValues();
      const mHeaders = mRows[0] || [];
      const idCol = mHeaders.indexOf('id');
      const statusCol = mHeaders.indexOf('status');

      for (let i = 1; i < mRows.length; i++) {
        if (String(mRows[i][idCol >= 0 ? idCol : 0]).trim() === memberId) {
          if (hasActivity && statusCol >= 0) {
            // 과거 출결 통계 보호를 위한 소프트 삭제 (status='DELETED')
            mSheet.getRange(i + 1, statusCol + 1).setValue('DELETED');
            return jsonResponse({ success: true, message: '단원 출석 이력이 보존되며 상태가 삭제(DELETED) 처리되었습니다.' });
          } else {
            // 활동 없는 오등록 단원만 물리 삭제
            mSheet.deleteRow(i + 1);
            return jsonResponse({ success: true, message: '단원이 영구 삭제되었습니다.' });
          }
        }
      }
      return jsonResponse({ success: false, message: '해당 단원을 찾을 수 없습니다: ' + memberId });
    }

    if (action === 'MERGE_MEMBERS') {
      const canonicalId = data.canonicalId;
      const secondaryId = data.secondaryId;

      // 1. Update Logs memberId to canonicalId
      const logSheet = ss.getSheetByName(SHEET_NAMES.LOGS);
      if (logSheet) {
        const logData = logSheet.getDataRange().getValues();
        const logHeaders = logData[0];
        const mIdCol = logHeaders.indexOf('memberId');
        const noteCol = logHeaders.indexOf('adminNote');
        if (mIdCol >= 0) {
          for (let i = 1; i < logData.length; i++) {
            if (logData[i][mIdCol] === secondaryId) {
              logSheet.getRange(i + 1, mIdCol + 1).setValue(canonicalId);
              if (noteCol >= 0) {
                const currentNote = logData[i][noteCol] || '';
                logSheet.getRange(i + 1, noteCol + 1).setValue((currentNote ? currentNote + ' ' : '') + '[통합:' + secondaryId + ']');
              }
            }
          }
        }
      }

      // 2. Update RSVP memberId to canonicalId
      const rsvpSheet = ss.getSheetByName(SHEET_NAMES.RSVP);
      if (rsvpSheet) {
        const rsvpData = rsvpSheet.getDataRange().getValues();
        const rsvpHeaders = rsvpData[0];
        const rMIdCol = rsvpHeaders.indexOf('memberId');
        if (rMIdCol >= 0) {
          for (let i = 1; i < rsvpData.length; i++) {
            if (rsvpData[i][rMIdCol] === secondaryId) {
              rsvpSheet.getRange(i + 1, rMIdCol + 1).setValue(canonicalId);
            }
          }
        }
      }

      // 3. Mark secondary member as MERGED in MEMBERS sheet
      const memberSheet = ss.getSheetByName(SHEET_NAMES.MEMBERS);
      if (memberSheet) {
        const mData = memberSheet.getDataRange().getValues();
        const mHeaders = mData[0];
        const idCol = mHeaders.indexOf('id');
        const statusCol = mHeaders.indexOf('status');
        const mergedIntoCol = mHeaders.indexOf('mergedIntoId');
        for (let i = 1; i < mData.length; i++) {
          if (mData[i][idCol >= 0 ? idCol : 0] === secondaryId) {
            if (statusCol >= 0) memberSheet.getRange(i + 1, statusCol + 1).setValue('MERGED');
            if (mergedIntoCol >= 0) memberSheet.getRange(i + 1, mergedIntoCol + 1).setValue(canonicalId);
          }
        }
      }

      return jsonResponse({ success: true, message: '단원 식별자 안전 통합 완료' });
    }

    if (action === 'CREATE_SCHEDULE' || action === 'REGISTER_SCHEDULE') {
      const sheet = ss.getSheetByName(SHEET_NAMES.SCHEDULES);
      const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
      const newRow = headers.map(function (h) {
        if (h === 'targetParts') return Array.isArray(data.targetParts) ? data.targetParts.join(',') : (data.targetParts || '');
        if (h === 'targetMemberIds') return Array.isArray(data.targetMemberIds) ? data.targetMemberIds.join(',') : (data.targetMemberIds || '');
        if (h === 'isArchived') return data.isArchived ? 'TRUE' : 'FALSE';
        if (h === 'isCancelled') return data.isCancelled ? 'TRUE' : 'FALSE';
        return data[h] !== undefined ? data[h] : '';
      });
      sheet.appendRow(newRow);
      return jsonResponse({ success: true, message: '일정 등록 완료' });
    }

    if (action === 'UPDATE_SCHEDULE') {
      const sheet = ss.getSheetByName(SHEET_NAMES.SCHEDULES);
      const rows = sheet.getDataRange().getValues();
      const headers = rows[0];
      const idCol = headers.indexOf('id');
      const targetIdCol = idCol >= 0 ? idCol : 0;

      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][targetIdCol]) === String(data.id)) {
          const row = [...rows[i]];
          headers.forEach(function (h, colIdx) {
            if (data[h] !== undefined) {
              if (h === 'targetParts') {
                row[colIdx] = Array.isArray(data.targetParts) ? data.targetParts.join(',') : (data.targetParts || '');
              } else if (h === 'targetMemberIds') {
                row[colIdx] = Array.isArray(data.targetMemberIds) ? data.targetMemberIds.join(',') : (data.targetMemberIds || '');
              } else if (h === 'isArchived') {
                row[colIdx] = data.isArchived ? 'TRUE' : 'FALSE';
              } else if (h === 'isCancelled') {
                row[colIdx] = data.isCancelled ? 'TRUE' : 'FALSE';
              } else {
                row[colIdx] = data[h];
              }
            }
          });
          sheet.getRange(i + 1, 1, 1, row.length).setValues([row]);
          return jsonResponse({ success: true, message: '일정 수정 완료' });
        }
      }
      return jsonResponse({ success: false, message: '해당 일정을 찾을 수 없습니다.' });
    }

    if (action === 'DELETE_SCHEDULE') {
      // 일정 삭제: 출석로그/사전투표 유무에 따라 연습 취소(isCancelled=TRUE) vs 물리 삭제
      const scheduleId = String(data.id || data.scheduleId).trim();
      const logSheet = ss.getSheetByName(SHEET_NAMES.LOGS);
      const rsvpSheet = ss.getSheetByName(SHEET_NAMES.RSVP);
      let hasActivity = false;

      if (logSheet) {
        const logRows = logSheet.getDataRange().getValues();
        const lHeaders = logRows[0] || [];
        const sIdCol = lHeaders.indexOf('scheduleId');
        if (sIdCol >= 0) {
          for (let i = 1; i < logRows.length; i++) {
            if (String(logRows[i][sIdCol]).trim() === scheduleId) {
              hasActivity = true;
              break;
            }
          }
        }
      }

      if (!hasActivity && rsvpSheet) {
        const rsvpRows = rsvpSheet.getDataRange().getValues();
        const rHeaders = rsvpRows[0] || [];
        const sIdCol = rHeaders.indexOf('scheduleId');
        if (sIdCol >= 0) {
          for (let i = 1; i < rsvpRows.length; i++) {
            if (String(rsvpRows[i][sIdCol]).trim() === scheduleId) {
              hasActivity = true;
              break;
            }
          }
        }
      }

      const sSheet = ss.getSheetByName(SHEET_NAMES.SCHEDULES);
      const sRows = sSheet.getDataRange().getValues();
      const sHeaders = sRows[0] || [];
      const idCol = sHeaders.indexOf('id');
      const cancelledCol = sHeaders.indexOf('isCancelled');

      for (let i = 1; i < sRows.length; i++) {
        if (String(sRows[i][idCol >= 0 ? idCol : 0]).trim() === scheduleId) {
          if (hasActivity) {
            if (cancelledCol >= 0) {
              sSheet.getRange(i + 1, cancelledCol + 1).setValue('TRUE');
            }
            return jsonResponse({ success: true, message: '출석 기록이 보존되며 일정이 [연습 취소] 처리되었습니다.' });
          } else {
            sSheet.deleteRow(i + 1);
            return jsonResponse({ success: true, message: '일정이 완전히 삭제되었습니다.' });
          }
        }
      }
      return jsonResponse({ success: false, message: '해당 일정을 찾을 수 없습니다.' });
    }

    if (action === 'BATCH_DELETE_SCHEDULES') {
      const sheet = ss.getSheetByName(SHEET_NAMES.SCHEDULES);
      if (!sheet) return jsonResponse({ success: false, message: '일정캘린더 탭이 없습니다.' });
      const idsToDelete = new Set((data.ids || []).map(function (id) { return String(id).trim(); }));
      const rows = sheet.getDataRange().getValues();
      const headers = rows[0] || [];
      const idCol = headers.indexOf('id');
      const cancelledCol = headers.indexOf('isCancelled');

      const logSheet = ss.getSheetByName(SHEET_NAMES.LOGS);
      const activeScheduleIds = new Set();
      if (logSheet) {
        const logRows = logSheet.getDataRange().getValues();
        const lHeaders = logRows[0] || [];
        const sIdCol = lHeaders.indexOf('scheduleId');
        if (sIdCol >= 0) {
          for (let i = 1; i < logRows.length; i++) {
            const sid = String(logRows[i][sIdCol]).trim();
            if (idsToDelete.has(sid)) activeScheduleIds.add(sid);
          }
        }
      }

      let deletedCount = 0;
      let cancelledCount = 0;

      for (let i = rows.length - 1; i >= 1; i--) {
        const rowId = String(rows[i][idCol >= 0 ? idCol : 0]).trim();
        if (idsToDelete.has(rowId)) {
          if (activeScheduleIds.has(rowId)) {
            if (cancelledCol >= 0) {
              sheet.getRange(i + 1, cancelledCol + 1).setValue('TRUE');
              cancelledCount++;
            }
          } else {
            sheet.deleteRow(i + 1);
            deletedCount++;
          }
        }
      }
      return jsonResponse({
        success: true,
        message: deletedCount + '개 일정 영구 삭제, ' + cancelledCount + '개 일정 [취소] 보존 완료',
      });
    }

    if (action === 'BATCH_UPDATE_SCHEDULES') {
      const sheet = ss.getSheetByName(SHEET_NAMES.SCHEDULES);
      if (!sheet) return jsonResponse({ success: false, message: '일정캘린더 탭이 없습니다.' });
      const idsToUpdate = new Set(data.ids || []);
      const updates = data.updates || {};
      const rows = sheet.getDataRange().getValues();
      const headers = rows[0];
      const idCol = headers.indexOf('id');
      const targetIdCol = idCol >= 0 ? idCol : 0;

      let updatedCount = 0;
      for (let i = 1; i < rows.length; i++) {
        const id = String(rows[i][targetIdCol]);
        if (idsToUpdate.has(id)) {
          const row = [...rows[i]];
          headers.forEach(function (h, colIdx) {
            if (updates[h] !== undefined) {
              if (h === 'targetParts') {
                row[colIdx] = Array.isArray(updates.targetParts) ? updates.targetParts.join(',') : (updates.targetParts || '');
              } else if (h === 'targetMemberIds') {
                row[colIdx] = Array.isArray(updates.targetMemberIds) ? updates.targetMemberIds.join(',') : (updates.targetMemberIds || '');
              } else if (h === 'isArchived') {
                row[colIdx] = updates.isArchived ? 'TRUE' : 'FALSE';
              } else if (h === 'isCancelled') {
                row[colIdx] = updates.isCancelled ? 'TRUE' : 'FALSE';
              } else {
                row[colIdx] = updates[h];
              }
            }
          });
          sheet.getRange(i + 1, 1, 1, row.length).setValues([row]);
          updatedCount++;
        }
      }
      return jsonResponse({ success: true, message: updatedCount + '개 일정 일괄 수정 완료' });
    }

    if (action === 'SAVE_LOCATION' || action === 'REGISTER_LOCATION') {
      const sheet = ss.getSheetByName(SHEET_NAMES.LOCATIONS);
      if (!sheet) return jsonResponse({ success: false, message: '장소정보 탭이 없습니다.' });
      const rows = sheet.getDataRange().getValues();
      const headers = rows[0] || ['id', 'name', 'address', 'detailAddress', 'entranceNote', 'latitude', 'longitude', 'radiusMeters', 'isDefault'];
      const idCol = headers.indexOf('id');

      let rowIndex = -1;
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][idCol >= 0 ? idCol : 0]) === String(data.id)) {
          rowIndex = i + 1;
          break;
        }
      }
      const rowData = headers.map(function (h) {
        if (h === 'id') return data.id;
        if (h === 'name') return data.name || '';
        if (h === 'address') return data.address || '';
        if (h === 'detailAddress') return data.detailAddress || '';
        if (h === 'entranceNote') return data.entranceNote || '';
        if (h === 'latitude') return data.latitude || 37.5665;
        if (h === 'longitude') return data.longitude || 126.9780;
        if (h === 'radiusMeters') return data.radiusMeters || 100;
        if (h === 'isDefault') return data.isDefault ? 'TRUE' : 'FALSE';
        return data[h] !== undefined ? data[h] : '';
      });

      if (rowIndex > 0) {
        sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
      } else {
        sheet.appendRow(rowData);
      }
      return jsonResponse({ success: true, message: '장소 정보 저장 완료' });
    }

    if (action === 'DELETE_LOCATION') {
      const sheet = ss.getSheetByName(SHEET_NAMES.LOCATIONS);
      if (!sheet) return jsonResponse({ success: false, message: '장소정보 탭이 없습니다.' });
      const rows = sheet.getDataRange().getValues();
      const headers = rows[0];
      const idCol = headers.indexOf('id');

      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][idCol >= 0 ? idCol : 0]) === String(data.id)) {
          sheet.deleteRow(i + 1);
          return jsonResponse({ success: true, message: '장소 삭제 완료' });
        }
      }
      return jsonResponse({ success: false, message: '해당 장소를 찾을 수 없습니다.' });
    }

    if (action === 'SAVE_PROGRAM_CARD') {
      const sheet = ss.getSheetByName(SHEET_NAMES.PROGRAM_CARDS);
      if (!sheet) return jsonResponse({ success: false, message: '일정카드 탭이 없습니다.' });
      const rows = sheet.getDataRange().getValues();
      const headers = rows[0] || ['id', 'title', 'description', 'category', 'defaultLocationId', 'defaultStartTime', 'defaultEndTime', 'isArchived', 'createdAt', 'targetAudienceType', 'targetParts', 'targetMemberIds'];
      const idCol = headers.indexOf('id');

      let rowIndex = -1;
      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][idCol >= 0 ? idCol : 0]) === String(data.id)) {
          rowIndex = i + 1;
          break;
        }
      }
      const newRow = headers.map(function (h) {
        if (h === 'isArchived') return data.isArchived ? 'TRUE' : 'FALSE';
        if (h === 'targetParts') return Array.isArray(data.targetParts) ? data.targetParts.join(',') : (data.targetParts || '');
        if (h === 'targetMemberIds') return Array.isArray(data.targetMemberIds) ? data.targetMemberIds.join(',') : (data.targetMemberIds || '');
        if (h === 'createdAt') return toKSTString(data.createdAt);
        return data[h] !== undefined ? data[h] : '';
      });
      if (rowIndex > 0) {
        sheet.getRange(rowIndex, 1, 1, newRow.length).setValues([newRow]);
      } else {
        sheet.appendRow(newRow);
      }
      return jsonResponse({ success: true, message: '일정카드 저장 완료' });
    }

    if (action === 'DELETE_PROGRAM_CARD') {
      const sheet = ss.getSheetByName(SHEET_NAMES.PROGRAM_CARDS);
      if (!sheet) return jsonResponse({ success: false, message: '일정카드 탭이 없습니다.' });
      const rows = sheet.getDataRange().getValues();
      const headers = rows[0];
      const idCol = headers.indexOf('id');

      for (let i = 1; i < rows.length; i++) {
        if (String(rows[i][idCol >= 0 ? idCol : 0]) === String(data.id)) {
          sheet.deleteRow(i + 1);
          return jsonResponse({ success: true, message: '일정카드 삭제 완료' });
        }
      }
      return jsonResponse({ success: false, message: '해당 일정카드를 찾을 수 없습니다.' });
    }

    if (action === 'SAVE_CONFIG') {
      const sheet = ss.getSheetByName(SHEET_NAMES.CONFIG);
      if (!sheet) return jsonResponse({ success: false, message: '환경설정 탭이 없습니다.' });
      const rows = sheet.getDataRange().getValues();
      const existingKeys = {};
      for (let i = 1; i < rows.length; i++) {
        const k = String(rows[i][0]).trim();
        if (k) existingKeys[k] = i + 1;
      }
      const updates = data.config || data;
      Object.keys(updates).forEach(function (k) {
        let val = updates[k];
        if (Array.isArray(val)) {
          val = val.join(',');
        } else if (val === null || val === undefined) {
          val = '';
        } else {
          val = String(val);
        }
        if (existingKeys[k]) {
          sheet.getRange(existingKeys[k], 2).setValue(val);
        } else {
          sheet.appendRow([k, val, '']);
        }
      });
      return jsonResponse({ success: true, message: '환경설정 저장 완료' });
    }

    return jsonResponse({ success: false, message: '알 수 없는 액션: ' + action });
  } catch (err) {
    return jsonResponse({ success: false, error: err.toString() });
  } finally {
    try {
      lock.releaseLock();
    } catch (e) {
      // ignore
    }
  }
}

// 구글 시트 상단 커스텀 메뉴 등록
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🎵 문콰이어 출석부')
    .addItem('시트 8대 탭 및 기본 데이터 생성', 'manualInitialize')
    .addItem('누락된 컬럼(phone, locationId 등) 헤더 자동 동기화', 'syncMissingHeaders')
    .addItem('기존 기록 날짜/시간을 한국 표준시(KST)로 변환', 'convertExistingTimestampsToKST')
    .addToUi();
}

function manualInitialize() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheetStructure(ss);
  seedInitialData(ss);
  SpreadsheetApp.getUi().alert('초기화 완료!\n\n단원명부, 일정캘린더, 출석원천로그, 사전투표, 장소정보, 단원변경로그, 일정카드, 환경설정 탭이 생성되었습니다.');
}

function syncMissingHeaders() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ensureSheetStructure(ss);
  seedInitialData(ss);
  SpreadsheetApp.getUi().alert('컬럼 및 기본 데이터 동기화 완료!\n누락되었던 locationId, distanceMeters, 환경설정 등의 탭과 컬럼이 안전하게 보강되었습니다.');
}

function convertExistingTimestampsToKST() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tabsToProcess = [
    { name: SHEET_NAMES.LOGS, timeCols: ['timestamp'] },
    { name: SHEET_NAMES.RSVP, timeCols: ['timestamp'] },
    { name: SHEET_NAMES.MEMBERS, timeCols: ['boundDeviceAt', 'joinedAt'] },
    { name: SHEET_NAMES.MEMBER_HISTORY, timeCols: ['createdAt'] },
    { name: SHEET_NAMES.PROGRAM_CARDS, timeCols: ['createdAt'] },
  ];

  let convertedCount = 0;
  tabsToProcess.forEach(function (tabInfo) {
    const sheet = ss.getSheetByName(tabInfo.name);
    if (!sheet) return;
    const values = sheet.getDataRange().getValues();
    if (values.length <= 1) return;
    const headers = values[0];
    const colIndices = tabInfo.timeCols
      .map(function (tc) { return headers.indexOf(tc); })
      .filter(function (idx) { return idx >= 0; });
    if (colIndices.length === 0) return;

    for (let r = 1; r < values.length; r++) {
      colIndices.forEach(function (cIdx) {
        const cellVal = values[r][cIdx];
        if (!cellVal) return;
        if (cellVal instanceof Date || (typeof cellVal === 'string' && (cellVal.includes('T') || cellVal.endsWith('Z')))) {
          const kst = toKSTString(cellVal);
          sheet.getRange(r + 1, cIdx + 1).setValue(kst);
          convertedCount++;
        }
      });
    }
  });

  SpreadsheetApp.getUi().alert('변환 완료!\n총 ' + convertedCount + '개의 일시 데이터가 한국 표준시(KST: YYYY-MM-DD HH:mm:ss) 형식으로 변환되었습니다.');
}

// 헬퍼: 8대 탭 및 헤더 자동 생성 및 누락 컬럼 동기화 (기존 데이터 100% 보존)
function ensureSheetStructure(ss) {
  const schemas = [
    {
      name: SHEET_NAMES.CONFIG,
      headers: ['key', 'value', 'description'],
    },
    {
      name: SHEET_NAMES.MEMBERS,
      headers: ['id', 'name', 'part', 'phoneLast4', 'phone', 'role', 'status', 'joinedAt', 'memberStatus', 'note', 'boundDeviceId', 'boundDeviceAt', 'mergedIntoId'],
    },
    {
      name: SHEET_NAMES.SCHEDULES,
      headers: ['id', 'title', 'date', 'startTime', 'endTime', 'locationName', 'category', 'checkInPin', 'description', 'programId', 'seriesId', 'seriesIndex', 'seriesTotal', 'isArchived', 'targetAudienceType', 'targetParts', 'targetMemberIds', 'locationId', 'latitude', 'longitude', 'radiusMeters', 'isCancelled'],
    },
    {
      name: SHEET_NAMES.RSVP,
      headers: ['id', 'scheduleId', 'memberId', 'memberName', 'part', 'status', 'reason', 'timestamp'],
    },
    {
      name: SHEET_NAMES.LOGS,
      headers: ['id', 'timestamp', 'scheduleId', 'memberId', 'memberName', 'part', 'authMethod', 'isVerifiedLocation', 'adminNote', 'distanceMeters'],
    },
    {
      name: SHEET_NAMES.LOCATIONS,
      headers: ['id', 'name', 'address', 'detailAddress', 'entranceNote', 'latitude', 'longitude', 'radiusMeters', 'isDefault'],
    },
    {
      name: SHEET_NAMES.MEMBER_HISTORY,
      headers: ['id', 'memberId', 'name', 'status', 'part', 'startDate', 'endDate', 'reason', 'createdAt'],
    },
    {
      name: SHEET_NAMES.PROGRAM_CARDS,
      headers: ['id', 'title', 'description', 'category', 'defaultLocationId', 'defaultStartTime', 'defaultEndTime', 'isArchived', 'createdAt', 'targetAudienceType', 'targetParts', 'targetMemberIds'],
    },
  ];

  schemas.forEach(function (s) {
    let sheet = ss.getSheetByName(s.name);
    if (!sheet) {
      sheet = ss.insertSheet(s.name);
      sheet.appendRow(s.headers);
      sheet.setFrozenRows(1);
      const headerRange = sheet.getRange(1, 1, 1, s.headers.length);
      headerRange.setBackground('#282C48');
      headerRange.setFontColor('#FFFFFF');
      headerRange.setFontWeight('bold');
    } else {
      const lastCol = sheet.getLastColumn();
      if (lastCol >= 1) {
        const currentHeaders = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim(); });
        const missingHeaders = s.headers.filter(function (h) { return currentHeaders.indexOf(h) === -1; });
        if (missingHeaders.length > 0) {
          const newHeaderRange = sheet.getRange(1, lastCol + 1, 1, missingHeaders.length);
          newHeaderRange.setValues([missingHeaders]);
          newHeaderRange.setBackground('#282C48');
          newHeaderRange.setFontColor('#FFFFFF');
          newHeaderRange.setFontWeight('bold');
        }
      }
    }
  });
}

// 헬퍼: 초기 기본 설정 및 샘플 데이터
function seedInitialData(ss) {
  const configSheet = ss.getSheetByName(SHEET_NAMES.CONFIG);
  if (configSheet && configSheet.getLastRow() <= 1) {
    const defaultConfigs = [
      ['choirName', '문콰이어', '합창단 공식 명칭'],
      ['rehearsalDay', '목요일', '정기 연습 요일'],
      ['startTime', '19:30', '정기 연습 시작 시간'],
      ['lateGraceMinutes', '10', '지각 판정 유예 시간(분)'],
      ['defaultLat', '37.5665', '기본 연습 장소 위도'],
      ['defaultLon', '126.9780', '기본 연습 장소 경도'],
      ['defaultRadius', '100', '출석 인정 반경(m)'],
      ['adminPin', '1234', '관리자 마스터 인증 PIN'],
      ['activeOnSitePin', '5027', '현장 수동 출석 인증 PIN'],
      ['customParts', '소프라노,알토,테너,베이스,선생님,객원', '활동 파트 목록'],
      ['customMemberStatuses', '정단원,준단원,휴단원,객원,선생님,퇴단원', '단원 구분 상태 목록'],
      ['customCategories', '정기연습,추가연습,연주,워크샵', '일정 구분 카테고리 목록'],
      ['qrPrintTitle', '문콰이어 출석 체크', '출석 인쇄물 타이틀'],
      ['qrPrintSubtitle', '카메라를 켜고 QR코드를 스캔하세요', '출석 인쇄물 서브타이틀'],
      ['qrPrintNotice', 'GPS 오차가 발생할 경우 화면의 [키패드로 출석]을 이용하세요', '출석 인쇄물 안내문'],
    ];
    configSheet.getRange(2, 1, defaultConfigs.length, defaultConfigs[0].length).setValues(defaultConfigs);
  }

  const memberSheet = ss.getSheetByName(SHEET_NAMES.MEMBERS);
  if (memberSheet && memberSheet.getLastRow() <= 1) {
    const defaultMembers = [
      ['mem_s01', '김하은', '소프라노', '1234', 'MEMBER', 'ACTIVE', '2025-01-10', '정단원', '악보장 담당'],
      ['mem_s02', '박서연', '소프라노', '5678', 'MEMBER', 'ACTIVE', '2025-02-15', '정단원', ''],
      ['mem_s03', '이지민', '소프라노', '2345', 'MEMBER', 'ACTIVE', '2025-03-01', '준단원', '신입'],
      ['mem_s04', '최유진', '소프라노', '6789', 'MEMBER', 'ACTIVE', '2024-09-01', '정단원', ''],
      ['mem_s05', '강다은', '소프라노', '3456', 'MEMBER', 'ACTIVE', '2024-11-10', '정단원', '총무 담당'],
      ['mem_s06', '조수빈', '소프라노', '7890', 'MEMBER', 'ACTIVE', '2025-04-01', '준단원', ''],
      ['mem_a01', '정유나', '알토', '4567', 'MEMBER', 'ACTIVE', '2024-08-20', '정단원', '알토 파트장'],
      ['mem_a02', '한소희', '알토', '8901', 'MEMBER', 'ACTIVE', '2024-10-05', '정단원', ''],
      ['mem_a03', '오채원', '알토', '1357', 'MEMBER', 'ACTIVE', '2025-01-15', '정단원', ''],
      ['mem_a04', '신예은', '알토', '2468', 'MEMBER', 'ACTIVE', '2025-02-20', '준단원', ''],
      ['mem_a05', '배수현', '알토', '3579', 'MEMBER', 'ACTIVE', '2024-12-01', '정단원', ''],
      ['mem_a06', '문지영', '알토', '4680', 'MEMBER', 'ACTIVE', '2025-05-10', '준단원', ''],
      ['mem_t01', '윤도현', '테너', '9012', 'MEMBER', 'ACTIVE', '2024-07-01', '정단원', '테너 파트장'],
      ['mem_t02', '송민준', '테너', '0123', 'MEMBER', 'ACTIVE', '2024-11-15', '정단원', ''],
      ['mem_t03', '임시완', '테너', '5791', 'MEMBER', 'ACTIVE', '2025-02-01', '정단원', ''],
      ['mem_t04', '장기하', '테너', '6802', 'MEMBER', 'ACTIVE', '2025-03-15', '준단원', ''],
      ['mem_t05', '권혁수', '테너', '7913', 'MEMBER', 'ACTIVE', '2024-09-20', '정단원', '회계 담당'],
      ['mem_t06', '남궁민', '테너', '8024', 'MEMBER', 'ACTIVE', '2025-04-20', '준단원', ''],
      ['mem_b01', '최지우', '베이스', '3456', 'MEMBER', 'ACTIVE', '2024-06-10', '정단원', '단장'],
      ['mem_b02', '황정민', '베이스', '7891', 'MEMBER', 'ACTIVE', '2024-08-15', '정단원', '베이스 파트장'],
      ['mem_b03', '안성기', '베이스', '9135', 'MEMBER', 'ACTIVE', '2024-05-01', '정단원', '최고참 단원'],
      ['mem_b04', '유해진', '베이스', '0246', 'MEMBER', 'ACTIVE', '2025-01-20', '준단원', ''],
      ['mem_b05', '류승룡', '베이스', '1358', 'MEMBER', 'ACTIVE', '2024-10-10', '정단원', ''],
      ['mem_b06', '박해일', '베이스', '2469', 'MEMBER', 'ACTIVE', '2025-03-05', '준단원', '']
    ];
    memberSheet.getRange(2, 1, defaultMembers.length, defaultMembers[0].length).setValues(defaultMembers);
  }

  const schSheet = ss.getSheetByName(SHEET_NAMES.SCHEDULES);
  if (schSheet && schSheet.getLastRow() <= 1) {
    const defaultSchedules = [
      ['sch_20261001', '10월 1주차 정기연습', '2026-10-01', '19:30', '21:30', '문콰이어 제1연습실 (명동)', '정기연습', '1001', '정기 합창 연습'],
      ['sch_20261008', '10월 2주차 정기연습', '2026-10-08', '19:30', '21:30', '문콰이어 제1연습실 (명동)', '정기연습', '1008', '정기 합창 연습'],
      ['sch_20261015', '10월 3주차 정기연습', '2026-10-15', '19:30', '22:00', '문콰이어 제1연습실 (명동)', '정기연습', '1015', '정기 집중 연습'],
      ['sch_20261022', '10월 4주차 정기연습', '2026-10-22', '19:30', '21:30', '문콰이어 제1연습실 (명동)', '정기연습', '1022', '정기 합창 연습'],
      ['sch_20261025', '가을 정기 연주회 리허설', '2026-10-25', '14:00', '18:00', '세종문화회관 체임버홀 대기실', '연주', '1025', '무대 리허설'],
      ['sch_20261029', '10월 5주차 정기연습', '2026-10-29', '19:30', '21:30', '문콰이어 제1연습실 (명동)', '정기연습', '1029', '정기 합창 연습']
    ];
    schSheet.getRange(2, 1, defaultSchedules.length, defaultSchedules[0].length).setValues(defaultSchedules);
  }

  const locSheet = ss.getSheetByName(SHEET_NAMES.LOCATIONS);
  if (locSheet && locSheet.getLastRow() <= 1) {
    const defaultLocations = [
      ['loc_main', '문콰이어 제1연습실 (명동)', '서울 중구 명동길 73', '가톨릭회관 3층 연습실', '정문 엘리베이터 이용 3층 302호', 37.5632, 126.9871, 200, 'TRUE'],
      ['loc_sub', '세종문화회관 체임버홀 대기실', '서울 종로구 세종대로 175', '세종예술아카데미 리허설룸', '출연자 출입증 지참 후 지하 1층 대기실', 37.5724, 126.9756, 300, 'FALSE']
    ];
    locSheet.getRange(2, 1, defaultLocations.length, defaultLocations[0].length).setValues(defaultLocations);
  }

  const cardSheet = ss.getSheetByName(SHEET_NAMES.PROGRAM_CARDS);
  if (cardSheet && cardSheet.getLastRow() <= 1) {
    const defaultCards = [
      {
        id: 'card_fall_2026',
        title: '2026 하반기 정기연습',
        description: '가을 정기연습 16주 과정 및 제12회 정기연주회 대비',
        category: '정기연습',
        defaultLocationId: 'loc_main',
        defaultStartTime: '19:30',
        defaultEndTime: '21:30',
        isArchived: 'FALSE',
        createdAt: toKSTString('2026-08-01 00:00:00'),
        targetAudienceType: 'ALL',
        targetParts: '',
        targetMemberIds: '',
      },
      {
        id: 'card_special_2026',
        title: '연주회 집중 리허설',
        description: '정기연주회 전 파트 집중 점검 및 총 리허설',
        category: '연주',
        defaultLocationId: 'loc_main',
        defaultStartTime: '14:00',
        defaultEndTime: '18:00',
        isArchived: 'FALSE',
        createdAt: toKSTString('2026-09-01 00:00:00'),
        targetAudienceType: 'ALL',
        targetParts: '',
        targetMemberIds: '',
      }
    ];
    const headers = cardSheet.getRange(1, 1, 1, Math.max(cardSheet.getLastColumn(), 1)).getValues()[0];
    defaultCards.forEach(function (cardObj) {
      const row = headers.map(function (h) {
        return cardObj[h] !== undefined ? cardObj[h] : '';
      });
      cardSheet.appendRow(row);
    });
  }
}

// 헬퍼: 시트 데이터를 헤더 기반 JSON 객체 배열로 변환 (Date 객체 KST 포맷팅)
function readSheetData(sheet) {
  if (!sheet) return [];
  const rows = sheet.getDataRange().getValues();
  if (rows.length <= 1) return [];

  const headers = rows[0];
  const list = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row[0] && !row[1]) continue;
    const item = {};
    for (let j = 0; j < headers.length; j++) {
      let val = row[j];
      if (val instanceof Date) {
        const headerKey = String(headers[j]).toLowerCase();
        if (headerKey === 'starttime' || headerKey === 'endtime' || headerKey === 'defaultstarttime' || headerKey === 'defaultendtime') {
          val = Utilities.formatDate(val, 'Asia/Seoul', 'HH:mm');
        } else if (headerKey === 'date' || headerKey === 'startdate' || headerKey === 'enddate' || headerKey === 'joinedat') {
          val = Utilities.formatDate(val, 'Asia/Seoul', 'yyyy-MM-dd');
        } else {
          val = Utilities.formatDate(val, 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
        }
      } else if (typeof val === 'number') {
        const key = String(headers[j]);
        if (key === 'phoneLast4' || key === 'checkInPin') {
          val = String(val).padStart(4, '0');
        } else if (key === 'phone') {
          val = String(val);
          if (val.length === 10 && !val.startsWith('0')) {
            val = '0' + val;
          }
          if (val.length === 11 && !val.includes('-')) {
            val = val.slice(0, 3) + '-' + val.slice(3, 7) + '-' + val.slice(7);
          }
        }
      } else if (typeof val === 'string') {
        const key = String(headers[j]);
        if (key === 'phone') {
          const raw = val.replace(/\D/g, '');
          if (raw.length === 11 && !val.includes('-')) {
            val = raw.slice(0, 3) + '-' + raw.slice(3, 7) + '-' + raw.slice(7);
          } else if (raw.length === 10 && !raw.startsWith('0')) {
            const padded = '0' + raw;
            val = padded.slice(0, 3) + '-' + padded.slice(3, 7) + '-' + padded.slice(7);
          }
        }
      }
      item[headers[j]] = val;
    }
    list.push(item);
  }
  return list;
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
