export interface AdminNavigationItem {
  href: string;
  label: string;
}

export const adminNavigationItems: readonly AdminNavigationItem[] = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/candidates', label: 'Candidates' },
  { href: '/admin/claims', label: 'Claims' },
  { href: '/admin/evidence', label: 'Evidence' },
  { href: '/admin/rechecks', label: 'Rechecks' },
  { href: '/admin/submissions', label: 'Submissions' },
  { href: '/admin/media', label: 'Media' },
  { href: '/admin/exports', label: 'Exports' },
  { href: '/admin/audit', label: 'Audit' },
];

export function normalizeAdminPathname(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, '');
  return normalized.length === 0 ? '/' : normalized;
}

export function isAdminNavigationItemActive(pathname: string, href: string): boolean {
  const normalizedPathname = normalizeAdminPathname(pathname);
  const normalizedHref = normalizeAdminPathname(href);
  if (normalizedHref === '/admin') return normalizedPathname === '/admin';
  return (
    normalizedPathname === normalizedHref || normalizedPathname.startsWith(`${normalizedHref}/`)
  );
}
