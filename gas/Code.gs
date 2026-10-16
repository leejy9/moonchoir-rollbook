/**
 * ============================================================================
 * Moonchoir Rollbook (문콰이어 출석부) — Google Apps Script Backend (SSOT)
 * ============================================================================
 * 
 * [배포 및 사용법]
 * 1. 구글 스프레드시트를 새로 하나 생성합니다. (이름: "문콰이어 출석부 & 일정")
 * 2. 상단 메뉴 [확장 프로그램] -> [Apps Script]를 클릭합니다.
 * 3. 기존 코드를 모두 지우고 이 파일 전체 내용을 복사하여 붙여넣습니다.
 * 4. 상단 함수 선택 드롭다운에서 `setupMoonchoirSheets`를 선택하고 [실행] 버튼을 누릅니다.
 *    (처음 1회 권한 승인 팝업이 뜨면 '고급' -> '이동(안전하지 않음)' 승인)
 *    -> 5개 시트 탭(Members, Schedules, RSVP_Votes, Attendance_Logs, Config)과 초기 데이터가 자동 생성됩니다!
 * 5. 우측 상단 [배포] -> [새 배포] -> 유형: [웹 앱] 선택
 *    - 설명: "문콰이어 출석부 API"
 *    - 다음 사용자 권한으로 실행: "나 (내 계정)"
 *    - 액세스 권한: "모든 사용자 (Anyone)" 로 설정! (대원들이 로그인 없이 통신하기 위함)
 * 6. [배포] 버튼을 누르고 복사된 '웹 앱 URL' (https://script.google.com/macros/s/.../exec)을
 *    문콰이어 앱 [관리자 대시보드] -> [구글 시트 연동 설정]에 붙여넣으면 끝!
 */

var TAB_NAMES = {
  ATTENDANCE_LOGS: 'Attendance_Logs',
  RSVP_VOTES: 'RSVP_Votes',
  SCHEDULES: 'Schedules',
  MEMBERS: 'Members',
  CONFIG: 'Config',
};

var HEADERS = {
  ATTENDANCE_LOGS: [
    'id', 'timestamp', 'scheduleId', 'memberId', 'memberName',
    'part', 'authMethod', 'latitude', 'longitude', 'distanceMeters',
    'isVerifiedLocation', 'adminNote'
  ],
  RSVP_VOTES: [
    'id', 'timestamp', 'scheduleId', 'memberId', 'memberName',
    'part', 'status', 'reason'
  ],
  SCHEDULES: [
    'id', 'title', 'date', 'startTime', 'endTime',
    'locationName', 'targetLat', 'targetLon', 'radiusMeters',
    'category', 'recurrenceRule', 'description'
  ],
  MEMBERS: [
    'id', 'name', 'part', 'phoneLast4', 'role', 'createdAt', 'status'
  ],
  CONFIG: [
    'key', 'value', 'description'
  ],
};

/**
 * 최초 1회 실행용 자동 시트 및 기본 데이터 초기화 함수
 */
function setupMoonchoirSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  // 1. 시트 탭 생성 및 헤더 스타일링
  Object.keys(TAB_NAMES).forEach(function (key) {
    var tabName = TAB_NAMES[key];
    var sheet = ss.getSheetByName(tabName);
    if (!sheet) {
      sheet = ss.insertSheet(tabName);
    }

    var headers = HEADERS[key];
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
      var headerRange = sheet.getRange(1, 1, 1, headers.length);
      headerRange.setBackground('#1e293b');
      headerRange.setFontColor('#f8fafc');
      headerRange.setFontWeight('bold');
      headerRange.setHorizontalAlignment('center');
      sheet.setFrozenRows(1);
    }
  });

  // 빈 기본 시트(예: Sheet1, 시트1)가 있고 다른 시트가 존재하면 정리
  var defaultSheet = ss.getSheetByName('Sheet1') || ss.getSheetByName('시트1');
  if (defaultSheet && ss.getSheets().length > 1) {
    try { ss.deleteSheet(defaultSheet); } catch (e) {}
  }

  // 2. Config 기본값 입력 (없는 경우만)
  var configSheet = ss.getSheetByName(TAB_NAMES.CONFIG);
  if (configSheet && configSheet.getLastRow() <= 1) {
    var defaultConfigs = [
      ['rehearsalDay', '목요일', '정기 연습 요일'],
      ['startTime', '19:30', '정기 연습 시작 시간 (HH:mm)'],
      ['lateGraceMinutes', '10', '지각 유예 기준 시간 (분)'],
      ['defaultLat', '37.5665', '기본 연습실 위도 (서울시청 기준)'],
      ['defaultLon', '126.9780', '기본 연습실 경도'],
      ['defaultRadius', '100', 'GPS 지오펜싱 허용 반경 (미터)'],
      ['adminPin', '1234', '관리자 마스터 비밀번호']
    ];
    defaultConfigs.forEach(function (row) {
      configSheet.appendRow(row);
    });
  }

  // 3. Members 초기 대원 샘플 등록 (없는 경우만)
  var memberSheet = ss.getSheetByName(TAB_NAMES.MEMBERS);
  if (memberSheet && memberSheet.getLastRow() <= 1) {
    var initialMembers = [
      ['m_001', '김지민', '소프라노', '1234', 'MEMBER', '2026-03-01T00:00:00Z', 'ACTIVE'],
      ['m_002', '이서연', '소프라노', '2345', 'MEMBER', '2026-03-01T00:00:00Z', 'ACTIVE'],
      ['m_003', '박민지', '소프라노', '3456', 'MEMBER', '2026-03-01T00:00:00Z', 'ACTIVE'],
      ['m_004', '최유진', '알토', '4567', 'MEMBER', '2026-03-01T00:00:00Z', 'ACTIVE'],
      ['m_005', '정다은', '알토', '5678', 'MEMBER', '2026-03-01T00:00:00Z', 'ACTIVE'],
      ['m_006', '강예린', '알토', '6789', 'MEMBER', '2026-03-01T00:00:00Z', 'ACTIVE'],
      ['m_007', '윤도현', '테너', '7890', 'MEMBER', '2026-03-01T00:00:00Z', 'ACTIVE'],
      ['m_008', '임재혁', '테너', '8901', 'MEMBER', '2026-03-01T00:00:00Z', 'ACTIVE'],
      ['m_009', '조현우', '테너', '9012', 'MEMBER', '2026-03-01T00:00:00Z', 'ACTIVE'],
      ['m_010', '한상진', '베이스', '0123', 'MEMBER', '2026-03-01T00:00:00Z', 'ACTIVE'],
      ['m_011', '오태양', '베이스', '1122', 'MEMBER', '2026-03-01T00:00:00Z', 'ACTIVE'],
      ['m_012', '송민규', '베이스', '2233', 'MEMBER', '2026-03-01T00:00:00Z', 'ACTIVE'],
      ['m_013', '문지휘', '선생님', '7777', 'ADMIN', '2026-01-01T00:00:00Z', 'ACTIVE'],
      ['m_014', '박반주', '선생님', '8888', 'MEMBER', '2026-01-01T00:00:00Z', 'ACTIVE'],
      ['m_015', '장객원', '객원', '9999', 'GUEST', '2026-10-01T00:00:00Z', 'ACTIVE']
    ];
    initialMembers.forEach(function (row) {
      memberSheet.appendRow(row);
    });
  }

  // 4. Schedules 초기 일정 샘플 등록 (없는 경우만)
  var scheduleSheet = ss.getSheetByName(TAB_NAMES.SCHEDULES);
  if (scheduleSheet && scheduleSheet.getLastRow() <= 1) {
    var initialSchedules = [
      ['sch_20261015', '10월 3주차 정기연습', '2026-10-15', '19:30', '21:30', '문콰이어 제1연습실', 37.5665, 126.9780, 100, '정기연습', 'WEEKLY_THU', '정기 합창 및 파트별 발성 연습'],
      ['sch_20261022', '10월 4주차 정기연습', '2026-10-22', '19:30', '21:30', '문콰이어 제1연습실', 37.5665, 126.9780, 100, '정기연습', 'WEEKLY_THU', '가을 정기연주회 전 파트 집중 리허설'],
      ['sch_20261025', '가을 연주회 직전 총연습', '2026-10-25', '14:00', '18:00', '세종문화회관 체임버홀', 37.5726, 126.9760, 150, '추가연습', 'NONE', '무대 동선 및 오케스트라 협연 리허설'],
      ['sch_20261029', '제14회 문콰이어 가을 정기연주회', '2026-10-29', '19:00', '21:30', '국립극장 해오름극장', 37.5524, 127.0004, 200, '연주', 'NONE', '2026년 가을 메인 정기 공연']
    ];
    initialSchedules.forEach(function (row) {
      scheduleSheet.appendRow(row);
    });
  }

  Logger.log('🎉 문콰이어 스프레드시트 5대 탭 초기화가 완료되었습니다!');
}

/**
 * GET 요청 핸들러 (초기 데이터 조회 등)
 */
function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    var members = readSheetAsObjects(ss.getSheetByName(TAB_NAMES.MEMBERS));
    var schedules = readSheetAsObjects(ss.getSheetByName(TAB_NAMES.SCHEDULES));
    var rsvpVotes = readSheetAsObjects(ss.getSheetByName(TAB_NAMES.RSVP_VOTES));
    var logs = readSheetAsObjects(ss.getSheetByName(TAB_NAMES.ATTENDANCE_LOGS));
    var rawConfig = readSheetAsObjects(ss.getSheetByName(TAB_NAMES.CONFIG));

    // Config를 key-value 맵으로 변환
    var config = {};
    rawConfig.forEach(function (row) {
      if (row.key) {
        var val = row.value;
        if (row.key === 'lateGraceMinutes' || row.key === 'defaultRadius') {
          val = Number(val);
        } else if (row.key === 'defaultLat' || row.key === 'defaultLon') {
          val = parseFloat(val);
        }
        config[row.key] = val;
      }
    });

    var responseData = {
      success: true,
      data: {
        members: members,
        schedules: schedules,
        rsvpVotes: rsvpVotes,
        recentLogs: logs,
        config: config
      }
    };

    return ContentService.createTextOutput(JSON.stringify(responseData))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * POST 요청 핸들러 (출석 체크인, RSVP 투표, 대원 등록, 일정 등록)
 */
function doPost(e) {
  try {
    var rawContents = e.postData ? e.postData.contents : '';
    if (!rawContents) {
      throw new Error('빈 요청 페이로드입니다.');
    }

    var body = JSON.parse(rawContents);
    var action = body.action;
    var payload = body.payload;
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    switch (action) {
      case 'SUBMIT_CHECKIN':
        handleAppendCheckin(ss, payload);
        break;

      case 'SUBMIT_RSVP':
        handleUpsertRSVP(ss, payload);
        break;

      case 'REGISTER_MEMBER':
        handleAppendMember(ss, payload);
        break;

      case 'CREATE_SCHEDULE':
        handleAppendSchedule(ss, payload);
        break;

      default:
        throw new Error('지원되지 않는 action 입니다: ' + action);
    }

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: '성공적으로 처리되었습니다 (' + action + ')'
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * 원천 출석 로그 추가 (Append-Only)
 */
function handleAppendCheckin(ss, log) {
  var sheet = ss.getSheetByName(TAB_NAMES.ATTENDANCE_LOGS);
  if (!sheet) throw new Error('Attendance_Logs 시트가 없습니다.');

  var row = [
    log.id || ('log_' + new Date().getTime()),
    log.timestamp || new Date().toISOString(),
    log.scheduleId || '',
    log.memberId || '',
    log.memberName || '',
    log.part || '',
    log.authMethod || 'QR_SCAN',
    log.latitude !== undefined ? log.latitude : '',
    log.longitude !== undefined ? log.longitude : '',
    log.distanceMeters !== undefined ? log.distanceMeters : '',
    log.isVerifiedLocation !== undefined ? log.isVerifiedLocation : false,
    log.adminNote || ''
  ];

  sheet.appendRow(row);
}

/**
 * RSVP 사전 투표 (같은 대원 + 같은 일정이면 업데이트, 없으면 추가)
 */
function handleUpsertRSVP(ss, vote) {
  var sheet = ss.getSheetByName(TAB_NAMES.RSVP_VOTES);
  if (!sheet) throw new Error('RSVP_Votes 시트가 없습니다.');

  var data = sheet.getDataRange().getValues();
  var scheduleColIdx = 2; // C열 (0-indexed)
  var memberColIdx = 3;   // D열 (0-indexed)
  var foundRowIdx = -1;

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][scheduleColIdx]) === String(vote.scheduleId) &&
        String(data[i][memberColIdx]) === String(vote.memberId)) {
      foundRowIdx = i + 1; // 1-indexed for Sheet API
      break;
    }
  }

  var row = [
    vote.id || ('rsvp_' + new Date().getTime()),
    vote.timestamp || new Date().toISOString(),
    vote.scheduleId,
    vote.memberId,
    vote.memberName,
    vote.part,
    vote.status,
    vote.reason || ''
  ];

  if (foundRowIdx > 0) {
    sheet.getRange(foundRowIdx, 1, 1, row.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
}

/**
 * 신규 대원 등록
 */
function handleAppendMember(ss, member) {
  var sheet = ss.getSheetByName(TAB_NAMES.MEMBERS);
  if (!sheet) throw new Error('Members 시트가 없습니다.');

  var row = [
    member.id || ('m_' + new Date().getTime()),
    member.name,
    member.part,
    member.phoneLast4,
    member.role || 'MEMBER',
    member.createdAt || new Date().toISOString(),
    member.status || 'ACTIVE'
  ];

  sheet.appendRow(row);
}

/**
 * 신규 일정 생성
 */
function handleAppendSchedule(ss, sch) {
  var sheet = ss.getSheetByName(TAB_NAMES.SCHEDULES);
  if (!sheet) throw new Error('Schedules 시트가 없습니다.');

  var row = [
    sch.id || ('sch_' + new Date().getTime()),
    sch.title,
    sch.date,
    sch.startTime,
    sch.endTime,
    sch.locationName,
    sch.targetLat,
    sch.targetLon,
    sch.radiusMeters,
    sch.category || '정기연습',
    sch.recurrenceRule || 'NONE',
    sch.description || ''
  ];

  sheet.appendRow(row);
}

/**
 * 시트 데이터를 헤더 키 기반의 객체 배열로 안전하게 파싱 (헤더 순서 독립적)
 */
function readSheetAsObjects(sheet) {
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow <= 1 || lastCol === 0) return [];

  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = values[0];
  var result = [];

  for (var r = 1; r < values.length; r++) {
    var rowData = {};
    var hasContent = false;
    for (var c = 0; c < headers.length; c++) {
      var headerKey = String(headers[c]).trim();
      var cellVal = values[r][c];

      // 날짜 객체 문자열 포맷팅
      if (cellVal instanceof Date) {
        cellVal = cellVal.toISOString();
      }

      if (cellVal !== '' && cellVal !== null && cellVal !== undefined) {
        hasContent = true;
      }
      rowData[headerKey] = cellVal;
    }
    if (hasContent) {
      result.push(rowData);
    }
  }

  return result;
}
