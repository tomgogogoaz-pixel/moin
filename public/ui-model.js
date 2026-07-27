export const ANONYMOUS_NAV = Object.freeze([
  Object.freeze({ href: '/', key: 'home', label: 'Home' }),
  Object.freeze({ href: '/login', key: 'login', label: 'Login' })
]);

export const AUTHENTICATED_NAV = Object.freeze([
  Object.freeze({ href: '/dashboard', key: 'home', label: 'Home' }),
  Object.freeze({ href: '/projects', key: 'myproject', label: 'My Project' }),
  Object.freeze({ href: '/estimate', key: 'estimate', label: 'Estimation' }),
  Object.freeze({ href: '/mypage', key: 'mypage', label: 'My Page' })
]);

export const DASHBOARD_SECTION_ORDER = Object.freeze([
  'welcome',
  'new-project',
  'recent-projects',
  'ai',
  'materials',
  'tools'
]);

export function selectRecentProjects(projects) {
  if (!Array.isArray(projects)) return [];
  return projects
    .filter((project) => project && typeof project === 'object')
    .slice()
    .sort((left, right) => {
      const leftTime = Date.parse(left.updatedAt || left.createdAt || '') || 0;
      const rightTime = Date.parse(right.updatedAt || right.createdAt || '') || 0;
      return rightTime - leftTime;
    })
    .slice(0, 3);
}
