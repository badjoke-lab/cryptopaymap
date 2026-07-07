import { Menu, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

const navigation = [
  { href: '/places', label: 'Places' },
  { href: '/online', label: 'Online Services' },
  { href: '/stats', label: 'Stats' },
  { href: '/updates', label: 'Updates' },
  { href: '/contribute', label: 'Contribute' },
  { href: '/support', label: 'Support' },
];

const focusableSelector = 'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';

interface MobileSiteMenuProps {
  pathname: string;
}

export function MobileSiteMenu({ pathname }: MobileSiteMenuProps) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;

      const menu = menuRef.current;
      if (!menu) return;
      const focusable = [...menu.querySelectorAll<HTMLElement>(focusableSelector)].filter(
        (element) => element.tabIndex >= 0,
      );
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        closeButtonRef.current?.focus();
        return;
      }

      const activeElement = document.activeElement;
      const focusOutsideMenu = !activeElement || !menu.contains(activeElement);
      if (event.shiftKey && (activeElement === first || focusOutsideMenu)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (activeElement === last || focusOutsideMenu)) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
      triggerRef.current?.focus();
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        ref={triggerRef}
        className="motion-feedback inline-flex min-h-11 items-center gap-2 rounded-control border border-border bg-surface px-3 text-sm font-semibold text-ink shadow-sm"
        type="button"
        aria-expanded={open}
        aria-controls="mobile-primary-menu"
        onClick={() => setOpen(true)}
      >
        <Menu className="size-5" aria-hidden="true" />
        Menu
      </button>

      <button
        className={`fixed inset-0 z-[80] bg-ink/35 transition-opacity duration-normal motion-reduce:transition-none ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        type="button"
        aria-label="Close menu"
        aria-hidden={!open}
        tabIndex={-1}
        onClick={() => setOpen(false)}
      />

      <aside
        ref={menuRef}
        id="mobile-primary-menu"
        className={`fixed right-0 top-0 z-[90] flex h-dvh w-[min(88vw,22.5rem)] flex-col bg-surface shadow-panel transition-transform duration-normal motion-reduce:transition-none ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-label="Mobile primary"
        aria-hidden={!open}
        inert={!open}
      >
        <div className="flex min-h-14 items-center justify-between border-b border-border px-4">
          <span className="font-semibold text-ink">Menu</span>
          <button
            ref={closeButtonRef}
            className="motion-feedback flex size-11 items-center justify-center rounded-control text-muted hover:bg-canvas"
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>

        <nav className="min-h-0 flex-1 overflow-y-auto p-3" aria-label="Mobile primary links">
          <ul className="grid gap-1">
            {navigation.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <a
                    className={`motion-feedback flex min-h-12 items-center rounded-control px-3 py-2 text-sm font-medium no-underline transition-colors ${
                      active
                        ? 'bg-brand-50 text-brand-800'
                        : 'text-muted hover:bg-canvas hover:text-ink'
                    }`}
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>
    </div>
  );
}
