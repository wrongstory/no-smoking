import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";

/* ============================================
   금연 캘린더 - 메인 JavaScript
   Firebase 실시간 동기화 버전
   ============================================ */

// ============================================
// Firebase 설정
// ============================================
const firebaseConfig = {
  apiKey: "AIzaSyDiP1e_TEOaZppfCUm38WD9SFJ2iO9o0Xo",
  authDomain: "no-smoking-calendar.firebaseapp.com",
  projectId: "no-smoking-calendar",
  storageBucket: "no-smoking-calendar.firebasestorage.app",
  messagingSenderId: "260602852853",
  appId: "1:260602852853:web:ae8c345ae6a359c3ed1cbc",
  measurementId: "G-H9Q964V9NF"
};

// Firebase 초기화
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
let db = null;
let isFirebaseReady = false;

try {
  firebase.initializeApp(firebaseConfig);
  db = firebase.firestore();
  isFirebaseReady = firebaseConfig.apiKey !== "YOUR_API_KEY";

  if (isFirebaseReady) {
    console.log('✅ Firebase 연결 성공!');
  } else {
    console.log('⚠️ Firebase 설정이 필요합니다. LocalStorage 모드로 실행됩니다.');
  }
} catch (e) {
  console.error('Firebase 초기화 실패:', e);
  isFirebaseReady = false;
}

// ============================================
// 인증 모듈 (Authentication)
// ============================================
const Auth = {
  // 사용자 정보 (실제 운영 시 서버 측에서 관리 권장)
  // ⚠️ 비밀번호는 배포 전에 변경하세요!
  USERS: {
    girlfriend: {
      name: '서연',
      emoji: '💕',
      password: 'tjdus1234',  // ← 여기서 비밀번호 변경!
      role: 'recorder'       // 기록만 가능
    },
    myungwoo: {
      name: '명우',
      emoji: '💪',
      password: 'auddn1234', // ← 여기서 비밀번호 변경!
      role: 'supporter'      // 응원만 가능
    }
  },

  // 현재 로그인된 사용자
  currentUser: null,

  // 초기화 - 저장된 세션 확인
  init() {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
      this.currentUser = JSON.parse(savedUser);
      return true;
    }
    return false;
  },

  // 로그인
  login(username, password) {
    const user = this.USERS[username];
    if (!user) return { success: false, error: '사용자를 선택해주세요' };
    if (user.password !== password) return { success: false, error: '비밀번호가 틀렸어요 😢' };

    this.currentUser = {
      id: username,
      name: user.name,
      emoji: user.emoji,
      role: user.role
    };

    // 세션 저장
    localStorage.setItem('currentUser', JSON.stringify(this.currentUser));
    return { success: true };
  },

  // 로그아웃
  logout() {
    this.currentUser = null;
    localStorage.removeItem('currentUser');
  },

  // 현재 사용자 가져오기
  getUser() {
    return this.currentUser;
  },

  // 역할 확인
  isRecorder() {
    return this.currentUser?.role === 'recorder';
  },

  isSupporter() {
    return this.currentUser?.role === 'supporter';
  }
};

// ============================================
// 데이터 레이어 (Firebase + LocalStorage 하이브리드)
// ============================================
const DataStore = {
  // Firestore 컬렉션 이름
  COLLECTION: 'noSmokingData',
  DOC_ID: 'shared', // 커플이 공유하는 단일 문서

  // 캐시 (실시간 리스너용)
  cache: {
    records: {},
    stamps: {},
    cheers: [],
    startDate: null
  },

  // 실시간 리스너 해제 함수
  unsubscribe: null,

  // 초기화 및 실시간 리스너 설정
  async init() {
    if (!isFirebaseReady) {
      // LocalStorage에서 캐시 로드
      this.cache.records = JSON.parse(localStorage.getItem('smokingRecords') || '{}');
      this.cache.stamps = JSON.parse(localStorage.getItem('partnerStamps') || '{}');
      this.cache.cheers = JSON.parse(localStorage.getItem('cheerMessages') || '[]');
      this.cache.startDate = JSON.parse(localStorage.getItem('quitStartDate') || 'null');
      return;
    }

    // Firebase 실시간 리스너 설정
    this.unsubscribe = db.collection(this.COLLECTION).doc(this.DOC_ID)
      .onSnapshot((doc) => {
        if (doc.exists) {
          const data = doc.data();
          this.cache.records = data.records || {};
          this.cache.stamps = data.stamps || {};
          this.cache.cheers = data.cheers || [];
          this.cache.startDate = data.startDate || null;

          // UI 자동 업데이트
          if (typeof Calendar !== 'undefined' && Calendar.currentDate) {
            Calendar.renderCalendar();
          }
          if (typeof App !== 'undefined') {
            App.updateStats();
            App.updateStartDateDisplay();
            App.updateCheerBanner();
          }
          console.log('🔄 데이터 동기화됨');
        }
      }, (error) => {
        console.error('실시간 동기화 오류:', error);
      });
  },

  // Firebase에 전체 데이터 저장
  async syncToFirebase() {
    if (!isFirebaseReady) return;

    try {
      await db.collection(this.COLLECTION).doc(this.DOC_ID).set({
        records: this.cache.records,
        stamps: this.cache.stamps,
        cheers: this.cache.cheers,
        startDate: this.cache.startDate,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
    } catch (e) {
      console.error('Firebase 동기화 실패:', e);
    }
  },

  // LocalStorage에 백업 저장
  saveToLocal() {
    localStorage.setItem('smokingRecords', JSON.stringify(this.cache.records));
    localStorage.setItem('partnerStamps', JSON.stringify(this.cache.stamps));
    localStorage.setItem('cheerMessages', JSON.stringify(this.cache.cheers));
    localStorage.setItem('quitStartDate', JSON.stringify(this.cache.startDate));
  },

  // 기록 저장
  async saveRecord(dateKey, record) {
    this.cache.records[dateKey] = { ...this.cache.records[dateKey], ...record };
    this.saveToLocal();
    await this.syncToFirebase();
    return true;
  },

  // 기록 가져오기
  getRecord(dateKey) {
    return this.cache.records[dateKey] || null;
  },

  // 모든 기록 가져오기
  getAllRecords() {
    return this.cache.records;
  },

  // 도장 저장
  async saveStamp(dateKey, stamp) {
    this.cache.stamps[dateKey] = stamp;
    this.saveToLocal();
    await this.syncToFirebase();
    return true;
  },

  // 도장 가져오기
  getStamp(dateKey) {
    return this.cache.stamps[dateKey] || null;
  },

  // 응원 메시지 저장
  async saveCheerMessage(message) {
    this.cache.cheers.push({
      message,
      timestamp: new Date().toISOString()
    });
    // 최근 50개만 유지
    if (this.cache.cheers.length > 50) this.cache.cheers.shift();
    this.saveToLocal();
    await this.syncToFirebase();
    return true;
  },

  // 랜덤 응원 메시지 가져오기
  getRandomCheer() {
    if (this.cache.cheers.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * this.cache.cheers.length);
    return this.cache.cheers[randomIndex].message;
  },

  // 금연 시작일 저장
  async saveStartDate(date, motivation = '') {
    this.cache.startDate = {
      date: date,
      motivation: motivation,
      setAt: new Date().toISOString()
    };
    this.saveToLocal();
    await this.syncToFirebase();
    return true;
  },

  // 금연 시작일 가져오기
  getStartDate() {
    return this.cache.startDate;
  },

  // 금연 시작일 삭제
  async clearStartDate() {
    this.cache.startDate = null;
    localStorage.removeItem('quitStartDate');
    await this.syncToFirebase();
  }
};

// ============================================
// 유틸리티 함수
// ============================================
const Utils = {
  // 날짜 키 생성 (YYYY-MM-DD)
  getDateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  // 날짜 포맷팅 (한국어)
  formatDate(date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
    const weekday = weekdays[date.getDay()];
    return `${year}년 ${month}월 ${day}일 (${weekday})`;
  },

  // 월 포맷팅
  formatMonth(date) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    return `${year}년 ${month}월`;
  },

  // 오늘인지 확인
  isToday(date) {
    const today = new Date();
    return this.getDateKey(date) === this.getDateKey(today);
  },

  // 해당 월의 일수 구하기
  getDaysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
  },

  // 해당 월의 첫날 요일 구하기
  getFirstDayOfMonth(year, month) {
    return new Date(year, month, 1).getDay();
  }
};

// ============================================
// 통계 계산 모듈
// ============================================
const Statistics = {
  // 연속 금연 일수 계산
  calculateCurrentStreak() {
    const records = DataStore.getAllRecords();
    let streak = 0;
    const today = new Date();

    // 오늘부터 과거로 체크
    for (let i = 0; i < 365; i++) {
      const checkDate = new Date(today);
      checkDate.setDate(today.getDate() - i);
      const dateKey = Utils.getDateKey(checkDate);
      const record = records[dateKey];

      // 오늘은 기록이 없어도 스킵
      if (i === 0 && !record) continue;

      if (record && record.success === true) {
        streak++;
      } else if (record && record.success === false) {
        break;
      } else if (i > 0) {
        // 기록이 없는 날도 중단 (오늘 제외)
        break;
      }
    }
    return streak;
  },

  // 최장 연속 금연 기록
  calculateBestStreak() {
    const records = DataStore.getAllRecords();
    const sortedDates = Object.keys(records).sort();

    let bestStreak = 0;
    let currentStreak = 0;
    let prevDate = null;

    for (const dateKey of sortedDates) {
      const record = records[dateKey];

      if (record.success === true) {
        if (prevDate) {
          const prev = new Date(prevDate);
          const curr = new Date(dateKey);
          const diffDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));

          if (diffDays === 1) {
            currentStreak++;
          } else {
            currentStreak = 1;
          }
        } else {
          currentStreak = 1;
        }
        bestStreak = Math.max(bestStreak, currentStreak);
        prevDate = dateKey;
      } else {
        currentStreak = 0;
        prevDate = null;
      }
    }

    return bestStreak;
  },

  // 총 금연 일수
  calculateTotalDays() {
    const records = DataStore.getAllRecords();
    return Object.values(records).filter(r => r.success === true).length;
  },

  // 월별 성공률 계산
  calculateMonthlyProgress(year, month) {
    const records = DataStore.getAllRecords();
    const daysInMonth = Utils.getDaysInMonth(year, month);
    const today = new Date();

    let successCount = 0;
    let totalRecordedDays = 0;

    for (let day = 1; day <= daysInMonth; day++) {
      const checkDate = new Date(year, month, day);

      // 미래 날짜는 제외
      if (checkDate > today) break;

      const dateKey = Utils.getDateKey(checkDate);
      const record = records[dateKey];

      if (record) {
        totalRecordedDays++;
        if (record.success === true) {
          successCount++;
        }
      }
    }

    if (totalRecordedDays === 0) return 0;
    return Math.round((successCount / totalRecordedDays) * 100);
  }
};

// ============================================
// 캘린더 렌더링 모듈
// ============================================
const Calendar = {
  currentDate: new Date(),

  // 캘린더 초기화
  init() {
    this.renderCalendar();
    this.bindNavigation();
  },

  // 네비게이션 바인딩
  bindNavigation() {
    document.getElementById('prevMonth').addEventListener('click', () => {
      this.currentDate.setMonth(this.currentDate.getMonth() - 1);
      this.renderCalendar();
      App.updateStats();
    });

    document.getElementById('nextMonth').addEventListener('click', () => {
      this.currentDate.setMonth(this.currentDate.getMonth() + 1);
      this.renderCalendar();
      App.updateStats();
    });
  },

  // 캘린더 렌더링
  renderCalendar() {
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();

    // 월 표시 업데이트
    document.getElementById('currentMonth').textContent = Utils.formatMonth(this.currentDate);

    const grid = document.getElementById('calendarGrid');
    grid.innerHTML = '';

    const firstDay = Utils.getFirstDayOfMonth(year, month);
    const daysInMonth = Utils.getDaysInMonth(year, month);
    const daysInPrevMonth = Utils.getDaysInMonth(year, month - 1);

    const records = DataStore.getAllRecords();
    const stamps = DataStore.cache.stamps || {};

    // 이전 달 날짜 채우기
    for (let i = firstDay - 1; i >= 0; i--) {
      const day = daysInPrevMonth - i;
      const cell = this.createDayCell(day, true);
      grid.appendChild(cell);
    }

    // 현재 달 날짜 채우기
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateKey = Utils.getDateKey(date);
      const record = records[dateKey];
      const stamp = stamps[dateKey];

      const cell = this.createDayCell(day, false, date, record, stamp);
      grid.appendChild(cell);
    }

    // 다음 달 날짜 채우기 (6줄 맞추기)
    const totalCells = firstDay + daysInMonth;
    const remainingCells = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
    for (let day = 1; day <= remainingCells; day++) {
      const cell = this.createDayCell(day, true);
      grid.appendChild(cell);
    }
  },

  // 날짜 셀 생성
  createDayCell(day, isOtherMonth, date = null, record = null, stamp = null) {
    const cell = document.createElement('div');
    cell.className = 'day-cell';
    cell.textContent = day;

    if (isOtherMonth) {
      cell.classList.add('other-month');
    } else {
      // 오늘 표시
      if (date && Utils.isToday(date)) {
        cell.classList.add('today');
      }

      // 기록 상태에 따른 스타일
      if (record) {
        cell.classList.add('has-record');
        if (record.success === true) {
          cell.classList.add('success');
        } else if (record.success === false) {
          cell.classList.add('fail');
        }
      }

      // 도장 표시
      if (stamp) {
        const stampEl = document.createElement('span');
        stampEl.className = 'day-stamp';
        stampEl.textContent = stamp;
        cell.appendChild(stampEl);
      }

      // 클릭 이벤트
      if (date) {
        cell.addEventListener('click', () => {
          Modal.open(date);
        });
      }
    }

    return cell;
  }
};

// ============================================
// 모달 관리 모듈
// ============================================
const Modal = {
  currentDate: null,

  // 모달 초기화
  init() {
    this.bindEvents();
  },

  // 이벤트 바인딩
  bindEvents() {
    // 모달 닫기
    document.getElementById('modalClose').addEventListener('click', () => this.close());
    document.getElementById('modalOverlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.close();
    });

    // 금연 체크 버튼 (기록자만 사용)
    document.querySelectorAll('.check-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (!Auth.isRecorder()) return; // 기록자만 가능
        document.querySelectorAll('.check-btn').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
      });
    });

    // 저장 버튼 (기록자만 사용)
    document.getElementById('saveRecord').addEventListener('click', () => {
      if (!Auth.isRecorder()) return;
      this.saveRecord();
    });

    // 도장 버튼 (응원자만 사용)
    document.querySelectorAll('.stamp-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (!Auth.isSupporter()) return; // 응원자만 가능
        const stamp = e.currentTarget.dataset.stamp;
        this.applyStamp(stamp);
      });
    });

    // 응원 메시지 저장 (응원자만 사용)
    document.getElementById('saveCheer').addEventListener('click', () => {
      if (!Auth.isSupporter()) return;
      this.saveCheer();
    });
  },

  // 모달 열기
  open(date) {
    this.currentDate = date;
    const dateKey = Utils.getDateKey(date);

    // 날짜 표시 업데이트
    document.getElementById('modalDate').textContent = Utils.formatDate(date);

    // 기존 기록 로드
    const record = DataStore.getRecord(dateKey);
    const stamp = DataStore.getStamp(dateKey);

    // 폼 초기화
    this.resetForm();

    // 역할에 따라 UI 표시
    this.showRoleBasedUI();

    // 기존 데이터 채우기
    if (record) {
      if (record.success === true) {
        document.querySelector('.success-btn').classList.add('active');
      } else if (record.success === false) {
        document.querySelector('.fail-btn').classList.add('active');
      }
      document.getElementById('memoInput').value = record.memo || '';
    }

    // 파트너 모드 기록 표시
    this.updateRecordDisplay(record);

    // 현재 도장 표시
    this.updateStampDisplay(stamp);

    // 모달 표시
    document.getElementById('modalOverlay').classList.add('active');
  },

  // 역할에 따른 UI 표시
  showRoleBasedUI() {
    const userContent = document.getElementById('userModeContent');
    const partnerContent = document.getElementById('partnerModeContent');

    if (Auth.isRecorder()) {
      // 여자친구: 기록 UI만 표시
      userContent.classList.remove('hidden');
      partnerContent.classList.add('hidden');
    } else {
      // 명우: 응원 UI만 표시
      userContent.classList.add('hidden');
      partnerContent.classList.remove('hidden');
    }
  },

  // 모달 닫기
  close() {
    document.getElementById('modalOverlay').classList.remove('active');
    this.currentDate = null;
  },

  // 폼 초기화
  resetForm() {
    document.querySelectorAll('.check-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('memoInput').value = '';
    document.getElementById('cheerInput').value = '';
    document.querySelectorAll('.stamp-btn').forEach(b => b.classList.remove('active'));
  },

  // 기록 저장 (여자친구 전용)
  saveRecord() {
    if (!this.currentDate || !Auth.isRecorder()) return;

    const dateKey = Utils.getDateKey(this.currentDate);
    const successBtn = document.querySelector('.success-btn.active');
    const failBtn = document.querySelector('.fail-btn.active');
    const memo = document.getElementById('memoInput').value.trim();

    let success = null;
    if (successBtn) success = true;
    else if (failBtn) success = false;

    const record = {
      success,
      memo,
      recordedBy: Auth.getUser().name,
      updatedAt: new Date().toISOString()
    };

    DataStore.saveRecord(dateKey, record);

    // UI 업데이트
    Calendar.renderCalendar();
    App.updateStats();

    // 성공 애니메이션
    if (success === true) {
      this.showStampAnimation('✅');
    }

    this.close();
  },

  // 도장 적용 (명우 전용)
  applyStamp(stamp) {
    if (!this.currentDate || !Auth.isSupporter()) return;

    const dateKey = Utils.getDateKey(this.currentDate);
    DataStore.saveStamp(dateKey, stamp);

    // 버튼 활성화 표시
    document.querySelectorAll('.stamp-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.stamp === stamp);
    });

    // 도장 표시 업데이트
    this.updateStampDisplay(stamp);

    // 애니메이션
    this.showStampAnimation(stamp);

    // 캘린더 업데이트
    Calendar.renderCalendar();
  },

  // 응원 메시지 저장 (명우 전용)
  saveCheer() {
    if (!Auth.isSupporter()) return;

    const message = document.getElementById('cheerInput').value.trim();
    if (!message) return;

    DataStore.saveCheerMessage(message);
    document.getElementById('cheerInput').value = '';

    // 응원 배너 업데이트
    App.updateCheerBanner();

    // 애니메이션
    this.showStampAnimation('💌');
  },

  // 기록 표시 업데이트 (명우가 볼 때)
  updateRecordDisplay(record) {
    const statusEl = document.getElementById('recordStatus');
    const memoEl = document.getElementById('recordMemo');

    if (record) {
      if (record.success === true) {
        statusEl.innerHTML = '✅ <strong>금연 성공!</strong>';
      } else if (record.success === false) {
        statusEl.innerHTML = '😢 아쉽지만 다음엔 꼭!';
      } else {
        statusEl.textContent = '아직 기록이 없어요';
      }
      memoEl.textContent = record.memo ? `"${record.memo}"` : '';
    } else {
      statusEl.textContent = '아직 기록이 없어요';
      memoEl.textContent = '';
    }
  },

  // 현재 도장 표시
  updateStampDisplay(stamp) {
    const container = document.getElementById('currentStamp');
    if (stamp) {
      container.innerHTML = `<span class="stamp-display">${stamp}</span>`;
    } else {
      container.innerHTML = '';
    }
  },

  // 도장 애니메이션
  showStampAnimation(stamp) {
    const animEl = document.getElementById('stampAnimation');
    const bigStamp = document.getElementById('bigStamp');

    bigStamp.textContent = stamp;
    animEl.classList.add('active');

    setTimeout(() => {
      animEl.classList.remove('active');
    }, 700);
  }
};

// ============================================
// 시작일 설정 모달 모듈
// ============================================
const StartDateModal = {
  // 초기화
  init() {
    this.bindEvents();
  },

  // 이벤트 바인딩
  bindEvents() {
    // 시작일 편집 버튼
    document.getElementById('editStartDateBtn').addEventListener('click', () => this.open());

    // 모달 닫기
    document.getElementById('startDateModalClose').addEventListener('click', () => this.close());
    document.getElementById('startDateModalOverlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.close();
    });

    // 저장 버튼
    document.getElementById('saveStartDateBtn').addEventListener('click', () => this.save());

    // 초기화 버튼
    document.getElementById('clearStartDateBtn').addEventListener('click', () => this.clear());
  },

  // 모달 열기
  open() {
    const startDateData = DataStore.getStartDate();

    // 기존 데이터 채우기
    if (startDateData) {
      document.getElementById('startDateInput').value = startDateData.date;
      document.getElementById('motivationInput').value = startDateData.motivation || '';
    } else {
      // 기본값: 오늘
      document.getElementById('startDateInput').value = Utils.getDateKey(new Date());
      document.getElementById('motivationInput').value = '';
    }

    document.getElementById('startDateModalOverlay').classList.add('active');
  },

  // 모달 닫기
  close() {
    document.getElementById('startDateModalOverlay').classList.remove('active');
  },

  // 저장
  save() {
    const date = document.getElementById('startDateInput').value;
    const motivation = document.getElementById('motivationInput').value.trim();

    if (!date) {
      alert('시작일을 선택해주세요!');
      return;
    }

    DataStore.saveStartDate(date, motivation);
    App.updateStartDateDisplay();
    this.close();

    // 축하 애니메이션
    Modal.showStampAnimation('🌱');
  },

  // 초기화
  clear() {
    if (confirm('금연 시작일을 초기화하시겠어요?')) {
      DataStore.clearStartDate();
      App.updateStartDateDisplay();
      this.close();
    }
  }
};

// ============================================
// 앱 메인 모듈
// ============================================
const App = {
  // 앱 초기화
  async init() {
    // DataStore 초기화 (Firebase 연결)
    await DataStore.init();

    // 로그인 상태 확인
    if (Auth.init()) {
      // 이미 로그인됨
      this.showApp();
    } else {
      // 로그인 필요
      this.showLogin();
    }

    this.bindLoginEvents();

    // Firebase 연결 상태 표시
    this.showConnectionStatus();
  },

  // 연결 상태 표시
  showConnectionStatus() {
    const statusEl = document.getElementById('connectionStatus');
    const textEl = statusEl.querySelector('.status-text');

    if (isFirebaseReady) {
      statusEl.className = 'connection-status online';
      textEl.textContent = '실시간 동기화 중';
    } else {
      statusEl.className = 'connection-status offline';
      textEl.textContent = '오프라인 모드 (Firebase 설정 필요)';
    }
  },

  // 로그인 이벤트 바인딩
  bindLoginEvents() {
    document.getElementById('loginBtn').addEventListener('click', () => this.handleLogin());

    // 엔터키로 로그인
    document.getElementById('passwordInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleLogin();
    });

    // 로그아웃
    document.getElementById('logoutBtn').addEventListener('click', () => this.handleLogout());
  },

  // 로그인 처리
  handleLogin() {
    const username = document.getElementById('usernameInput').value;
    const password = document.getElementById('passwordInput').value;

    const result = Auth.login(username, password);

    if (result.success) {
      document.getElementById('loginError').classList.add('hidden');
      this.showApp();
    } else {
      const errorEl = document.getElementById('loginError');
      errorEl.textContent = result.error;
      errorEl.classList.remove('hidden');
    }
  },

  // 로그아웃 처리
  handleLogout() {
    Auth.logout();
    this.showLogin();

    // 폼 초기화
    document.getElementById('usernameInput').value = '';
    document.getElementById('passwordInput').value = '';
    document.getElementById('loginError').classList.add('hidden');
  },

  // 로그인 화면 표시
  showLogin() {
    document.getElementById('loginContainer').classList.remove('hidden');
    document.getElementById('appContainer').classList.add('hidden');
  },

  // 앱 화면 표시
  showApp() {
    document.getElementById('loginContainer').classList.add('hidden');
    document.getElementById('appContainer').classList.remove('hidden');

    // 사용자 정보 표시
    this.updateUserDisplay();

    // 앱 컴포넌트 초기화
    Calendar.init();
    Modal.init();
    StartDateModal.init();
    this.updateStartDateDisplay();
    this.updateStats();
    this.updateCheerBanner();
  },

  // 사용자 정보 표시 업데이트
  updateUserDisplay() {
    const user = Auth.getUser();
    if (!user) return;

    document.getElementById('userBadge').textContent = `${user.emoji} ${user.name}`;

    if (Auth.isRecorder()) {
      document.getElementById('userRole').textContent = '📝 기록 모드';
    } else {
      document.getElementById('userRole').textContent = '💌 응원 모드';
    }
  },

  // 금연 시작일 표시 업데이트
  updateStartDateDisplay() {
    const startDateData = DataStore.getStartDate();
    const valueEl = document.getElementById('startDateValue');
    const daysEl = document.getElementById('daysSinceStart');

    if (startDateData && startDateData.date) {
      // 시작일 표시
      const startDate = new Date(startDateData.date);
      const year = startDate.getFullYear();
      const month = startDate.getMonth() + 1;
      const day = startDate.getDate();
      valueEl.textContent = `${year}. ${month}. ${day}.`;

      // 경과 일수 계산
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      startDate.setHours(0, 0, 0, 0);
      const diffTime = today - startDate;
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1; // 시작일 포함
      daysEl.textContent = diffDays > 0 ? diffDays : 1;
    } else {
      valueEl.textContent = '설정해주세요';
      daysEl.textContent = '-';
    }
  },

  // 통계 업데이트
  updateStats() {
    const year = Calendar.currentDate.getFullYear();
    const month = Calendar.currentDate.getMonth();

    // 연속 금연 일수
    document.getElementById('currentStreak').textContent = Statistics.calculateCurrentStreak();

    // 최장 기록
    document.getElementById('bestStreak').textContent = Statistics.calculateBestStreak();

    // 총 금연일
    document.getElementById('totalDays').textContent = Statistics.calculateTotalDays();

    // 월별 성공률
    const progress = Statistics.calculateMonthlyProgress(year, month);
    document.getElementById('progressPercent').textContent = `${progress}%`;
    document.getElementById('progressFill').style.width = `${progress}%`;
  },

  // 응원 배너 업데이트
  updateCheerBanner() {
    const defaultMessages = [
      '오늘도 힘내요! 당신은 할 수 있어요 💪',
      '하루하루가 승리예요 ✨',
      '포기하지 않는 당신이 자랑스러워요 💕',
      '건강한 내일을 위해 오늘도 화이팅! 🌟',
      '함께라서 더 강해질 수 있어요 💑'
    ];

    let message = DataStore.getRandomCheer();

    if (!message) {
      // 기본 메시지에서 랜덤 선택
      message = defaultMessages[Math.floor(Math.random() * defaultMessages.length)];
    }

    document.getElementById('cheerMessage').textContent = message;
  }
};

// ============================================
// 앱 시작
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
