'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/', label: 'Overview', icon: '◈' },
  { href: '/projects', label: 'Projects', icon: '◇' },
  { href: '/search', label: 'Search', icon: '⌕' },
  { href: '/timeline', label: 'Timeline', icon: '◎' },
  { href: '/review', label: 'Review', icon: '✓' },
  { href: '/sync', label: 'Sync', icon: '⇄' },
  { href: '/analytics', label: 'Analytics', icon: '▤' },
  { href: '/templates', label: 'Templates', icon: '▧' },
  { href: '/settings', label: 'Settings', icon: '⚙' },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-56 min-h-screen border-r border-[var(--border)] bg-[var(--surface)] flex flex-col">
      <div className="p-5 border-b border-[var(--border)]">
        <h1 className="font-serif text-xl font-bold text-[var(--text)]">
          C<span className="text-[var(--accent)]">●</span>rtex
        </h1>
        <p className="text-[10px] text-[var(--text3)] mt-1 tracking-wider uppercase">Memory Dashboard</p>
      </div>

      <nav className="flex-1 py-3">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-5 py-2.5 text-sm transition-colors ${
                isActive
                  ? 'text-[var(--accent2)] bg-[rgba(124,111,224,0.08)] border-l-2 border-[var(--accent)]'
                  : 'text-[var(--text2)] hover:text-[var(--text)] hover:bg-[var(--surface2)]'
              }`}
            >
              <span className="text-base w-5 text-center">{item.icon}</span>
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-[var(--border)]">
        <p className="text-[10px] text-[var(--text3)]">Cortex v1.0.0</p>
      </div>
    </aside>
  );
}
