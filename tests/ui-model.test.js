import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANONYMOUS_NAV,
  AUTHENTICATED_NAV,
  DASHBOARD_SECTION_ORDER,
  MATERIAL_SELECTION_TOOLS,
  normalizeMaterialSelectionTool,
  selectRecentProjects
} from '../public/ui-model.js';

test('anonymous navigation only exposes Home and Login', () => {
  assert.deepEqual(ANONYMOUS_NAV.map(({ href, label }) => ({ href, label })), [
    { href: '/', label: 'Home' },
    { href: '/login', label: 'Login' }
  ]);
});

test('authenticated navigation follows the requested product order', () => {
  assert.deepEqual(AUTHENTICATED_NAV.map(({ href, label }) => ({ href, label })), [
    { href: '/dashboard', label: 'Home' },
    { href: '/projects', label: 'My Project' },
    { href: '/estimate', label: 'Estimation' },
    { href: '/mypage', label: 'My Page' }
  ]);
});

test('dashboard sections and recent projects are deterministic', () => {
  assert.deepEqual(DASHBOARD_SECTION_ORDER, [
    'welcome',
    'new-project',
    'recent-projects',
    'ai',
    'materials',
    'tools'
  ]);
  const projects = [
    { id: 'old', updatedAt: '2026-01-01T00:00:00.000Z' },
    { id: 'newest', updatedAt: '2026-04-01T00:00:00.000Z' },
    { id: 'third', updatedAt: '2026-02-01T00:00:00.000Z' },
    { id: 'second', updatedAt: '2026-03-01T00:00:00.000Z' }
  ];
  assert.deepEqual(selectRecentProjects(projects).map(({ id }) => id), ['newest', 'second', 'third']);
});

test('material selection exposes the Photoshop-style tool set and preserves the polygon lasso', () => {
  assert.deepEqual(MATERIAL_SELECTION_TOOLS.map(({ id, label }) => ({ id, label })), [
    { id: 'object-select', label: '객체 선택 도구' },
    { id: 'quick-select', label: '빠른 선택 도구' },
    { id: 'magic-wand', label: '마술봉 도구' },
    { id: 'lasso', label: '다각형 올가미 (점 연결)' }
  ]);
  assert.equal(normalizeMaterialSelectionTool('freehand'), 'quick-select');
  assert.equal(normalizeMaterialSelectionTool('unknown'), 'object-select');
});
