'use client';

import { usePathname } from 'next/navigation';

// شاشة العرض الدوارة تُعرض على تلفزيون بملء الشاشة، فلا شريط تنقّل فيها.
const BARE_PATHS = ['/screen', '/login'];

export default function AppNav({ links, userName, roleLabel }) {
  const pathname = usePathname();

  if (BARE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return null;
  }

  return (
    <header className="no-print sticky top-0 z-40 bg-white border-b border-slate-200 shadow-sm print:hidden">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex items-center justify-between gap-3 py-2.5">
          <a href="/dashboard" className="flex items-center gap-2.5 shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="نظام الحلقات" className="h-9 w-auto" />
          </a>

          <div className="text-left shrink-0">
            <p className="text-sm font-bold text-slate-700 leading-tight">{userName}</p>
            <form action="/api/logout" method="post" className="leading-none">
              <button
                formAction="/api/logout"
                className="text-xs text-slate-400 hover:text-red-600 transition"
              >
                {roleLabel} · خروج
              </button>
            </form>
          </div>
        </div>

        {/* تمرير أفقي على الجوال بدل التفاف الروابط في أسطر متعددة */}
        <nav className="flex gap-1 overflow-x-auto pb-2 -mb-px">
          {links.map((l) => {
            const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
            return (
              <a
                key={l.href}
                href={l.href}
                className={`whitespace-nowrap px-3 py-1.5 rounded-lg text-sm font-bold transition ${
                  active
                    ? 'bg-brand-600 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {l.label}
              </a>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
