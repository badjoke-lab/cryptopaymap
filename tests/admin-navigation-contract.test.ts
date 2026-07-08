import { describe, expect, it } from 'vitest';
import {
  adminNavigationItems,
  isAdminNavigationItemActive,
  normalizeAdminPathname,
} from '../src/admin/navigation';

describe('Admin navigation contract', () => {
  it('keeps one unique entry for every top-level operator or future boundary', () => {
    const hrefs = adminNavigationItems.map((item) => item.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(hrefs).toEqual([
      '/admin',
      '/admin/candidates',
      '/admin/claims',
      '/admin/evidence',
      '/admin/rechecks',
      '/admin/submissions',
      '/admin/media',
      '/admin/exports',
      '/admin/audit',
    ]);
  });

  it('keeps the owning section active on nested operator routes', () => {
    expect(isAdminNavigationItemActive('/admin/candidates/detail/', '/admin/candidates')).toBe(
      true,
    );
    expect(
      isAdminNavigationItemActive('/admin/candidates/location-correction', '/admin/candidates'),
    ).toBe(true);
    expect(isAdminNavigationItemActive('/admin/evidence/detail/', '/admin/evidence')).toBe(true);
    expect(isAdminNavigationItemActive('/admin/rechecks/detail/', '/admin/rechecks')).toBe(true);
    expect(isAdminNavigationItemActive('/admin/media/detail/', '/admin/media')).toBe(true);
    expect(isAdminNavigationItemActive('/admin/exports/detail/', '/admin/exports')).toBe(true);
  });

  it('does not mark Overview active for every Admin route', () => {
    expect(isAdminNavigationItemActive('/admin', '/admin')).toBe(true);
    expect(isAdminNavigationItemActive('/admin/', '/admin')).toBe(true);
    expect(isAdminNavigationItemActive('/admin/evidence', '/admin')).toBe(false);
    expect(normalizeAdminPathname('/admin/evidence///')).toBe('/admin/evidence');
  });
});
