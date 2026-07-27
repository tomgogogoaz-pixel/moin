import { ANONYMOUS_NAV, AUTHENTICATED_NAV, DASHBOARD_SECTION_ORDER, selectRecentProjects } from './ui-model.js';

const app = document.querySelector('#app');

function createUploadState() {
  return {
    mode: 'reference',
    current: null,
    reference: null,
    material: null,
    targetObject: 'sofa',
    selection: { x: 24, y: 22, width: 52, height: 54 }
  };
}

const OBJECT_TARGETS = Object.freeze([
  Object.freeze({ id: 'sofa', label: '소파' }),
  Object.freeze({ id: 'table', label: '테이블' }),
  Object.freeze({ id: 'curtain', label: '커튼' }),
  Object.freeze({ id: 'wall', label: '벽' }),
  Object.freeze({ id: 'floor', label: '바닥' }),
  Object.freeze({ id: 'other', label: '기타 영역' })
]);

const state = {
  user: undefined,
  mobileMenu: false,
  uploadOpen: false,
  analyzing: false,
  upload: createUploadState(),
  materials: [],
  cart: [],
  projects: [],
  project: null,
  versionHistory: { projectId: null, versions: [], baselineVersionId: null, loading: false, error: null },
  versionModal: null,
  selectedProducts: new Set(),
  market: { category: 'all', query: '', maxPrice: 1800000 },
  dialog: null,
  focusReturnSelector: null
};

const money = new Intl.NumberFormat('ko-KR');
const protectedRoutes = ['/dashboard', '/projects', '/estimate', '/mypage', '/market', '/reports', '/notifications'];
const categoryLabels = { all: '전체', wallpaper: '벽지', flooring: '바닥재', tile: '타일', tools: '공구', paint: '페인트' };
const fallbackEstimate = {
  materialSubtotal: 1234000,
  toolSubtotal: 86000,
  laborSubtotal: 1200000,
  total: 2520000,
  savingsAmount: 2318400,
  items: [
    { section: '자재비', name: '벽지', quantity: '32롤', price: 320000 },
    { section: '자재비', name: '바닥재', quantity: '18㎡', price: 540000 },
    { section: '자재비', name: '타일', quantity: '28장', price: 374000 },
    { section: '공구 대여비', name: '롤러 세트', quantity: '1세트', price: 20000 },
    { section: '공구 대여비', name: '커터', quantity: '1개', price: 6000 },
    { section: '공구 대여비', name: '기타 공구', quantity: '-', price: 60000 },
    { section: '표준 인건비', name: '도배 + 바닥 + 타일 시공', quantity: '1식', price: 1200000 }
  ]
};

function resetUserState() {
  state.uploadOpen = false;
  state.analyzing = false;
  state.upload = createUploadState();
  state.cart = [];
  state.projects = [];
  state.project = null;
  state.versionHistory = { projectId: null, versions: [], baselineVersionId: null, loading: false, error: null };
  state.versionModal = null;
  state.selectedProducts.clear();
  state.market = { category: 'all', query: '', maxPrice: 1800000 };
  state.dialog = null;
  state.focusReturnSelector = null;
  state.mobileMenu = false;
}

function escapeHtml(value = '') {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '\x22': '&quot;' };
  return String(value).replace(/[&<>'\x22]/g, (character) => map[character]);
}

function icon(name, className = '') {
  const common = `class='${className}' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'`;
  const paths = {
    home: `<path d='m3 10 9-7 9 7'/><path d='M5 9v11h14V9'/><path d='M9 20v-6h6v6'/>`,
    bell: `<path d='M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9'/><path d='M10 21h4'/>`,
    menu: `<path d='M4 6h16M4 12h16M4 18h16'/>`,
    user: `<circle cx='12' cy='8' r='4'/><path d='M4 21a8 8 0 0 1 16 0'/>`,
    folder: `<path d='M3 6h6l2 2h10v11H3z'/>`,
    receipt: `<path d='M6 3h12v18l-3-2-3 2-3-2-3 2z'/><path d='M9 8h6M9 12h6'/>`,
    arrow: `<path d='M5 12h14M14 7l5 5-5 5'/>`,
    upload: `<path d='M12 16V4m0 0L7 9m5-5 5 5'/><path d='M5 14v6h14v-6'/>`,
    image: `<rect x='3' y='4' width='18' height='16' rx='2'/><circle cx='16' cy='9' r='1.5'/><path d='m4 17 5-5 4 4 2-2 5 4'/>`,
    download: `<path d='M12 3v12m0 0 5-5m-5 5-5-5'/><path d='M4 18v3h16v-3'/>`,
    save: `<path d='M5 3h12l2 2v16H5z'/><path d='M8 3v6h8V3M8 21v-7h8v7'/>`,
    search: `<circle cx='11' cy='11' r='7'/><path d='m20 20-4-4'/>`,
    cart: `<path d='M3 4h2l2 11h10l3-8H6'/><circle cx='9' cy='20' r='1'/><circle cx='17' cy='20' r='1'/>`,
    lock: `<rect x='5' y='10' width='14' height='11' rx='2'/><path d='M8 10V7a4 4 0 0 1 8 0v3'/>`,
    mail: `<rect x='3' y='5' width='18' height='14' rx='2'/><path d='m3 7 9 6 9-6'/>`,
    eye: `<path d='M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12'/><circle cx='12' cy='12' r='2.5'/>`,
    close: `<path d='m5 5 14 14M19 5 5 19'/>`,
    shield: `<path d='M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6z'/><path d='M9 12h6M12 9v6'/>`,
    check: `<path d='m5 12 4 4L19 6'/>`,
    back: `<path d='m15 18-6-6 6-6'/>`,
    bulb: `<path d='M9 18h6M10 22h4'/><path d='M8.5 15.5A6 6 0 1 1 15.5 15.5c-.9.7-1.5 1.4-1.5 2.5h-4c0-1.1-.6-1.8-1.5-2.5Z'/><path d='M12 1V0M4.2 4.2 2.8 2.8M19.8 4.2l1.4-1.4M2 11H0M24 11h-2'/>`,
    refresh: `<path d='M20 7V3l-3 3a8 8 0 1 0 2 8'/><path d='M20 3h-4'/>`,
    logout: `<path d='M10 4H5v16h5M14 8l4 4-4 4M18 12H9'/>`
  };
  return `<svg ${common}>${paths[name] || ''}</svg>`;
}

function houseLogo(compact = false) {
  return `<a class='app-logo' href='/dashboard' data-link aria-label='Moin 홈'>
    <svg viewBox='0 0 54 54' fill='none' aria-hidden='true'><circle class='dot' cx='9' cy='7' r='3' fill='#A86030' fill-opacity='.6'/><path d='m7 22 20-14 20 14M12 19v27h30V19M22 46V31h11v15' stroke='currentColor' stroke-width='2'/></svg>
    <span${compact ? ` style='font-size:24px'` : ''}>Moin</span>
  </a>`;
}

function brandLogo() {
  return `<span class='wordmark compact'><span class='brand-mark' aria-hidden='true'></span><span>Moin</span></span>`;
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers || {}) }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error?.message || '요청을 처리하지 못했습니다.');
    error.status = response.status;
    error.details = payload.error;
    throw error;
  }
  return payload.data;
}

function notify(message) {
  let region = document.querySelector('.toast-region');
  if (!region) {
    region = document.createElement('div');
    region.className = 'toast-region';
    region.setAttribute('role', 'status');
    document.body.append(region);
  }
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  region.append(toast);
  setTimeout(() => toast.remove(), 2800);
}

function rememberFocus(button) {
  if (!button?.dataset?.action) return;
  const id = button.dataset.id ? `[data-id="${button.dataset.id}"]` : '';
  state.focusReturnSelector = `[data-action="${button.dataset.action}"]${id}`;
}

function restoreFocus() {
  const selector = state.focusReturnSelector;
  state.focusReturnSelector = null;
  if (!selector) return;
  requestAnimationFrame(() => {
    const target = [...document.querySelectorAll(selector)].find((element) => element.offsetParent !== null);
    target?.focus();
  });
}

function setDocument(title, bodyClass = '') {
  document.title = `${title} | Moin`;
  document.body.className = bodyClass;
}

function navigate(path, { replace = false } = {}) {
  const target = new URL(path, location.origin);
  if (target.origin !== location.origin) return;
  const targetPath = `${target.pathname}${target.search}${target.hash}`;
  const currentPath = `${location.pathname}${location.search}${location.hash}`;
  if (replace) history.replaceState({ ...(history.state || {}), moin: true }, '', targetPath);
  else if (targetPath !== currentPath) history.pushState({ moin: true, moinFrom: currentPath }, '', targetPath);
  state.mobileMenu = false;
  state.uploadOpen = false;
  state.dialog = null;
  state.versionModal = null;
  document.body.classList.remove('modal-open');
  window.scrollTo({ top: 0 });
  renderRoute();
}

function isProtected(pathname) {
  return protectedRoutes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function notificationCenterLink() {
  const notifications = buildNotifications();
  const unread = hasUnreadNotifications(notifications);
  const label = unread ? `읽지 않은 알림 ${notifications.length}개, 알림 센터` : '알림 센터';
  return `<a class='icon-button notification-link ${unread ? 'notification-dot' : ''}' href='/notifications' data-link aria-label='${label}' title='알림 센터' ${location.pathname === '/notifications' ? "aria-current='page'" : ''}>${icon('bell', 'house-mark')}</a>`;
}

function desktopHeader(active = 'myproject') {
  return `<header class='app-header'><div class='app-header-inner'>
    ${houseLogo()}
    <div style='display:flex;align-items:center'>
      <nav class='app-nav' aria-label='주 메뉴'>${AUTHENTICATED_NAV.map(({ href, key, label }) => `<a href='${href}' data-link class='${active === key ? 'active' : ''}' ${active === key ? `aria-current='page'` : ''}>${label}</a>`).join('')}</nav>
      <div class='app-actions'>${notificationCenterLink()}<a class='avatar avatar-link' href='/mypage' data-link aria-label='마이페이지로 이동' title='마이페이지'>${escapeHtml((state.user?.name || 'M').slice(0,1))}</a></div>
    </div>
  </div></header>`;
}

function mobileHeader({ back = false, house = false, profile = false } = {}) {
  const brand = back
    ? `<span class='mobile-back-brand'><button class='icon-button' data-action='back' aria-label='뒤로가기'>${icon('back', 'house-mark')}</button><span class='wordmark compact'>Moin</span></span>`
    : house
      ? `<a class='mobile-house-brand' href='/dashboard' data-link>${icon('home', 'house-mark')}<span>Moin</span></a>`
      : `<a class='wordmark compact' href='/dashboard' data-link>Moin</a>`;
  const avatar = `<a class='avatar avatar-link' href='/mypage' data-link aria-label='마이페이지로 이동' title='마이페이지'>${escapeHtml((state.user?.name || 'M').slice(0,1))}</a>`;
  const menu = profile ? '' : `<button class='icon-button' data-action='mobile-app-menu' aria-label='메뉴' aria-expanded='${state.mobileMenu}'>${icon('menu', 'house-mark')}</button>`;
  return `<header class='mobile-app-header'>${brand}<div class='mobile-app-actions'>${notificationCenterLink()}${avatar}${menu}</div></header>${state.mobileMenu && !profile ? `<nav class='mobile-app-menu' aria-label='모바일 메뉴'><a href='/dashboard' data-link>홈</a><a href='/projects' data-link>내 프로젝트</a><a href='/estimate' data-link>견적서</a><a href='/notifications' data-link>알림</a><a href='/mypage' data-link>마이페이지</a></nav>` : ''}`;
}

function bottomNav(active = 'home') {
  const links = [
    ['/dashboard', 'home', 'home', '홈'],
    ['/projects', 'projects', 'folder', '내 프로젝트'],
    ['/estimate', 'estimate', 'receipt', '견적서'],
    ['/mypage', 'mypage', 'user', '마이페이지']
  ];
  return `<nav class='mobile-bottom-nav' aria-label='하단 메뉴'>${links.map(([href,key,iconName,label]) => `<a href='${href}' data-link class='${active === key ? 'active' : ''}'><span class='nav-icon'>${icon(iconName, 'bottom-icon')}</span><span>${label}</span></a>`).join('')}</nav>`;
}

function appBackButton() {
  return `<button class='page-back-button' type='button' data-action='back'>${icon('back', 'tool-drawing')}<span>이전 화면</span></button>`;
}

function serviceCards({ signedIn = false } = {}) {
  const analysisCard = signedIn
    ? `<button type='button' class='feature-card' id='how' data-action='open-upload' aria-label='AI 공간 분석 시작'>${icon('image', 'feature-icon tool-drawing')}<h3>AI 공간 분석</h3><p>현재 공간과 원하는 이미지를 바탕으로 최적의 조합을 제안합니다.</p></button>`
    : `<a class='feature-card' id='how' href='/dashboard' data-link aria-label='AI 공간 분석으로 이동'><span class='feature-icon' aria-hidden='true'>✦</span><h3>AI 공간 분석</h3><p>현재 공간과 원하는 이미지를 바탕으로 최적의 조합을 제안합니다.</p></a>`;
  return `<div class='feature-grid'>
    ${analysisCard}
    <a class='feature-card' id='price' href='/estimate' data-link aria-label='투명한 견적으로 이동'><span class='feature-icon' aria-hidden='true'>▤</span><h3>투명한 견적</h3><p>자재비, 공구비, 인건비를 한눈에 확인하세요.</p></a>
    <a class='feature-card' id='review' href='/projects' data-link aria-label='나의 리포트로 이동'><span class='feature-icon' aria-hidden='true'>⌂</span><h3>나의 리포트</h3><p>프로젝트와 변화 과정을 언제든 다시 살펴볼 수 있어요.</p></a>
  </div>`;
}

function serviceSection({ signedIn = false } = {}) {
  return `<section class='landing-section' id='service'><div class='landing-section-inner'>
    <div class='landing-section-heading'><span class='landing-eyebrow'>Moin service</span><h2>공간의 모든 선택을<br>더 쉽고 투명하게.</h2><p>공간 분석부터 견적, 변화의 기록까지 필요한 흐름을 한곳에서 자연스럽게 이어보세요.</p></div>
    ${serviceCards({ signedIn })}
  </div></section>`;
}

function mainHeroVideo() {
  return `<video class='hero-video' autoplay muted loop playsinline preload='metadata' poster='/assets/generated/landing-sketch.webp' aria-hidden='true' tabindex='-1' disablepictureinpicture><source src='/assets/video/moin-main.mp4' type='video/mp4'></video>`;
}

function renderLanding() {
  setDocument('투명한 공간의 기록', '');
  const publicNavigation = ANONYMOUS_NAV.map(({ href, key, label }) => `<a href='${href}' data-link class='${key === 'login' ? 'button' : ''}' ${key === 'home' ? `aria-current='page'` : ''}>${label}</a>`).join('');
  const mobilePublicNavigation = ANONYMOUS_NAV.map(({ href, key, label }) => `<a href='${href}' data-link ${key === 'home' ? `aria-current='page'` : ''}>${label}${key === 'login' ? ' →' : ''}</a>`).join('');
  return `<main class='landing-page'>
    <header class='landing-header'><div class='landing-header-inner'>
      <a class='wordmark' href='/' data-link>Moin</a>
      <nav class='landing-nav' aria-label='주 메뉴'>${publicNavigation}</nav>
      <button class='icon-button mobile-menu-button' data-action='toggle-mobile-menu' aria-expanded='${state.mobileMenu}' aria-label='메뉴'>${icon('menu', 'house-mark')}</button>
    </div></header>
    ${state.mobileMenu ? `<nav class='mobile-menu' aria-label='모바일 주 메뉴'>${mobilePublicNavigation}</nav>` : ''}
    <section class='landing-hero' aria-labelledby='hero-title'>
      ${mainHeroVideo()}
      <div class='hero-copy'><h1 id='hero-title'><span class='hero-title-kicker'>사진 두 장에서 시작되는</span><span class='hero-title-main'>솔직하고 투명한<br>공간의 기록</span></h1><button type='button' class='button hero-cta' data-action='start' aria-label='무료 체험 시작하기'><span class='hero-cta-copy'><span class='hero-cta-title'>Start</span><span class='hero-cta-subtitle'>무료 체험 시작하기</span></span><span class='hero-cta-arrow' aria-hidden='true'>→</span></button></div>
    </section>
    ${serviceSection()}
  </main>`;
}

function authVisual() {
  return `<section class='auth-visual'><div class='auth-visual-copy'><h1>사진 2장으로 마주하는<br>투명한 공간의 기록</h1><p>공간의 변화, 자재와 시공의 모든 과정을<br>더 쉽고 투명하게 기록하고 관리하세요.</p></div>
    <div class='auth-benefits'><div class='auth-benefit'><span>▣</span><strong>사진 2장만으로</strong><span>공간 기록 시작</span></div><div class='auth-benefit'><span>♢</span><strong>투명한 정보 관리</strong><span>신뢰할 수 있는 기록</span></div><div class='auth-benefit'><span>▥</span><strong>AI 추천으로</strong><span>최적의 선택</span></div></div>
  </section>`;
}

function authTrust() {
  const items = [['shield','안전한 데이터 보호','최신 보안 시스템 적용'],['user','전문가와 함께','신뢰할 수 있는 매칭'],['home','언제 어디서나','모든 기기에서 사용 가능'],['refresh','지속적인 업데이트','더 나은 서비스 제공']];
  return `<div class='auth-trust'>${items.map(([iconName,title,body]) => `<div class='trust-item'><span class='trust-icon'>${icon(iconName, 'trust-svg')}</span><div><strong>${title}</strong><span>${body}</span></div></div>`).join('')}</div>`;
}

function renderLogin() {
  setDocument('로그인', '');
  return `<main class='auth-page'><div class='auth-shell'>${authVisual()}<section class='auth-form-panel'>
    <button class='auth-language' type='button'>한국어⌄</button><a class='auth-brand' href='/' data-link>${brandLogo()}</a>
    <h2>환영합니다!</h2><p class='auth-subtitle'>Moin에 로그인하고<br>나만의 공간 기록을 시작하세요.</p>
    <form id='login-form' class='stack' novalidate>
      <div class='input-wrap'><span class='input-icon'>${icon('mail', 'tool-drawing')}</span><input name='email' type='email' maxlength='254' autocomplete='email' placeholder='이메일 주소' required></div>
      <div class='input-wrap'><span class='input-icon'>${icon('lock', 'tool-drawing')}</span><input id='login-password' name='password' type='password' maxlength='128' autocomplete='current-password' placeholder='비밀번호' required><button class='password-toggle' type='button' data-action='toggle-password' data-target='login-password' aria-label='비밀번호 보기'>${icon('eye', 'tool-drawing')}</button></div>
      <div class='auth-utilities'><label class='check-label'><input type='checkbox' name='remember'> 로그인 상태 유지</label><button class='button ghost' type='button' data-action='forgot' style='min-height:auto;padding:0;font-weight:500'>비밀번호 찾기</button></div>
      <div id='auth-error' class='auth-error' role='alert'></div><button class='button primary auth-submit' type='submit'>로그인</button>
    </form>
    <div class='divider'>또는</div><div class='social-list'>
      <button class='social-button' data-action='social' data-provider='Google'><span class='social-logo'>G</span>Google로 로그인</button>
      <button class='social-button kakao' data-action='social' data-provider='카카오'><span class='social-logo'>●</span>카카오로 로그인</button>
      <button class='social-button' data-action='social' data-provider='Apple'><span class='social-logo'>●</span>Apple로 로그인</button>
    </div>
    <p class='auth-switch'>계정이 없으신가요?<a href='/signup' data-link>회원가입</a></p><p class='auth-switch' style='margin-top:12px'><button class='button ghost mint' data-action='demo-login' style='min-height:auto;padding:0;font-size:12px'>테스트 계정으로 둘러보기</button></p>
  </section></div>${authTrust()}</main>`;
}

function renderSignup() {
  setDocument('회원가입', '');
  return `<main class='auth-page'><div class='auth-shell'>${authVisual()}<section class='auth-form-panel' style='padding-top:25px'>
    <button class='auth-language' type='button'>한국어⌄</button><a class='auth-brand' href='/' data-link style='margin-bottom:18px'>${brandLogo()}</a>
    <h2>회원가입</h2><p class='auth-subtitle' style='margin-bottom:18px'>간단한 정보로 나만의 공간 기록을 시작하세요.</p>
    <form id='signup-form' class='stack' novalidate>
      <div class='field'><label for='signup-name'>이름</label><input id='signup-name' name='name' maxlength='60' autocomplete='name' placeholder='이름을 입력해주세요' required></div>
      <div class='field'><label for='signup-email'>이메일</label><input id='signup-email' name='email' type='email' maxlength='254' autocomplete='email' placeholder='이메일 주소' required></div>
      <div class='field'><label for='signup-password'>비밀번호</label><input id='signup-password' name='password' type='password' minlength='8' maxlength='128' autocomplete='new-password' placeholder='8자 이상 입력해주세요' required></div>
      <div class='field'><label for='signup-confirm'>비밀번호 확인</label><input id='signup-confirm' name='confirm' type='password' minlength='8' maxlength='128' autocomplete='new-password' placeholder='비밀번호를 다시 입력해주세요' required></div>
      <div class='terms-box'><label class='check-label all'><input id='all-terms' type='checkbox'> 약관 전체 동의</label><label class='check-label'><input name='terms' type='checkbox' required> (필수) 서비스 이용약관 동의</label><label class='check-label'><input name='privacy' type='checkbox' required> (필수) 개인정보 처리방침 동의</label><label class='check-label'><input name='marketing' type='checkbox'> (선택) 혜택 알림 수신 동의</label></div>
      <div id='auth-error' class='auth-error' role='alert'></div><button class='button primary auth-submit' type='submit'>회원가입 완료</button>
    </form><p class='auth-switch' style='margin-top:14px'>이미 계정이 있으신가요?<a href='/login' data-link>로그인하기</a></p>
  </section></div></main>`;
}

const dashboardMaterials = [
  ['wallpaper.webp','벽지','32종'],['tile.webp','타일','28종'],['flooring.webp','바닥재','18종'],['paint.webp','페인트','24종'],['flooring.webp','몰딩/마감재','16종']
];
const dashboardTools = [['roller','롤러','8종'],['cutter','커터','6종'],['measure','줄자','5종'],['scraper','헤라','7종'],['drill','전동 드릴','4종']];

function toolDrawing(kind) {
  const drawings = {
    roller: `<path d='M3 7h12v5H3zM15 9h3v4h-5v8M13 21h-3v-8h3'/><path d='M6 7V4h10v3'/>`,
    cutter: `<path d='m5 19 13-13 2 2-13 13H4v-3zM14 8l2 2M7 17l2 2'/>`,
    measure: `<circle cx='11' cy='11' r='7'/><path d='M6 17 3 21h15l-2-4M9 8h4v4H9z'/>`,
    scraper: `<path d='m6 21 7-11 5 3-7 10M13 10l3-6 4 2-2 7'/>`,
    drill: `<path d='M3 7h13v7H9v7H5v-7H3zM16 9h5v3h-5M9 14l3 4H9'/>`
  };
  return `<svg class='tool-drawing' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round' aria-hidden='true'>${drawings[kind]}</svg>`;
}

function projectStatusLabel(project) {
  if (project.status === 'failed') return '분석 실패';
  if (project.status === 'saved') return '저장됨';
  if (project.status === 'analyzing') return '분석 중';
  return 'AI 분석 완료';
}

function projectUpdatedLabel(project) {
  const date = new Date(project.updatedAt || project.createdAt || '');
  return Number.isNaN(date.getTime()) ? '날짜 미정' : date.toLocaleDateString('ko-KR');
}

function buildNotifications() {
  const projects = Array.isArray(state.projects) ? [...state.projects] : [];
  if (state.project?.id && !projects.some((project) => project.id === state.project.id)) projects.push(state.project);
  const recentProjects = selectRecentProjects(projects);
  const latest = recentProjects[0];

  if (!latest) {
    return [
      { id: 'first-project', type: 'start', title: '첫 공간 기록을 시작해보세요', body: '현재 공간과 원하는 분위기 사진 두 장이면 AI 분석을 시작할 수 있어요.', meta: '다음 단계', href: '/dashboard', action: '프로젝트 시작' },
      { id: 'estimate-guide', type: 'estimate', title: '견적서는 프로젝트와 함께 준비돼요', body: '공간을 분석한 뒤 자재비와 시공비를 항목별로 확인할 수 있어요.', meta: '이용 안내', href: '/estimate', action: '견적서 보기' }
    ];
  }

  const latestStamp = latest.updatedAt || latest.createdAt || '';
  const projectHref = latest.status === 'failed' || latest.status === 'analyzing'
    ? '/projects'
    : `/reports/${encodeURIComponent(latest.id)}`;
  const notifications = [];

  if (latest.status === 'analyzing') {
    notifications.push({ id: `analysis-${latest.id}-${latestStamp}`, type: 'project', title: 'AI 공간 분석이 진행 중이에요', body: `“${latest.title}”의 결과를 준비하고 있습니다. 완료 후 결과 리포트를 확인해보세요.`, meta: projectUpdatedLabel(latest), href: projectHref, action: '프로젝트 보기' });
  } else if (latest.status === 'failed') {
    notifications.push({ id: `retry-${latest.id}-${latestStamp}`, type: 'start', title: '공간 분석을 다시 시작해보세요', body: `“${latest.title}”의 분석을 완료하지 못했습니다. 사진을 확인한 뒤 다시 시도할 수 있어요.`, meta: projectUpdatedLabel(latest), href: '/dashboard', action: '다시 시작' });
  } else {
    notifications.push({ id: `report-${latest.id}-${latestStamp}`, type: 'report', title: '새 공간 리포트가 준비됐어요', body: `“${latest.title}”의 시뮬레이션 결과와 분석 내용을 확인해보세요.`, meta: projectUpdatedLabel(latest), href: projectHref, action: '리포트 보기' });
    notifications.push({ id: `estimate-${latest.id}-${latestStamp}`, type: 'estimate', title: '다음 단계: 예상 견적을 확인해보세요', body: '선택한 공간을 기준으로 자재비·공구비·표준 시공비를 한눈에 살펴볼 수 있어요.', meta: '다음 단계', href: '/estimate', action: '견적서 보기' });
  }

  const previous = recentProjects[1];
  if (previous) {
    const href = previous.status === 'failed' || previous.status === 'analyzing' ? '/projects' : `/reports/${encodeURIComponent(previous.id)}`;
    notifications.push({ id: `recent-${previous.id}-${previous.updatedAt || previous.createdAt || ''}`, type: 'project', title: `최근 프로젝트: ${previous.title}`, body: `${projectStatusLabel(previous)} 상태의 공간 기록을 다시 확인할 수 있어요.`, meta: projectUpdatedLabel(previous), href, action: '프로젝트 보기' });
  }

  return notifications.slice(0, 3);
}

function notificationStorageKey() {
  return `moin.notifications.seen.${String(state.user?.id || state.user?.email || 'guest')}`;
}

function notificationSignature(notifications = buildNotifications()) {
  return notifications.map((notification) => notification.id).join('|') || 'empty';
}

function hasUnreadNotifications(notifications = buildNotifications()) {
  try { return window.localStorage.getItem(notificationStorageKey()) !== notificationSignature(notifications); }
  catch { return true; }
}

function markNotificationsRead(notifications = buildNotifications()) {
  try { window.localStorage.setItem(notificationStorageKey(), notificationSignature(notifications)); }
  catch { /* Notifications remain visually unread when browser storage is unavailable. */ }
}

function notificationIcon(type) {
  if (type === 'report') return 'image';
  if (type === 'estimate') return 'receipt';
  if (type === 'project') return 'folder';
  return 'bell';
}

function projectCard(project, { compact = false } = {}) {
  const failed = project.status === 'failed';
  const analyzing = project.status === 'analyzing';
  const imageUrl = project.afterUrl || project.beforeUrl || '/assets/generated/room-before.webp';
  const action = failed
    ? `<button class='button soft' data-action='retry-project'>다시 분석하기 →</button>`
    : analyzing
      ? `<span class='button soft' aria-disabled='true'>분석 중</span>`
      : `<a class='button soft' href='/reports/${encodeURIComponent(project.id)}' data-link>리포트 보기 →</a>`;
  const deleteAction = analyzing
    ? ''
    : `<button class='button project-delete-button' data-action='ask-delete-project' data-id='${escapeHtml(project.id)}' aria-label='${escapeHtml(project.title)} 삭제'>삭제</button>`;
  const actions = deleteAction ? `<div class='project-card-actions'>${action}${deleteAction}</div>` : action;
  return `<article class='project-card ${compact ? 'dashboard-project-card' : ''} ${failed ? 'failed' : ''}'>
    <img src='${imageUrl}' alt='${escapeHtml(project.title)}' loading='lazy'>
    <div class='project-card-body'><span class='pill'>${projectStatusLabel(project)}</span><h2>${escapeHtml(project.title)}</h2><p class='muted'>${projectUpdatedLabel(project)}</p>${actions}</div>
  </article>`;
}

function dashboardContent() {
  const materialCards = dashboardMaterials.map(([image,name,count]) => `<button class='mini-card' data-action='go-market'><span class='mini-visual'><img src='/assets/materials/${image}' alt='${name}'></span><strong>${name}</strong><span>${count}</span></button>`).join('');
  const toolCards = dashboardTools.map(([kind,name,count]) => `<button class='mini-card' data-action='go-market'><span class='mini-visual'>${toolDrawing(kind)}</span><strong>${name}</strong><span>${count}</span></button>`).join('');
  const recentProjects = selectRecentProjects(state.projects);
  const recentContent = recentProjects.length
    ? `<div class='dashboard-recent-grid'>${recentProjects.map((project) => projectCard(project, { compact: true })).join('')}</div>`
    : `<div class='dashboard-empty'><span class='empty-state-icon'>⌂</span><div><h3>아직 시작한 프로젝트가 없어요.</h3><p>사진 두 장으로 첫 공간 기록을 만들어보세요.</p></div><button class='button soft' data-action='new-project'>첫 프로젝트 시작</button></div>`;
  const recommendation = state.project?.analysis?.summary || '현재 공간과 원하는 분위기를 비교해 어울리는 자재·공구 조합을 제안해드려요.';
  const sections = {
    welcome: `<section class='dashboard-welcome' data-dashboard-section='welcome'><span class='dashboard-kicker'>Moin Home</span><h1>안녕하세요, ${escapeHtml(state.user?.name || 'Moin')}님!</h1><p>오늘도 나다운 공간을 차근차근 만들어볼까요?</p></section>`,
    'new-project': `<section class='dashboard-start-card' data-dashboard-section='new-project'><div><span class='dashboard-kicker'>New project</span><h2>새로운 공간 기록을 시작하세요.</h2><p>현재 공간과 원하는 공간, 사진 두 장이면 충분해요.</p></div><button class='button primary dashboard-start-button' data-action='new-project'>새 프로젝트 시작 ${icon('arrow','tool-drawing')}</button></section>`,
    'recent-projects': `<section class='dashboard-section dashboard-recent' data-dashboard-section='recent-projects'><div class='dashboard-section-heading'><div><span class='dashboard-kicker'>Recent</span><h2>최근 프로젝트</h2><p>최근 작업한 프로젝트를 최대 3개까지 보여드려요.</p></div><a class='button ghost view-all' href='/projects' data-link>전체 보기 ${icon('arrow','tool-drawing')}</a></div>${recentContent}</section>`,
    ai: `<section class='dashboard-section' data-dashboard-section='ai'><button class='ai-banner' data-action='open-upload'><span class='sparkle'>✦</span><span class='ai-banner-copy'><span class='dashboard-kicker'>AI recommendation</span><h2>AI 추천 카드</h2><p>${escapeHtml(recommendation)}</p></span><span class='round-arrow'>→</span></button></section>`,
    materials: `<section class='info-panel dashboard-info-section' data-dashboard-section='materials'><div class='panel-heading'><div><span class='dashboard-kicker'>Materials</span><h2>필수 자재 정보</h2><p>공간에 필요한 자재를 한눈에 확인하세요.</p></div><button class='button ghost view-all' data-action='go-market'>전체 보기 ${icon('arrow','tool-drawing')}</button></div><div class='mini-grid'>${materialCards}</div></section>`,
    tools: `<section class='info-panel dashboard-info-section' data-dashboard-section='tools'><div class='panel-heading'><div><span class='dashboard-kicker'>Tools</span><h2>필수 공구 정보</h2><p>필수 공구 목록과 사용 가이드를 확인하세요.</p></div><button class='button ghost view-all' data-action='go-market'>전체 보기 ${icon('arrow','tool-drawing')}</button></div><div class='mini-grid'>${toolCards}</div></section>`
  };
  return `<div class='dashboard-home' data-dashboard-order='${DASHBOARD_SECTION_ORDER.join(' ')}'>${DASHBOARD_SECTION_ORDER.map((section) => sections[section]).join('')}</div>`;
}

function uploadZone(key, title, subtitle) {
  const file = state.upload[key];
  return `<label class='drop-zone' data-drop='${key}'>
    <input type='file' data-upload='${key}' accept='image/png,image/jpeg,image/webp' aria-label='${title}'>
    ${file ? `<span class='upload-preview'><img src='${file.dataUrl}' alt='${title} 미리보기'></span>` : `<span class='upload-empty'><span class='upload-icon'>${icon('image','tool-drawing')}</span><strong>${title}</strong><span>${subtitle}</span></span>`}
  </label>`;
}

function objectTargetLabel(targetObject) {
  return OBJECT_TARGETS.find((target) => target.id === targetObject)?.label || '기타 영역';
}

function objectSelectionPanel() {
  const current = state.upload.current;
  const selection = clampObjectSelection(state.upload.selection);
  const targetObject = state.upload.targetObject;
  const selectionMarkup = current
    ? `<div class='object-selection-stage' data-object-selection-stage style='--selection-x:${selection.x}%;--selection-y:${selection.y}%;--selection-width:${selection.width}%;--selection-height:${selection.height}%'>
        <img src='${current.dataUrl}' alt='현재 공간 사진. 선택한 ${objectTargetLabel(targetObject)} 영역을 사각형으로 조정할 수 있습니다.' data-object-selection-image>
        <div class='object-selection-box' data-selection-box aria-hidden='true'>
          <span class='object-selection-label' data-object-selection-label>${objectTargetLabel(targetObject)}</span>
          <span class='object-selection-handle handle-nw' data-selection-handle='nw'></span>
          <span class='object-selection-handle handle-ne' data-selection-handle='ne'></span>
          <span class='object-selection-handle handle-sw' data-selection-handle='sw'></span>
          <span class='object-selection-handle handle-se' data-selection-handle='se'></span>
        </div>
      </div>
      <p class='object-selection-help'>사각형 안을 드래그해 옮기고, 모서리를 드래그해 크기를 조정하세요.</p>
      <div class='object-selection-controls' aria-label='선택 영역 키보드 조정'>
        ${objectSelectionRange('x', '가로 위치', selection.x, 100 - selection.width)}
        ${objectSelectionRange('y', '세로 위치', selection.y, 100 - selection.height)}
        ${objectSelectionRange('width', '가로 크기', selection.width, 100 - selection.x)}
        ${objectSelectionRange('height', '세로 크기', selection.height, 100 - selection.y)}
      </div>
      <output class='object-selection-output' data-object-selection-output aria-live='polite'>선택 영역: 왼쪽 ${Math.round(selection.x)}%, 위 ${Math.round(selection.y)}%, 가로 ${Math.round(selection.width)}%, 세로 ${Math.round(selection.height)}%</output>`
    : `<p class='object-selection-empty'>먼저 공간 사진을 업로드하면 바꿀 영역을 직접 지정할 수 있어요.</p>`;

  return `<section class='object-mode-panel' data-object-selection-root aria-labelledby='object-selection-title'>
    <div class='object-mode-heading'><h3 id='object-selection-title'>바꿀 대상과 영역을 지정하세요</h3><p>선택 영역 안에만 자재의 색상과 재질을 적용합니다.</p></div>
    <fieldset class='object-target-fieldset'><legend>바꿀 대상</legend><div class='object-target-options'>${OBJECT_TARGETS.map((target) => `<label class='object-target-option'><input type='radio' name='object-target' value='${target.id}' data-object-target ${target.id === targetObject ? 'checked' : ''}><span>${target.label}</span></label>`).join('')}</div></fieldset>
    ${selectionMarkup}
  </section>`;
}

function objectSelectionRange(field, label, value, max) {
  const minimum = field === 'width' || field === 'height' ? 8 : 0;
  const limit = Math.max(minimum, Math.round(max));
  return `<label class='object-selection-control'><span>${label}</span><input type='range' min='${minimum}' max='${limit}' step='1' value='${Math.min(Math.max(Math.round(value), minimum), limit)}' data-object-selection-field='${field}' aria-valuetext='${Math.round(value)}%'><b data-object-selection-value='${field}'>${Math.round(value)}%</b></label>`;
}

function uploadModal() {
  if (!state.uploadOpen) return '';
  const objectMode = state.upload.mode === 'object';
  const ready = objectMode
    ? Boolean(state.upload.current && state.upload.material)
    : Boolean(state.upload.current && state.upload.reference);
  const action = objectMode ? 'object-material-analyze' : 'analyze';
  const buttonText = state.analyzing
    ? `<span class='spinner'></span> AI가 공간을 분석하고 있어요`
    : objectMode ? '선택 영역에 자재 적용하기' : 'AI 분석 시작';
  return `<div class='modal-backdrop' data-action='backdrop-close'><section class='upload-modal' role='dialog' aria-modal='true' aria-labelledby='upload-title' data-modal>
    <div class='modal-handle'></div><button class='icon-button modal-close' data-action='close-upload' aria-label='닫기'>${icon('close','tool-drawing')}</button><h2 id='upload-title'>공간 이미지 업로드</h2>
    <fieldset class='upload-mode-toggle'><legend class='sr-only'>AI 시뮬레이션 방식</legend><div class='upload-mode-options'><label class='upload-mode-option'><input type='radio' name='upload-mode' value='reference' data-upload-mode ${objectMode ? '' : 'checked'}><span>공간 전체 분석</span></label><label class='upload-mode-option'><input type='radio' name='upload-mode' value='object' data-upload-mode ${objectMode ? 'checked' : ''}><span>객체별 재질 적용</span></label></div></fieldset>
    <p class='upload-intro'>${objectMode ? '공간 사진과 자재 사진을 올린 뒤, 바꿀 객체의 영역을 지정해주세요.' : 'AI 분석을 위해 현재 공간과 워너비 레퍼런스 이미지를 업로드해주세요.'}</p>
    <div class='upload-zones'>${uploadZone('current','현재 공간 사진 업로드','(현재 공간 사진 1장)')}${objectMode ? uploadZone('material','적용할 자재 이미지 업로드','(재질·색상·패턴 1장)') : uploadZone('reference','워너비 레퍼런스 이미지 업로드','(인스타 레퍼런스 이미지 1장)')}</div>
    ${objectMode ? objectSelectionPanel() : ''}
    <button class='button primary analyze-button ${ready ? '' : 'hidden'}' data-action='${action}' ${state.analyzing ? 'disabled' : ''}>${buttonText}</button>
    <p class='session-note'>${icon('shield','tool-drawing')} 테스트 계정: 정주희, Angry 감성 가이드 데이터</p>
  </section></div>`;
}

function renderDashboard() {
  setDocument('홈', state.uploadOpen || state.dialog ? 'modal-open' : '');
  return `<main class='app-page dashboard-legacy-page'>${desktopHeader('home')}${mobileHeader({ house: true })}
    <section class='landing-hero dashboard-legacy-hero' aria-labelledby='dashboard-home-title'>${mainHeroVideo()}<div class='hero-copy'><h1 id='dashboard-home-title'><span class='hero-title-kicker'>사진 두 장에서 시작되는</span><span class='hero-title-main'>솔직하고 투명한<br>공간의 기록</span></h1><button type='button' class='button hero-cta' data-action='open-upload' aria-label='무료 체험 시작하기'><span class='hero-cta-copy'><span class='hero-cta-title'>Start</span><span class='hero-cta-subtitle'>무료 체험 시작하기</span></span><span class='hero-cta-arrow' aria-hidden='true'>→</span></button></div></section>
    ${serviceSection({ signedIn: true })}${bottomNav('home')}${uploadModal()}${dialogMarkup()}</main>`;
}

function reportEstimate() {
  const source = state.project?.analysis?.estimate || fallbackEstimate;
  const number = (value, fallback) => Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : fallback;
  const total = number(source.total, fallbackEstimate.total);
  const savingsAmount = Math.min(total, number(source.savingsAmount, fallbackEstimate.savingsAmount));
  return {
    materialSubtotal: number(source.materialSubtotal, fallbackEstimate.materialSubtotal),
    toolSubtotal: number(source.toolSubtotal, fallbackEstimate.toolSubtotal),
    laborSubtotal: number(source.laborSubtotal, fallbackEstimate.laborSubtotal),
    total,
    savingsAmount,
    savingsRate: total ? Math.round((savingsAmount / total) * 100) : 0,
    items: Array.isArray(source.items) && source.items.length ? source.items : fallbackEstimate.items
  };
}

function estimateTable(estimate) {
  const groups = [
    ['자재비', '1. 자재비', estimate.materialSubtotal],
    ['공구 대여비', '2. 공구 대여비', estimate.toolSubtotal],
    ['표준 인건비', '3. 표준 인건비', estimate.laborSubtotal]
  ];
  const rows = groups.map(([key, label, subtotal]) => {
    const items = estimate.items.filter((item) => item?.section === key);
    return `<tr class='section-row'><td>${label}</td><td></td><td>${money.format(subtotal)}</td></tr>${items.map((item) => `<tr><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.quantity)}</td><td>${money.format(Number(item.price) || 0)}</td></tr>`).join('')}`;
  }).join('');
  return `<table class='estimate-table'><thead><tr><th>항목</th><th>수량/단위</th><th>금액(원)</th></tr></thead><tbody>${rows}<tr class='total-row'><td>총 합계</td><td></td><td>${money.format(estimate.total)}</td></tr></tbody></table>`;
}

function estimateForScreen() {
  const base = reportEstimate();
  if (!state.cart.length) return { ...base, source: state.project ? 'ai' : 'sample' };
  const materialItems = state.cart.map((entry) => ({
    section: '자재비',
    name: entry.material.name,
    specification: entry.material.description,
    quantity: `${entry.quantity}개`,
    unitPrice: Number(entry.material.price) || Math.round(entry.lineTotal / Math.max(1, entry.quantity)),
    price: Number(entry.lineTotal) || 0
  }));
  const materialSubtotal = materialItems.reduce((sum, item) => sum + item.price, 0);
  const total = materialSubtotal + base.toolSubtotal + base.laborSubtotal;
  const savingsAmount = Math.min(total, Math.round(total * (base.savingsRate / 100)));
  return {
    ...base,
    source: 'cart',
    materialSubtotal,
    total,
    savingsAmount,
    items: [...materialItems, ...base.items.filter((item) => item.section !== '자재비')]
  };
}

function estimateDocumentTable(estimate) {
  const sectionDescriptions = {
    '자재비': '선택 자재 및 마감재',
    '공구 대여비': '작업에 필요한 공구와 소모품',
    '표준 인건비': '표준 시공 범위 기준'
  };
  const rows = estimate.items.map((item) => {
    const unitPrice = Number.isFinite(Number(item.unitPrice)) ? `${money.format(Number(item.unitPrice))}원` : '—';
    return `<tr><td><span class='estimate-category'>${escapeHtml(item.section)}</span></td><td><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.specification || sectionDescriptions[item.section] || '')}</span></td><td>${escapeHtml(item.quantity)}</td><td>${unitPrice}</td><td>${money.format(Number(item.price) || 0)}원</td></tr>`;
  }).join('');
  return `<div class='estimate-document-table-wrap'><table class='estimate-document-table'><thead><tr><th>구분</th><th>품목 및 사양</th><th>수량</th><th>단가</th><th>금액</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><th colspan='4'>총 예상 견적</th><td>${money.format(estimate.total)}원</td></tr></tfoot></table></div>`;
}

function gaugeSvg(estimate) {
  const rate = Math.max(0, Math.min(100, estimate.savingsRate));
  const needleRotation = -180 + rate * 1.8;
  return `<svg class='gauge-svg' viewBox='0 0 420 245' role='img' aria-label='DIY 가치 게이지 ${rate}퍼센트 절감'>
    <defs><linearGradient id='gaugeGradient' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='#A86030' stop-opacity='.2'/><stop offset='.32' stop-color='#A86030' stop-opacity='.6'/><stop offset='.67' stop-color='#A86030' stop-opacity='.6'/><stop offset='1' stop-color='#A86030'/></linearGradient></defs>
    <path d='M55 190 A155 155 0 0 1 365 190' fill='none' stroke='#A86030' stroke-opacity='.2' stroke-width='31'/><path d='M55 190 A155 155 0 0 1 365 190' fill='none' stroke='url(#gaugeGradient)' stroke-width='31'/>
    <g fill='#303030' font-size='12'><text x='43' y='215'>0%</text><text x='82' y='90'>25%</text><text x='197' y='48'>50%</text><text x='322' y='90'>75%</text><text x='366' y='215'>100%</text></g>
    <g stroke='#303030' stroke-width='1'><path d='M55 178v23M101 90l15 18M210 35v24M319 90l-15 18M365 178v23'/></g>
    <g transform='rotate(${needleRotation} 210 190)'><path d='M210 190 339 185 339 195z' fill='#303030'/><circle cx='210' cy='190' r='8' fill='#303030'/></g>
    <text class='gauge-value' x='210' y='142' text-anchor='middle'>${rate}%</text><text class='gauge-label' x='210' y='167' text-anchor='middle'>Saved</text><text class='gauge-saving' x='210' y='228' text-anchor='middle'>(${money.format(estimate.savingsAmount)}원 절감 가능!)</text>
  </svg>`;
}

function analysisOverview() {
  const analysis = state.project?.analysis || {};
  const palette = Array.isArray(analysis.palette) ? analysis.palette.slice(0, 3) : [];
  return `<section class='analysis-overview' aria-label='AI 공간 분석 요약'><div><span class='analysis-kicker'>AI 공간 분석</span><strong>${escapeHtml(analysis.style || '내추럴 미니멀')}</strong><p>${escapeHtml(analysis.summary || '현재 공간과 참고 이미지를 비교해 어울리는 자재와 시공 구성을 정리했습니다.')}</p></div>${palette.length ? `<div class='palette-list' aria-label='추천 색상'>${palette.map((color) => `<span>${escapeHtml(color)}</span>`).join('')}</div>` : ''}</section>`;
}

function versionKindLabel(kind) {
  const labels = {
    baseline: '원본 스케치',
    original: '원본 스케치',
    source: '원본 스케치',
    analysis: 'AI 시뮬레이션',
    generation: 'AI 시뮬레이션',
    generated: 'AI 시뮬레이션',
    object: '객체별 재질 적용',
    object_material: '객체별 재질 적용',
    rollback: '원본으로 롤백'
  };
  return labels[String(kind || '').toLowerCase()] || '시뮬레이션 버전';
}

function versionDateLabel(value) {
  const date = new Date(value || '');
  if (Number.isNaN(date.getTime())) return '날짜 미정';
  return date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' });
}

function reportVersionHistory() {
  const project = state.project;
  const history = state.versionHistory?.projectId === project?.id
    ? state.versionHistory
    : emptyVersionHistory(project?.id);
  const versions = history.versions.slice(0, 6);
  const canRollback = Boolean(project?.id) && !history.loading;
  const stateMessage = history.loading
    ? '버전 기록을 불러오는 중입니다.'
    : history.error
      ? '기록을 지금 불러오지 못했어요. 다시 시도해 주세요.'
      : versions.length
        ? '원본 스케치를 기준으로 언제든 새 시뮬레이션을 만들 수 있어요.'
        : '첫 시뮬레이션이 저장되면 이곳에서 버전을 관리할 수 있어요.';
  const versionItems = versions.length
    ? versions.map((version) => `<li class='version-history-item ${version.isActive ? 'is-active' : ''}'>
        <span class='version-history-dot' aria-hidden='true'></span>
        <span class='version-history-copy'><strong>v${escapeHtml(version.versionNumber ?? '—')} · ${escapeHtml(versionKindLabel(version.kind))}</strong><small>${escapeHtml(versionDateLabel(version.createdAt))}</small></span>
        ${version.isActive ? `<span class='version-current-badge'>현재</span>` : ''}
      </li>`).join('')
    : `<li class='version-history-empty'>아직 표시할 버전이 없어요.</li>`;

  return `<section class='report-card version-history-card' aria-labelledby='version-history-title'>
    <div class='version-history-heading'><div><span class='analysis-kicker'>Version history</span><h2 id='version-history-title'>공간 버전 관리</h2><p>${stateMessage}</p></div><span class='version-baseline-pill'>${icon('lock','tool-drawing')} 원본 기준</span></div>
    <ol class='version-history-list'>${versionItems}</ol>
    <div class='version-history-actions'><button class='button' data-action='rollback-baseline' ${canRollback ? '' : 'disabled'}>${icon('refresh','tool-drawing')} 원본 스케치로 롤백</button><button class='button primary' data-action='open-version-analyze' ${project?.beforeUrl ? '' : 'disabled'}>이 기준으로 다시 시뮬레이션 ${icon('arrow','tool-drawing')}</button></div>
  </section>`;
}

function renderReport() {
  const project = state.project;
  const analysis = project?.analysis || {};
  const beforeUrl = project?.beforeUrl || '/assets/generated/room-before.webp';
  const afterUrl = project?.afterUrl || '';
  const provider = String(analysis.provider || '').toLowerCase();
  const isPreview = Boolean(analysis.previewOnly || analysis.preview || provider === 'mock');
  const isFallbackImage = afterUrl.endsWith('/assets/generated/room-before.webp');
  const hasAfter = Boolean(afterUrl) && !isFallbackImage && project?.status !== 'failed';
  const afterAlt = isPreview ? '로컬 변환 결과 미리보기' : '구조를 유지해 생성한 시공 후 공간';
  const caption = !hasAfter
    ? '결과 이미지 생성 대기 중 · Gemini API 연결 상태를 확인해주세요.'
    : isPreview
      ? '로컬 미리보기 · Gemini API 연결 후 실제 변환 이미지가 생성됩니다.'
      : '동일한 배치 위에 재질·색상·조명을 적용한 AI 시뮬레이션';
  const comparisonControls = hasAfter
    ? `<img class='comparison-image comparison-after' src='${afterUrl}' alt='${afterAlt}'><span class='comparison-label before'>Before</span><span class='comparison-label after'>After</span><span class='comparison-divider'></span><span class='comparison-handle' aria-hidden='true'>‹›</span><label class='sr-only' for='compare-range'>시공 전후 비교 위치</label><input id='compare-range' type='range' min='0' max='100' value='50'>`
    : `<span class='comparison-label before'>Before</span>`;
  const estimate = reportEstimate();
  setDocument('맞춤형 결과 리포트', state.dialog ? 'modal-open' : '');
  return `<main class='app-page report-page'>${desktopHeader('myproject')}${mobileHeader({back:true})}<div class='app-content'>${appBackButton()}
    <div class='page-heading'><div><h1>맞춤형 결과 리포트</h1><p>AI 시뮬레이션 &amp; 견적 분석 결과</p></div><div class='report-heading-actions'><button class='button' data-action='print-report'>보고서 다운로드 ${icon('download','tool-drawing')}</button><button class='button primary' data-action='save-project'>프로젝트 저장 ${icon('save','tool-drawing')}</button></div></div>
    <section class='comparison-card'><div class='comparison ${hasAfter ? '' : 'is-unavailable'}' id='comparison'><img class='comparison-image comparison-before' src='${beforeUrl}' alt='시공 전 공간'>${comparisonControls}<div class='comparison-status' role='status'><span class='comparison-status-icon'>✦</span><strong>변환 이미지를 준비하지 못했어요</strong><span>Gemini 이미지 모델을 설정한 뒤 다시 분석해주세요.</span></div></div><p class='ai-caption ${isPreview || !hasAfter ? 'is-preview' : ''}'>${caption}</p></section>
    ${analysisOverview()}
    ${reportVersionHistory()}
    <div class='report-grid'><section class='report-card'><h2>통합 견적 명세서</h2>${estimateTable(estimate)}<p class='report-note'>※ 시공 환경 및 자재 선택에 따라 견적은 변동될 수 있습니다.</p></section></div>
    <div class='report-mobile-actions'><button class='button' data-action='print-report'>보고서 다운로드 ${icon('download','tool-drawing')}</button><button class='button primary' data-action='save-project'>프로젝트 저장 ${icon('save','tool-drawing')}</button></div><a class='market-link' href='/market' data-link>추천 자재 보러가기 →</a>
  </div>${dialogMarkup()}</main>`;
}

function productCard(material) {
  const selected = state.selectedProducts.has(material.id);
  const recommended = (state.project?.analysis?.recommendedSlugs || []).includes(material.slug);
  return `<article class='product-card ${selected ? 'selected' : ''} ${recommended ? 'recommended' : ''}' data-product-card='${material.id}'>${recommended ? `<span class='ai-recommend-badge'>AI 추천</span>` : ''}<button class='select-product' data-action='select-product' data-id='${material.id}' aria-label='상품 선택'>${selected ? '✓' : ''}</button><div class='product-image'><img src='${material.imageUrl}' alt='${escapeHtml(material.name)}' loading='lazy'></div><div class='product-body'><h3>${escapeHtml(material.name)}</h3><p>${escapeHtml(material.description)}</p><span class='product-price'>${money.format(material.price)}원</span><div class='product-actions'><button class='button' data-action='product-detail' data-id='${material.id}'>상세보기</button><button class='button primary' data-action='add-cart' data-id='${material.id}'>장바구니</button></div></div></article>`;
}

function filteredMaterials() {
  const query = state.market.query.toLowerCase();
  const recommended = new Set(state.project?.analysis?.recommendedSlugs || []);
  return state.materials
    .filter((material) => (state.market.category === 'all' || material.category === state.market.category) && material.price <= state.market.maxPrice && (!query || `${material.name} ${material.description}`.toLowerCase().includes(query)))
    .sort((a, b) => Number(recommended.has(b.slug)) - Number(recommended.has(a.slug)));
}

function refreshProductGrid() {
  const grid = document.querySelector('#product-grid');
  if (!grid) return;
  const materials = filteredMaterials();
  grid.innerHTML = materials.length ? materials.map(productCard).join('') : `<div class='empty-state' style='grid-column:1/-1;min-height:300px'><div><span class='empty-state-icon'>⌕</span><h2>조건에 맞는 자재가 없어요.</h2><p class='muted'>검색어나 가격대를 조정해주세요.</p></div></div>`;
}

function renderMarket() {
  setDocument('자재 마켓', state.dialog ? 'modal-open' : '');
  const materials = filteredMaterials();
  const categories = ['wallpaper','flooring','tile','tools'];
  const categoryImage = { wallpaper: 'wallpaper.webp', flooring: 'flooring.webp', tile: 'tile.webp', tools: 'tools.webp' };
  const hasRecommendations = Boolean(state.project?.analysis?.recommendedSlugs?.length);
  return `<main class='app-page market-page'>${desktopHeader('')}${mobileHeader({back:true, profile:true})}<div class='app-content'>${appBackButton()}
    <div class='market-title-row'><div class='page-heading'><div><h1>자재 마켓</h1><p>${hasRecommendations ? 'AI 분석 결과와 어울리는 상품을 먼저 보여드려요.' : '필수 DIY 자재를 합리적인 가격에!'}</p></div><div class='report-heading-actions'><button class='button' data-action='market-guide'>마켓 가이드</button><button class='button primary' data-action='open-cart'>내 장바구니 ${icon('cart','tool-drawing')}<span class='cart-badge'>${state.cart.length}</span></button></div></div></div>
    <div class='market-layout'><aside class='market-sidebar'><section class='filter-group'><h3>카테고리</h3><div class='filter-list'>${categories.map((category) => `<label><input type='radio' name='desktop-category' data-category='${category}' ${state.market.category === category ? 'checked' : ''}> ${categoryLabels[category]}</label>`).join('')}<label><input type='radio' name='desktop-category' data-category='all' ${state.market.category === 'all' ? 'checked' : ''}> 전체</label></div></section><section class='filter-group'><h3>가격대</h3><input class='price-range' type='range' min='100000' max='1800000' step='10000' value='${state.market.maxPrice}' data-price-range><div class='range-label'><span>0원</span><span data-range-output>${money.format(state.market.maxPrice)}원</span></div></section></aside>
      <section class='market-main'><div class='market-toolbar'><div class='search-box'><input id='market-search' value='${escapeHtml(state.market.query)}' placeholder='자재를 검색하세요' aria-label='자재 검색'><span>${icon('search','tool-drawing')}</span></div></div>
        <div class='mobile-categories'>${categories.map((category) => `<button class='category-shortcut ${state.market.category === category ? 'active' : ''}' data-action='set-category' data-category='${category}'><span class='category-circle'><img src='/assets/materials/${categoryImage[category]}' alt='' loading='lazy'></span><span>${categoryLabels[category]}</span></button>`).join('')}</div>
        <div class='product-grid' id='product-grid'>${materials.length ? materials.map(productCard).join('') : `<div class='empty-state' style='grid-column:1/-1;min-height:300px'><div><span class='empty-state-icon'>⌕</span><h2>조건에 맞는 자재가 없어요.</h2><p class='muted'>검색어나 가격대를 조정해주세요.</p></div></div>`}</div>
        <div class='market-action-bar'><button class='button' data-action='add-estimate'>견적서에 추가${state.selectedProducts.size ? ` (${state.selectedProducts.size})` : ''}</button><button class='button primary' data-action='checkout'>결제하기</button></div><p class='market-note'>※ 시공 환경 및 수량에 따라 가격은 변동될 수 있습니다.</p>
      </section></div>
  </div>${dialogMarkup()}</main>`;
}

function versionAnalyzeDialog() {
  const modal = state.versionModal;
  if (!modal) return '';
  const baseline = modal.baseline;
  const reference = modal.reference;
  const baselineContent = modal.loadingBaseline
    ? `<div class='version-baseline-loading'><span class='spinner'></span><span>원본 스케치를 잠그는 중입니다.</span></div>`
    : baseline
      ? `<img src='${baseline.dataUrl}' alt='잠긴 원본 공간 스케치'>`
      : `<div class='version-baseline-loading is-error'><span>${icon('image','tool-drawing')}</span><span>${escapeHtml(modal.baselineError || '원본 스케치를 불러오지 못했습니다.')}</span></div>`;
  const referenceContent = reference
    ? `<span class='version-reference-preview'><img src='${reference.dataUrl}' alt='새 레퍼런스 미리보기'><span>클릭하여 레퍼런스 교체</span></span>`
    : `<span class='version-reference-empty'><span class='upload-icon'>${icon('image','tool-drawing')}</span><strong>새 레퍼런스 또는 자재 이미지</strong><span>색감·재질·스타일을 담은 사진 1장</span></span>`;
  const ready = Boolean(baseline && reference && !modal.submitting);
  return `<div class='modal-backdrop' data-action='dialog-backdrop'><section class='dialog version-analyze-dialog' data-modal role='dialog' aria-modal='true' aria-labelledby='version-analyze-title'>
    <button class='icon-button modal-close' data-action='close-dialog' aria-label='재시뮬레이션 닫기'>${icon('close','tool-drawing')}</button>
    <span class='version-modal-kicker'>Original baseline</span><h2 id='version-analyze-title'>원본 스케치에서 다시 시작하기</h2><p class='version-modal-intro'>현재 결과 대신, 잠긴 원본 공간을 기준으로 새 레퍼런스의 분위기와 자재감을 적용합니다.</p>
    <section class='version-baseline-section' aria-labelledby='version-baseline-title'><div class='version-baseline-heading'><div><span id='version-baseline-title'>고정된 원본 스케치</span><small>구조·가구 배치·카메라 앵글은 유지됩니다.</small></div><span>${icon('lock','tool-drawing')} 잠김</span></div><div class='version-baseline-preview'>${baselineContent}</div></section>
    <label class='version-reference-zone' data-version-reference-drop><input type='file' data-version-reference accept='image/png,image/jpeg,image/webp' aria-label='새 레퍼런스 또는 자재 이미지 업로드'>${referenceContent}</label>
    ${modal.error ? `<p class='version-modal-error' role='alert'>${escapeHtml(modal.error)}</p>` : ''}
    <div class='dialog-actions version-dialog-actions'><button class='button' data-action='close-dialog'>취소</button><button class='button primary' data-action='submit-version-analyze' ${ready ? '' : 'disabled'}>${modal.submitting ? `<span class='spinner'></span> 새 시뮬레이션 생성 중` : `이 기준으로 시뮬레이션 ${icon('arrow','tool-drawing')}`}</button></div>
  </section></div>`;
}

function dialogMarkup() {
  if (!state.dialog) return '';
  if (state.dialog.type === 'version-analyze') return versionAnalyzeDialog();
  if (state.dialog.type === 'delete-project') {
    const project = state.projects.find((item) => item.id === state.dialog.id) || (state.project?.id === state.dialog.id ? state.project : null);
    if (!project) return '';
    return `<div class='modal-backdrop' data-action='dialog-backdrop'><section class='dialog delete-project-dialog' data-modal role='dialog' aria-modal='true' aria-labelledby='delete-project-dialog-title'><button class='icon-button' data-action='close-dialog' style='float:right' aria-label='삭제 확인 닫기'>${icon('close','tool-drawing')}</button><span class='delete-dialog-kicker'>Project delete</span><h2 id='delete-project-dialog-title'>이 프로젝트를 삭제할까요?</h2><p><strong>${escapeHtml(project.title)}</strong>에 첨부한 사진과 AI 분석 결과가 함께 삭제됩니다. 삭제한 프로젝트는 복구할 수 없어요.</p><div class='dialog-actions'><button class='button' data-action='close-dialog'>취소</button><button class='button delete-confirm-button' data-action='confirm-delete-project' data-id='${escapeHtml(project.id)}'>삭제하기</button></div></section></div>`;
  }
  if (state.dialog.type === 'product') {
    const item = state.materials.find((material) => material.id === state.dialog.id);
    if (!item) return '';
    return `<div class='modal-backdrop' data-action='dialog-backdrop'><section class='dialog' data-modal role='dialog' aria-modal='true' aria-labelledby='product-dialog-title'><button class='icon-button' data-action='close-dialog' style='float:right' aria-label='상품 상세 닫기'>${icon('close','tool-drawing')}</button><img src='${item.imageUrl}' alt='${escapeHtml(item.name)}' loading='lazy' style='width:100%;aspect-ratio:1.8;object-fit:cover;border-radius:12px;margin-bottom:18px'><span class='pill'>${categoryLabels[item.category]}</span><h2 id='product-dialog-title' style='margin-top:12px'>${escapeHtml(item.name)}</h2><p class='muted'>${escapeHtml(item.description)}</p><h3>${money.format(item.price)}원</h3><div class='dialog-actions'><button class='button' data-action='close-dialog'>계속 둘러보기</button><button class='button primary' data-action='add-cart' data-id='${item.id}'>장바구니 담기</button></div></section></div>`;
  }
  if (state.dialog.type === 'checkout') {
    const selected = state.cart.filter((item) => item.selected);
    const total = selected.reduce((sum, item) => sum + item.lineTotal, 0);
    return `<div class='modal-backdrop' data-action='dialog-backdrop'><section class='dialog' data-modal role='dialog' aria-modal='true' aria-labelledby='checkout-dialog-title'><button class='icon-button' data-action='close-dialog' style='float:right' aria-label='주문 확인 닫기'>${icon('close','tool-drawing')}</button><h2 id='checkout-dialog-title'>주문 내역 확인</h2><p class='muted'>현재는 결제 제공자 연동 전 데모 주문입니다.</p><div class='checkout-list'>${selected.length ? selected.map((item) => `<div class='checkout-item'><img src='${item.material.imageUrl}' alt='' loading='lazy'><div><strong>${escapeHtml(item.material.name)}</strong><div class='cart-controls'><button data-action='cart-decrease' data-id='${item.cartId}' aria-label='${escapeHtml(item.material.name)} 수량 줄이기'>−</button><span>수량 ${item.quantity}</span><button data-action='cart-increase' data-id='${item.cartId}' aria-label='${escapeHtml(item.material.name)} 수량 늘리기'>＋</button><button class='cart-remove' data-action='cart-remove' data-id='${item.cartId}'>삭제</button></div></div><strong>${money.format(item.lineTotal)}원</strong></div>`).join('') : `<p class='muted'>장바구니가 비어 있습니다.</p>`}</div><div class='checkout-total'><span>총 결제 금액</span><span>${money.format(total)}원</span></div><div class='dialog-actions'><button class='button' data-action='close-dialog'>취소</button><button class='button primary' data-action='confirm-order' ${selected.length ? '' : 'disabled'}>데모 결제 완료</button></div></section></div>`;
  }
  return '';
}

function renderProjects() {
  setDocument('내 프로젝트', state.dialog ? 'modal-open' : '');
  return `<main class='app-page'>${desktopHeader('myproject')}${mobileHeader({back:true})}<div class='app-content'>${appBackButton()}<div class='page-heading'><div><h1>내 프로젝트</h1><p>공간의 변화와 저장된 리포트를 확인하세요.</p></div><button class='button primary desktop-only' data-action='new-project'>새 프로젝트</button></div>
    ${state.projects.length ? `<div class='project-list'>${state.projects.map((project) => projectCard(project)).join('')}</div>` : `<div class='empty-state'><div><span class='empty-state-icon'>⌂</span><h2>아직 저장한 프로젝트가 없어요.</h2><p class='muted'>사진 두 장으로 첫 공간 기록을 시작해보세요.</p><button class='button primary' data-action='new-project'>프로젝트 시작하기</button></div></div>`}
  </div>${bottomNav('projects')}${dialogMarkup()}</main>`;
}

function renderDialogContext() {
  if (location.pathname === '/dashboard') app.innerHTML = renderDashboard();
  else if (location.pathname.startsWith('/reports/')) app.innerHTML = renderReport();
  else if (location.pathname === '/projects') app.innerHTML = renderProjects();
  else if (location.pathname === '/estimate') app.innerHTML = renderEstimate();
  else app.innerHTML = renderMarket();
  bindPage();
}

function renderEstimate() {
  setDocument('견적서', state.dialog ? 'modal-open' : '');
  const estimate = estimateForScreen();
  const now = new Date();
  const validUntil = new Date(now);
  validUntil.setDate(validUntil.getDate() + 14);
  const dateKey = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const projectCode = String(state.project?.id || 'BASE').replace(/[^a-z0-9]/gi, '').slice(-4).toUpperCase() || 'BASE';
  const quoteNumber = `MO-${dateKey}-${projectCode}`;
  const dateLabel = (value) => value.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
  const sourceLabel = estimate.source === 'cart' ? '선택 자재 기준' : estimate.source === 'ai' ? '최근 AI 분석 기준' : '표준 공간 예시 기준';
  const sourceNote = estimate.source === 'cart'
    ? '장바구니에 담은 자재와 최신 공구비·시공비를 합산했습니다.'
    : estimate.source === 'ai'
      ? '최근 공간 분석 결과를 바탕으로 산출한 예상 견적입니다.'
      : '아직 선택한 자재가 없어 표준 공간 기준의 예시 견적을 먼저 보여드립니다.';
  return `<main class='app-page estimate-page'>${desktopHeader('estimate')}${mobileHeader({back:true})}<div class='app-content'>${appBackButton()}
    <div class='page-heading estimate-toolbar'><div><h1>견적서</h1><p>프로젝트에 필요한 예상 비용을 항목별로 확인하세요.</p></div><div class='estimate-toolbar-actions'><a class='button' href='/market' data-link>자재 수정</a><button class='button primary' data-action='print-estimate'>${icon('download','tool-drawing')} PDF 저장 · 인쇄</button></div></div>
    <article class='estimate-sheet' aria-labelledby='estimate-document-title'>
      <header class='estimate-document-header'><div class='estimate-document-brand'>${brandLogo()}<span>공간을 더 쉽고 투명하게</span></div><div class='estimate-document-title'><span>QUOTATION</span><h2 id='estimate-document-title'>공간 시공 견적서</h2></div></header>
      <div class='estimate-source-note'><span>${sourceLabel}</span><p>${sourceNote}</p></div>
      <dl class='estimate-meta'><div><dt>견적 번호</dt><dd>${quoteNumber}</dd></div><div><dt>받는 분</dt><dd>${escapeHtml(state.user?.name || 'Moin 고객')}님</dd></div><div><dt>프로젝트</dt><dd>${escapeHtml(state.project?.title || 'Moin 공간 개선 프로젝트')}</dd></div><div><dt>발행일</dt><dd>${dateLabel(now)}</dd></div><div><dt>유효기간</dt><dd>${dateLabel(validUntil)}까지</dd></div><div><dt>견적 상태</dt><dd><span class='estimate-status'>예상 견적</span></dd></div></dl>
      <section class='estimate-total-hero' aria-label='총 예상 견적'><span>총 예상 견적</span><strong>${money.format(estimate.total)}원</strong><small>자재비·공구비·표준 인건비 포함</small></section>
      <section class='estimate-detail'><div class='estimate-section-heading'><h3>상세 산출 내역</h3><span>금액 단위: 원</span></div>${estimateDocumentTable(estimate)}</section>
      <section class='estimate-summary' aria-label='견적 요약'><div><span>자재비</span><strong>${money.format(estimate.materialSubtotal)}원</strong></div><div><span>공구 대여비</span><strong>${money.format(estimate.toolSubtotal)}원</strong></div><div><span>표준 인건비</span><strong>${money.format(estimate.laborSubtotal)}원</strong></div><div class='total'><span>총 합계</span><strong>${money.format(estimate.total)}원</strong></div></section>
      <footer class='estimate-document-footer'><strong>안내 사항</strong><p>본 견적은 선택 자재와 표준 시공 범위를 기준으로 산출한 예상 금액이며, 현장 상태·면적·수량에 따라 실제 금액이 달라질 수 있습니다.</p><span>Moin · 투명한 공간의 기록</span></footer>
    </article>
    <div class='estimate-bottom-actions'><a class='button' href='/market' data-link>자재 더 둘러보기</a>${state.cart.length ? `<button class='button primary' data-action='open-cart'>선택 자재 결제하기</button>` : ''}</div>
  </div>${bottomNav('estimate')}${dialogMarkup()}</main>`;
}

function renderMyPage() {
  setDocument('마이페이지', '');
  return `<main class='app-page'>${desktopHeader('mypage')}${mobileHeader({back:true})}<div class='app-content'>${appBackButton()}<div class='page-heading'><div><h1>마이페이지</h1><p>계정과 서비스 이용 정보를 관리하세요.</p></div></div><section class='report-card' style='max-width:680px'><div style='display:flex;align-items:center;gap:16px;margin-bottom:28px'><span class='avatar' style='width:64px;height:64px;font-size:23px'>${escapeHtml((state.user?.name || 'M').slice(0,1))}</span><div><h2 style='margin:0 0 4px'>${escapeHtml(state.user?.name || 'Moin')}님</h2><p class='muted' style='margin:0'>${escapeHtml(state.user?.email || '')}</p></div></div><div class='stack'><button class='button' data-action='privacy'>개인정보 및 보안</button><a class='button' href='/notifications' data-link>${icon('bell','tool-drawing')} 알림 설정 및 확인</a><button class='button' data-action='logout'>${icon('logout','tool-drawing')} 로그아웃</button></div></section></div>${bottomNav('mypage')}</main>`;
}

function renderNotifications() {
  const notifications = buildNotifications();
  markNotificationsRead(notifications);
  setDocument('알림', '');
  return `<main class='app-page notifications-page'>${desktopHeader('')}${mobileHeader({back:true})}<div class='app-content'>${appBackButton()}
    <div class='page-heading'><div><span class='dashboard-kicker'>Notifications</span><h1>알림</h1><p>최근 공간 기록과 다음에 할 일을 한곳에서 확인하세요.</p></div></div>
    <section class='notification-center' aria-labelledby='notification-center-title'><div class='notification-center-heading'><div><h2 id='notification-center-title'>새 소식</h2><p>프로젝트 상태에 맞춰 필요한 다음 행동을 안내해드려요.</p></div><span class='notification-read-status'>모두 확인함</span></div>
      <ul class='notification-list'>${notifications.map((notification) => `<li><a class='notification-item' href='${notification.href}' data-link><span class='notification-item-icon' aria-hidden='true'>${icon(notificationIcon(notification.type), 'tool-drawing')}</span><span class='notification-item-copy'><small>${escapeHtml(notification.meta)}</small><strong>${escapeHtml(notification.title)}</strong><span>${escapeHtml(notification.body)}</span></span><span class='notification-item-action'>${escapeHtml(notification.action)} ${icon('arrow', 'tool-drawing')}</span></a></li>`).join('')}</ul>
    </section>
  </div>${bottomNav('')}</main>`;
}

function loadingMarkup() {
  setDocument('불러오는 중', '');
  return `<main class='loading-screen'><div><div class='loading-ring'></div><p style='margin-top:16px'>Moin을 준비하고 있어요.</p></div></main>`;
}

async function ensureMaterials() {
  if (!state.materials.length) state.materials = (await api('/api/v1/materials')).materials;
}

async function ensureCart() {
  if (!state.user) return;
  state.cart = (await api('/api/v1/cart')).items;
}

async function refreshProjects() {
  if (!state.user) {
    state.projects = [];
    state.project = null;
    return;
  }
  state.projects = (await api('/api/v1/projects')).projects;
  state.project = state.projects.find((project) => project.status !== 'failed') || null;
}

async function ensureLatestProject() {
  if (!state.user || state.project) return;
  if (!state.projects.length) await refreshProjects();
  else state.project = state.projects.find((project) => project.status !== 'failed') || null;
}

function emptyVersionHistory(projectId = null, error = null) {
  return { projectId, versions: [], baselineVersionId: null, loading: false, error };
}

async function loadVersionHistory(projectId) {
  if (!projectId) {
    state.versionHistory = emptyVersionHistory();
    return state.versionHistory;
  }

  state.versionHistory = { ...emptyVersionHistory(projectId), loading: true };
  try {
    const data = await api(`/api/v1/projects/${encodeURIComponent(projectId)}/versions`);
    state.versionHistory = {
      projectId,
      versions: Array.isArray(data?.versions) ? data.versions : [],
      baselineVersionId: data?.baselineVersionId || null,
      loading: false,
      error: null
    };
  } catch (error) {
    if (error.status === 401) throw error;
    state.versionHistory = emptyVersionHistory(projectId, error.message || '버전 기록을 불러오지 못했습니다.');
  }
  return state.versionHistory;
}

function replaceProjectInState(project) {
  if (!project?.id) return;
  state.project = project;
  const index = state.projects.findIndex((item) => item.id === project.id);
  if (index >= 0) state.projects.splice(index, 1, project);
}

async function renderRoute() {
  const pathname = location.pathname;
  if (state.user === undefined) { app.innerHTML = loadingMarkup(); return; }
  if (isProtected(pathname) && !state.user) { navigate('/login', { replace: true }); return; }
  if (pathname === '/' && state.user) { navigate('/dashboard', { replace: true }); return; }
  app.innerHTML = loadingMarkup();
  try {
    let html;
    if (pathname === '/') html = renderLanding();
    else if (pathname === '/login') html = state.user ? (navigate('/dashboard', { replace: true }), '') : renderLogin();
    else if (pathname === '/signup') html = state.user ? (navigate('/dashboard', { replace: true }), '') : renderSignup();
    else if (pathname === '/dashboard') {
      await refreshProjects();
      html = renderDashboard();
    }
    else if (pathname.startsWith('/reports/')) {
      const id = pathname.split('/')[2];
      state.project = (await api(`/api/v1/projects/${id}`)).project;
      await loadVersionHistory(state.project.id);
      if (state.project.status === 'failed') {
        history.replaceState({ ...(history.state || {}), moin: true }, '', '/projects');
        state.projects = (await api('/api/v1/projects')).projects;
        html = renderProjects();
      } else html = renderReport();
    } else if (pathname === '/market') {
      await Promise.all([ensureMaterials(), ensureCart(), ensureLatestProject()]);
      html = renderMarket();
    } else if (pathname === '/projects') {
      await refreshProjects();
      html = renderProjects();
    } else if (pathname === '/estimate') {
      await Promise.all([ensureCart(), ensureLatestProject()]);
      html = renderEstimate();
    } else if (pathname === '/mypage') html = renderMyPage();
    else if (pathname === '/notifications') {
      await refreshProjects();
      html = renderNotifications();
    }
    else if (state.user) { history.replaceState({ ...(history.state || {}), moin: true }, '', '/dashboard'); await refreshProjects(); html = renderDashboard(); }
    else { history.replaceState({ ...(history.state || {}), moin: true }, '', '/'); html = renderLanding(); }
    if (html) app.innerHTML = html;
    bindPage();
  } catch (error) {
    if (error.status === 401) { resetUserState(); state.user = null; navigate('/login', { replace: true }); return; }
    app.innerHTML = `<main class='loading-screen'><div style='text-align:center'><h2>화면을 불러오지 못했어요.</h2><p class='muted'>${escapeHtml(error.message)}</p><button class='button primary' data-action='retry'>다시 시도</button></div></main>`;
    bindPage();
  }
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('이미지를 읽지 못했습니다.'));
    reader.readAsDataURL(blob);
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function decodeUploadImage(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      try { return await createImageBitmap(file); } catch { /* use HTMLImageElement below */ }
    }
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('이미지를 해석하지 못했습니다. 다른 앱에서 다시 저장한 뒤 업로드해주세요.'));
    };
    image.src = objectUrl;
  });
}

async function readFile(file) {
  if (!file || !['image/png','image/jpeg','image/webp'].includes(file.type)) throw new Error('PNG, JPEG 또는 WebP 이미지를 선택해주세요.');
  if (file.size > 8 * 1024 * 1024) throw new Error('이미지는 장당 8MB 이하여야 합니다.');

  let source;
  try {
    source = await decodeUploadImage(file);
    const sourceWidth = source.width || source.naturalWidth;
    const sourceHeight = source.height || source.naturalHeight;
    if (!sourceWidth || !sourceHeight) throw new Error('이미지 크기를 확인하지 못했습니다.');
    if (sourceWidth * sourceHeight > 80_000_000) throw new Error('이미지 해상도가 너무 큽니다. 8천만 픽셀 이하 이미지를 사용해주세요.');

    const maxEdge = 2048;
    const scale = Math.min(1, maxEdge / Math.max(sourceWidth, sourceHeight));
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('이미지 변환을 시작하지 못했습니다.');

    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, width, height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(source, 0, 0, width, height);

    let normalized = await canvasToBlob(canvas, 'image/webp', 0.94);
    let extension = 'webp';
    if (!normalized || normalized.type !== 'image/webp') {
      normalized = await canvasToBlob(canvas, 'image/jpeg', 0.92);
      extension = 'jpg';
    }
    if (!normalized) throw new Error('표준 이미지로 변환하지 못했습니다.');
    if (normalized.size > 8 * 1024 * 1024) throw new Error('변환된 이미지가 8MB를 초과합니다. 더 작은 이미지를 사용해주세요.');

    const stem = file.name.replace(/\.[^.]+$/, '') || 'upload';
    return {
      name: `${stem}.${extension}`,
      originalName: file.name,
      dataUrl: await blobToDataUrl(normalized),
      width,
      height,
      mimeType: normalized.type
    };
  } catch (error) {
    if (error instanceof Error && error.message) throw error;
    throw new Error('이미지를 표준 형식으로 변환하지 못했습니다. 다시 저장한 파일을 사용해주세요.');
  } finally {
    if (source && typeof source.close === 'function') source.close();
  }
}

async function setUploadFile(key, file) {
  state.upload[key] = await readFile(file);
  if (key === 'current') state.upload.selection = { x: 24, y: 22, width: 52, height: 54 };
}

function imageMimeTypeFromUrl(url) {
  const pathname = String(url || '').split('?')[0].toLowerCase();
  if (pathname.endsWith('.png')) return 'image/png';
  if (pathname.endsWith('.webp')) return 'image/webp';
  if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) return 'image/jpeg';
  return null;
}

async function fetchBeforeImageAsUpload(beforeUrl) {
  if (!beforeUrl) throw new Error('원본 스케치 주소를 찾지 못했습니다.');
  const resolvedUrl = new URL(beforeUrl, location.origin);
  if (resolvedUrl.origin !== location.origin) throw new Error('원본 이미지는 같은 서비스 주소에서만 불러올 수 있습니다.');
  const response = await fetch(resolvedUrl, {
    credentials: 'same-origin',
    headers: { accept: 'image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8' }
  });
  if (!response.ok) {
    const error = new Error(response.status === 401 ? '원본 이미지를 불러오려면 다시 로그인해주세요.' : '원본 스케치를 불러오지 못했습니다.');
    error.status = response.status;
    throw error;
  }
  const blob = await response.blob();
  const responseType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  const mimeType = ['image/png', 'image/jpeg', 'image/webp'].includes(responseType)
    ? responseType
    : ['image/png', 'image/jpeg', 'image/webp'].includes(blob.type)
      ? blob.type
      : imageMimeTypeFromUrl(resolvedUrl.pathname);
  if (!mimeType || !blob.size) throw new Error('원본 스케치 파일 형식을 확인하지 못했습니다.');
  const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  return readFile(new File([blob], `moin-original-baseline.${extension}`, { type: mimeType }));
}

function clampNumber(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(Number(value)) ? Number(value) : minimum));
}

function roundedSelectionValue(value) {
  return Math.round(value * 100) / 100;
}

function clampObjectSelection(selection = {}) {
  const minimumSize = 8;
  const width = clampNumber(selection.width, minimumSize, 100);
  const height = clampNumber(selection.height, minimumSize, 100);
  const x = clampNumber(selection.x, 0, 100 - width);
  const y = clampNumber(selection.y, 0, 100 - height);
  return {
    x: roundedSelectionValue(x),
    y: roundedSelectionValue(y),
    width: roundedSelectionValue(width),
    height: roundedSelectionValue(height)
  };
}

function selectionToPayload(selection) {
  const normalized = clampObjectSelection(selection);
  return {
    x: Number((normalized.x / 100).toFixed(4)),
    y: Number((normalized.y / 100).toFixed(4)),
    width: Number((normalized.width / 100).toFixed(4)),
    height: Number((normalized.height / 100).toFixed(4)),
    unit: 'normalized'
  };
}

async function createObjectMask(image, selection) {
  if (!image?.width || !image?.height) throw new Error('선택 영역을 만들 공간 사진을 찾지 못했습니다.');
  const normalized = clampObjectSelection(selection);
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('선택 영역 마스크를 만들지 못했습니다.');

  context.fillStyle = '#000000';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const x = Math.round((normalized.x / 100) * canvas.width);
  const y = Math.round((normalized.y / 100) * canvas.height);
  const width = Math.max(1, Math.round((normalized.width / 100) * canvas.width));
  const height = Math.max(1, Math.round((normalized.height / 100) * canvas.height));
  context.fillStyle = '#FFFFFF';
  context.fillRect(x, y, width, height);

  const mask = await canvasToBlob(canvas, 'image/png');
  if (!mask) throw new Error('선택 영역 마스크를 PNG로 저장하지 못했습니다.');
  return blobToDataUrl(mask);
}

function updateObjectSelectionUi(root = document.querySelector('[data-object-selection-root]')) {
  if (!root) return;
  const selection = clampObjectSelection(state.upload.selection);
  state.upload.selection = selection;
  const stage = root.querySelector('[data-object-selection-stage]');
  if (stage) {
    stage.style.setProperty('--selection-x', `${selection.x}%`);
    stage.style.setProperty('--selection-y', `${selection.y}%`);
    stage.style.setProperty('--selection-width', `${selection.width}%`);
    stage.style.setProperty('--selection-height', `${selection.height}%`);
  }
  root.querySelector('[data-object-selection-label]')?.replaceChildren(document.createTextNode(objectTargetLabel(state.upload.targetObject)));
  const limits = {
    x: { min: 0, max: 100 - selection.width, value: selection.x },
    y: { min: 0, max: 100 - selection.height, value: selection.y },
    width: { min: 8, max: 100 - selection.x, value: selection.width },
    height: { min: 8, max: 100 - selection.y, value: selection.height }
  };
  root.querySelectorAll('[data-object-selection-field]').forEach((input) => {
    const limit = limits[input.dataset.objectSelectionField];
    if (!limit) return;
    input.min = String(limit.min);
    input.max = String(Math.max(limit.min, Math.round(limit.max)));
    input.value = String(Math.round(limit.value));
    input.setAttribute('aria-valuetext', `${Math.round(limit.value)}%`);
  });
  root.querySelectorAll('[data-object-selection-value]').forEach((output) => {
    const value = limits[output.dataset.objectSelectionValue]?.value;
    if (Number.isFinite(value)) output.textContent = `${Math.round(value)}%`;
  });
  const output = root.querySelector('[data-object-selection-output]');
  if (output) output.textContent = `선택 영역: 왼쪽 ${Math.round(selection.x)}%, 위 ${Math.round(selection.y)}%, 가로 ${Math.round(selection.width)}%, 세로 ${Math.round(selection.height)}%`;
}

function stagePoint(event, stage) {
  const rect = stage.getBoundingClientRect();
  return {
    x: clampNumber(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
    y: clampNumber(((event.clientY - rect.top) / rect.height) * 100, 0, 100)
  };
}

function resizeObjectSelection(selection, handle, delta) {
  const minimumSize = 8;
  let left = selection.x;
  let top = selection.y;
  let right = selection.x + selection.width;
  let bottom = selection.y + selection.height;
  if (handle.includes('w')) left = clampNumber(selection.x + delta.x, 0, right - minimumSize);
  if (handle.includes('e')) right = clampNumber(selection.x + selection.width + delta.x, left + minimumSize, 100);
  if (handle.includes('n')) top = clampNumber(selection.y + delta.y, 0, bottom - minimumSize);
  if (handle.includes('s')) bottom = clampNumber(selection.y + selection.height + delta.y, top + minimumSize, 100);
  return clampObjectSelection({ x: left, y: top, width: right - left, height: bottom - top });
}

function bindObjectSelection() {
  const root = document.querySelector('[data-object-selection-root]');
  if (!root) return;
  root.querySelectorAll('[data-object-target]').forEach((input) => input.addEventListener('change', () => {
    state.upload.targetObject = input.value;
    updateObjectSelectionUi(root);
  }));
  root.querySelectorAll('[data-object-selection-field]').forEach((input) => input.addEventListener('input', () => {
    state.upload.selection = clampObjectSelection({ ...state.upload.selection, [input.dataset.objectSelectionField]: Number(input.value) });
    updateObjectSelectionUi(root);
  }));

  const stage = root.querySelector('[data-object-selection-stage]');
  if (!stage) return;
  let gesture = null;
  const finishGesture = (event) => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    try { stage.releasePointerCapture(event.pointerId); } catch { /* pointer capture can already be released */ }
    gesture = null;
  };
  stage.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const box = event.target.closest('[data-selection-box]');
    if (!box || !stage.contains(box)) return;
    const handle = event.target.closest('[data-selection-handle]')?.dataset.selectionHandle || null;
    gesture = {
      pointerId: event.pointerId,
      handle,
      origin: stagePoint(event, stage),
      selection: { ...state.upload.selection }
    };
    stage.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });
  stage.addEventListener('pointermove', (event) => {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const point = stagePoint(event, stage);
    const delta = { x: point.x - gesture.origin.x, y: point.y - gesture.origin.y };
    state.upload.selection = gesture.handle
      ? resizeObjectSelection(gesture.selection, gesture.handle, delta)
      : clampObjectSelection({ ...gesture.selection, x: gesture.selection.x + delta.x, y: gesture.selection.y + delta.y });
    updateObjectSelectionUi(root);
    event.preventDefault();
  });
  stage.addEventListener('pointerup', finishGesture);
  stage.addEventListener('pointercancel', finishGesture);
}

function bindComparison() {
  const comparison = document.querySelector('#comparison');
  if (!comparison) return;
  const beforeImage = comparison.querySelector('.comparison-before');
  const afterImage = comparison.querySelector('.comparison-after');
  const caption = comparison.closest('.comparison-card')?.querySelector('.ai-caption');
  const status = comparison.querySelector('.comparison-status');

  const syncAspectRatio = () => {
    if (!beforeImage?.naturalWidth || !beforeImage?.naturalHeight) return;
    comparison.style.setProperty('--comparison-aspect', `${beforeImage.naturalWidth} / ${beforeImage.naturalHeight}`);
  };
  if (beforeImage?.complete) syncAspectRatio();
  else beforeImage?.addEventListener('load', syncAspectRatio, { once: true });

  const markUnavailable = (title, detail) => {
    comparison.classList.add('is-unavailable');
    if (status) {
      const heading = status.querySelector('strong');
      const copy = status.querySelector('span:last-child');
      if (heading) heading.textContent = title;
      if (copy) copy.textContent = detail;
    }
    if (caption) {
      caption.classList.add('is-preview');
      caption.textContent = detail;
    }
  };
  beforeImage?.addEventListener('error', () => markUnavailable('원본 이미지를 불러오지 못했어요', '업로드한 원본 파일을 확인한 뒤 다시 분석해주세요.'), { once: true });
  afterImage?.addEventListener('error', () => markUnavailable('변환 이미지를 불러오지 못했어요', 'Gemini 이미지 모델 연결 상태를 확인한 뒤 다시 분석해주세요.'), { once: true });

  const range = comparison.querySelector('#compare-range');
  range?.addEventListener('input', () => comparison.style.setProperty('--position', `${range.value}%`));
}

async function addSelectedToCart() {
  const ids = [...state.selectedProducts];
  if (!ids.length) { notify('추가할 자재를 먼저 선택해주세요.'); return false; }
  await Promise.all(ids.map((materialId) => api('/api/v1/cart', { method: 'POST', body: JSON.stringify({ materialId }) })));
  await ensureCart();
  state.selectedProducts.clear();
  notify(`${ids.length}개 자재를 견적서에 추가했습니다.`);
  return true;
}

async function openCheckout() {
  if (state.selectedProducts.size) await addSelectedToCart();
  await ensureCart();
  state.dialog = { type: 'checkout' };
  document.body.classList.add('modal-open');
  app.innerHTML = location.pathname === '/estimate' ? renderEstimate() : renderMarket();
  bindPage();
}

async function openVersionAnalyze(button) {
  const project = state.project;
  const beforeUrl = project?.beforeUrl || '/assets/generated/room-before.webp';
  if (!project?.id || !beforeUrl) {
    notify('원본 스케치를 찾지 못했습니다. 리포트를 다시 열어주세요.');
    return;
  }
  rememberFocus(button);
  const modal = {
    projectId: project.id,
    beforeUrl,
    baseline: null,
    reference: null,
    loadingBaseline: true,
    baselineError: null,
    submitting: false,
    error: null
  };
  state.versionModal = modal;
  state.dialog = { type: 'version-analyze' };
  document.body.classList.add('modal-open');
  renderDialogContext();
  try {
    modal.baseline = await fetchBeforeImageAsUpload(beforeUrl);
  } catch (error) {
    modal.baselineError = error.message || '원본 스케치를 불러오지 못했습니다.';
  } finally {
    modal.loadingBaseline = false;
    if (state.versionModal === modal && state.dialog?.type === 'version-analyze') renderDialogContext();
  }
}

async function rollbackToBaseline(button) {
  const project = state.project;
  if (!project?.id) return;
  const versionId = state.versionHistory?.projectId === project.id ? state.versionHistory.baselineVersionId : null;
  button.disabled = true;
  try {
    const data = await api(`/api/v1/projects/${encodeURIComponent(project.id)}/rollback`, {
      method: 'POST',
      body: JSON.stringify(versionId ? { versionId } : {})
    });
    replaceProjectInState(data.project);
    notify('원본 스케치 버전으로 되돌렸습니다.');
    if (typeof data.next === 'string' && data.next) {
      navigate(data.next, { replace: true });
      return;
    }
    await loadVersionHistory(project.id);
    renderDialogContext();
  } catch (error) {
    button.disabled = false;
    notify(error.message);
  }
}

async function submitVersionAnalyze() {
  const modal = state.versionModal;
  if (!modal?.projectId || !modal.baseline || !modal.reference || modal.submitting) return;
  modal.submitting = true;
  modal.error = null;
  renderDialogContext();
  try {
    const data = await api(`/api/v1/projects/${encodeURIComponent(modal.projectId)}/versions/analyze`, {
      method: 'POST',
      body: JSON.stringify({ referenceImage: modal.reference.dataUrl })
    });
    replaceProjectInState(data.project);
    state.dialog = null;
    state.versionModal = null;
    document.body.classList.remove('modal-open');
    notify('원본 스케치를 기준으로 새 시뮬레이션을 만들었습니다.');
    if (typeof data.next === 'string' && data.next) {
      navigate(data.next, { replace: true });
      return;
    }
    await loadVersionHistory(modal.projectId);
    renderDialogContext();
    restoreFocus();
  } catch (error) {
    if (state.versionModal === modal) {
      modal.submitting = false;
      modal.error = error.message || '새 시뮬레이션을 만들지 못했습니다.';
      renderDialogContext();
    }
  }
}

async function handleAction(button) {
  const action = button.dataset.action;
  if (!action) return;
  if (action === 'toggle-mobile-menu') { state.mobileMenu = !state.mobileMenu; app.innerHTML = renderLanding(); bindPage(); }
  else if (action === 'start') { const data = await api('/api/v1/landing/start'); navigate(data.next); }
  else if (action === 'toggle-password') { const input = document.getElementById(button.dataset.target); if (input) input.type = input.type === 'password' ? 'text' : 'password'; }
  else if (action === 'forgot') notify('비밀번호 재설정 메일 기능은 인증 서비스 연동 후 활성화됩니다.');
  else if (action === 'social') notify(`${button.dataset.provider} 로그인은 키 연동 후 활성화됩니다.`);
  else if (action === 'demo-login') {
    const data = await api('/api/v1/auth/demo', { method: 'POST', body: '{}' }); resetUserState(); state.user = data.user; notify('테스트 계정으로 로그인했습니다.'); navigate('/dashboard', { replace: true });
  }
  else if (action === 'open-upload' || action === 'new-project' || action === 'retry-project') { rememberFocus(button); if (location.pathname !== '/dashboard') { navigate('/dashboard'); setTimeout(() => { state.uploadOpen = true; document.body.classList.add('modal-open'); app.innerHTML = renderDashboard(); bindPage(); }, 0); } else { state.uploadOpen = true; document.body.classList.add('modal-open'); app.innerHTML = renderDashboard(); bindPage(); } }
  else if (action === 'close-upload') { state.uploadOpen = false; state.analyzing = false; document.body.classList.remove('modal-open'); app.innerHTML = renderDashboard(); bindPage(); restoreFocus(); }
  else if (action === 'backdrop-close') { state.uploadOpen = false; document.body.classList.remove('modal-open'); app.innerHTML = renderDashboard(); bindPage(); restoreFocus(); }
  else if (action === 'analyze') {
    if (!state.upload.current || !state.upload.reference || state.analyzing) return;
    state.analyzing = true; app.innerHTML = renderDashboard(); bindPage();
    try {
      const data = await api('/api/v1/projects/analyze', { method: 'POST', body: JSON.stringify({ currentImage: state.upload.current.dataUrl, referenceImage: state.upload.reference.dataUrl }) });
      state.project = data.project; state.upload = createUploadState(); state.analyzing = false; navigate(data.next);
    } catch (error) { state.analyzing = false; app.innerHTML = renderDashboard(); bindPage(); notify(error.message); }
  }
  else if (action === 'object-material-analyze') {
    const { current, material, targetObject, selection } = state.upload;
    if (!current || !material || state.analyzing) return;
    state.analyzing = true; app.innerHTML = renderDashboard(); bindPage();
    try {
      const maskImage = await createObjectMask(current, selection);
      const data = await api('/api/v1/generate/object-material', {
        method: 'POST',
        body: JSON.stringify({
          sourceImage: current.dataUrl,
          materialImage: material.dataUrl,
          maskImage,
          targetObject,
          selection: selectionToPayload(selection)
        })
      });
      state.project = data.project;
      state.upload = createUploadState();
      state.analyzing = false;
      navigate(data.next || (data.project?.id ? `/reports/${encodeURIComponent(data.project.id)}` : '/projects'));
    } catch (error) { state.analyzing = false; app.innerHTML = renderDashboard(); bindPage(); notify(error.message); }
  }
  else if (action === 'rollback-baseline') await rollbackToBaseline(button);
  else if (action === 'open-version-analyze') await openVersionAnalyze(button);
  else if (action === 'submit-version-analyze') await submitVersionAnalyze();
  else if (action === 'go-market') navigate('/market');
  else if (action === 'back') {
    const previous = history.state?.moinFrom;
    if (typeof previous === 'string' && previous.startsWith('/') && previous !== location.pathname) history.back();
    else navigate('/dashboard', { replace: true });
  }
  else if (action === 'mobile-app-menu') { state.mobileMenu = !state.mobileMenu; await renderRoute(); }
  else if (action === 'print-report' || action === 'print-estimate') { notify('인쇄 창에서 “PDF로 저장”을 선택해주세요.'); setTimeout(() => window.print(), 250); }
  else if (action === 'save-project') {
    if (!state.project) return; await api(`/api/v1/projects/${state.project.id}/save`, { method: 'POST', body: '{}' }); notify('내 프로젝트에 저장했습니다.');
  }
  else if (action === 'ask-delete-project') {
    const project = state.projects.find((item) => item.id === button.dataset.id);
    if (!project) { notify('삭제할 프로젝트를 찾지 못했습니다.'); return; }
    rememberFocus(button);
    state.dialog = { type: 'delete-project', id: project.id };
    document.body.classList.add('modal-open');
    renderDialogContext();
  }
  else if (action === 'confirm-delete-project') {
    const projectId = button.dataset.id;
    const project = state.projects.find((item) => item.id === projectId);
    if (!project) { state.dialog = null; renderDialogContext(); notify('이미 삭제되었거나 찾을 수 없는 프로젝트입니다.'); return; }
    await api(`/api/v1/projects/${encodeURIComponent(projectId)}`, { method: 'DELETE' });
    state.projects = state.projects.filter((item) => item.id !== projectId);
    if (state.project?.id === projectId) state.project = state.projects.find((item) => item.status !== 'failed') || null;
    state.dialog = null;
    document.body.classList.remove('modal-open');
    renderDialogContext();
    restoreFocus();
    notify('프로젝트와 첨부 사진을 삭제했습니다.');
  }
  else if (action === 'set-category') { state.market.category = state.market.category === button.dataset.category ? 'all' : button.dataset.category; app.innerHTML = renderMarket(); bindPage(); }
  else if (action === 'select-product') { const id = button.dataset.id; state.selectedProducts.has(id) ? state.selectedProducts.delete(id) : state.selectedProducts.add(id); app.innerHTML = renderMarket(); bindPage(); }
  else if (action === 'product-detail') { rememberFocus(button); state.dialog = { type: 'product', id: button.dataset.id }; app.innerHTML = renderMarket(); bindPage(); }
  else if (action === 'add-cart') { await api('/api/v1/cart', { method: 'POST', body: JSON.stringify({ materialId: button.dataset.id }) }); await ensureCart(); notify('장바구니에 담았습니다.'); if (state.dialog) { state.dialog = null; app.innerHTML = renderMarket(); bindPage(); restoreFocus(); } }
  else if (action === 'add-estimate') { if (await addSelectedToCart()) { app.innerHTML = renderMarket(); bindPage(); } }
  else if (action === 'checkout' || action === 'open-cart') { rememberFocus(button); await openCheckout(); }
  else if (action === 'close-dialog') { state.dialog = null; state.versionModal = null; document.body.classList.remove('modal-open'); renderDialogContext(); restoreFocus(); }
  else if (action === 'cart-increase' || action === 'cart-decrease') {
    const item = state.cart.find((entry) => entry.cartId === button.dataset.id);
    if (!item) return;
    const quantity = Math.max(1, Math.min(99, item.quantity + (action === 'cart-increase' ? 1 : -1)));
    const data = await api(`/api/v1/cart/items/${item.cartId}`, { method: 'PATCH', body: JSON.stringify({ quantity }) });
    state.cart = data.items; app.innerHTML = location.pathname === '/estimate' ? renderEstimate() : renderMarket(); bindPage();
  }
  else if (action === 'cart-remove') {
    const data = await api(`/api/v1/cart/items/${button.dataset.id}`, { method: 'DELETE' });
    state.cart = data.items; app.innerHTML = location.pathname === '/estimate' ? renderEstimate() : renderMarket(); bindPage();
  }
  else if (action === 'confirm-order') { const data = await api('/api/v1/orders', { method: 'POST', body: '{}' }); state.cart = []; state.selectedProducts.clear(); state.dialog = null; state.focusReturnSelector = null; document.body.classList.remove('modal-open'); notify(`주문이 완료되었습니다. (${money.format(data.order.total)}원)`); if (location.pathname === '/market') { app.innerHTML = renderMarket(); bindPage(); } else navigate('/market', { replace: true }); }
  else if (action === 'market-guide') notify('상품을 선택한 뒤 견적서 추가 또는 결제를 진행할 수 있어요.');
  else if (action === 'logout') { await api('/api/v1/auth/logout', { method: 'POST', body: '{}' }); resetUserState(); state.user = null; navigate('/'); }
  else if (action === 'privacy') notify('설정 화면은 Supabase 인증 연동 후 활성화됩니다.');
  else if (action === 'notifications') navigate('/notifications');
  else if (action === 'retry') renderRoute();
}

function bindPage() {
  const loginForm = document.querySelector('#login-form');
  loginForm?.addEventListener('submit', async (event) => {
    event.preventDefault(); const errorBox = document.querySelector('#auth-error'); errorBox.textContent = '';
    const form = new FormData(loginForm);
    try { const data = await api('/api/v1/auth/login', { method: 'POST', body: JSON.stringify({ email: form.get('email'), password: form.get('password'), remember: Boolean(form.get('remember')) }) }); resetUserState(); state.user = data.user; navigate('/dashboard', { replace: true }); }
    catch (error) { errorBox.textContent = error.message; }
  });
  const signupForm = document.querySelector('#signup-form');
  signupForm?.addEventListener('submit', async (event) => {
    event.preventDefault(); const form = new FormData(signupForm); const errorBox = document.querySelector('#auth-error'); errorBox.textContent = '';
    if (form.get('password') !== form.get('confirm')) { errorBox.textContent = '비밀번호 확인이 일치하지 않습니다.'; return; }
    try { await api('/api/v1/auth/signup', { method: 'POST', body: JSON.stringify({ name: form.get('name'), email: form.get('email'), password: form.get('password'), terms: Boolean(form.get('terms') && form.get('privacy')) }) }); notify('회원가입이 완료되었습니다. 로그인해주세요.'); navigate('/login'); }
    catch (error) { errorBox.textContent = error.message; }
  });
  document.querySelector('#all-terms')?.addEventListener('change', (event) => document.querySelectorAll('.terms-box input').forEach((input) => { input.checked = event.target.checked; }));
  document.querySelectorAll('[data-upload-mode]').forEach((input) => input.addEventListener('change', () => {
    if (!input.checked) return;
    state.upload.mode = input.value;
    state.analyzing = false;
    app.innerHTML = renderDashboard();
    bindPage();
  }));
  document.querySelectorAll('[data-upload]').forEach((input) => input.addEventListener('change', async () => {
    try { await setUploadFile(input.dataset.upload, input.files[0]); app.innerHTML = renderDashboard(); bindPage(); }
    catch (error) { notify(error.message); }
  }));
  document.querySelectorAll('[data-drop]').forEach((zone) => {
    for (const type of ['dragenter','dragover']) zone.addEventListener(type, (event) => { event.preventDefault(); zone.classList.add('dragging'); });
    for (const type of ['dragleave','drop']) zone.addEventListener(type, (event) => { event.preventDefault(); zone.classList.remove('dragging'); });
    zone.addEventListener('drop', async (event) => { try { await setUploadFile(zone.dataset.drop, event.dataTransfer.files[0]); app.innerHTML = renderDashboard(); bindPage(); } catch (error) { notify(error.message); } });
  });
  document.querySelectorAll('[data-version-reference]').forEach((input) => input.addEventListener('change', async () => {
    const modal = state.versionModal;
    if (!modal) return;
    try {
      modal.reference = await readFile(input.files[0]);
      modal.error = null;
      if (state.versionModal === modal) renderDialogContext();
    } catch (error) { notify(error.message); }
  }));
  document.querySelectorAll('[data-version-reference-drop]').forEach((zone) => {
    for (const type of ['dragenter', 'dragover']) zone.addEventListener(type, (event) => { event.preventDefault(); zone.classList.add('dragging'); });
    for (const type of ['dragleave', 'drop']) zone.addEventListener(type, (event) => { event.preventDefault(); zone.classList.remove('dragging'); });
    zone.addEventListener('drop', async (event) => {
      const modal = state.versionModal;
      if (!modal) return;
      try {
        modal.reference = await readFile(event.dataTransfer.files[0]);
        modal.error = null;
        if (state.versionModal === modal) renderDialogContext();
      } catch (error) { notify(error.message); }
    });
  });
  bindObjectSelection();
  bindComparison();
  document.querySelectorAll('[data-category]').forEach((input) => input.addEventListener('change', () => { state.market.category = input.dataset.category; app.innerHTML = renderMarket(); bindPage(); }));
  document.querySelector('[data-price-range]')?.addEventListener('input', (event) => { state.market.maxPrice = Number(event.target.value); const output = document.querySelector('[data-range-output]'); if (output) output.textContent = `${money.format(state.market.maxPrice)}원`; refreshProductGrid(); });
  document.querySelector('#market-search')?.addEventListener('input', (event) => { state.market.query = event.target.value; refreshProductGrid(); });
  const modal = document.querySelector('[data-modal]');
  if (modal) requestAnimationFrame(() => (modal.querySelector('button, input, [tabindex]') || modal).focus());
}

app.addEventListener('click', async (event) => {
  const link = event.target.closest('[data-link]');
  if (link) { event.preventDefault(); navigate(new URL(link.href, location.origin).pathname); return; }
  const action = event.target.closest('[data-action]');
  if (action) {
    if ((action.dataset.action === 'backdrop-close' || action.dataset.action === 'dialog-backdrop') && event.target !== action) return;
    try {
      if (action.dataset.action === 'dialog-backdrop') { state.dialog = null; state.versionModal = null; document.body.classList.remove('modal-open'); renderDialogContext(); restoreFocus(); return; }
      await handleAction(action);
    } catch (error) { notify(error.message); }
  }
});

window.addEventListener('popstate', renderRoute);
window.addEventListener('keydown', (event) => {
  const modal = document.querySelector('[data-modal]');
  if (event.key === 'Tab' && modal) {
    const focusable = [...modal.querySelectorAll('button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')].filter((element) => element.offsetParent !== null);
    if (focusable.length) {
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    return;
  }
  if (event.key !== 'Escape') return;
  if (state.uploadOpen) { state.uploadOpen = false; document.body.classList.remove('modal-open'); app.innerHTML = renderDashboard(); bindPage(); restoreFocus(); }
  else if (state.dialog) { state.dialog = null; state.versionModal = null; document.body.classList.remove('modal-open'); renderDialogContext(); restoreFocus(); }
});

async function boot() {
  if (!history.state?.moin) history.replaceState({ ...(history.state || {}), moin: true, moinFrom: null }, '', location.href);
  try { state.user = (await api('/api/v1/auth/me')).user; }
  catch { state.user = null; }
  renderRoute();
}

boot();
