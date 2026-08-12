import { requireUser, canAccess } from '@/lib/auth';
import { ASSOCIATION_NAME } from '@/lib/association';
import { NAV_LINKS, ROLE_LABELS } from '@/lib/nav';

export default async function DashboardPage({ searchParams }) {
  const params = await searchParams;
  const { supabase, profile } = await requireUser();

  const [{ data: halaqat }, { data: students }] = await Promise.all([
    supabase.from('halaqat').select('name'),
    supabase.from('students').select('name'),
  ]);

  const visibleLinks = profile ? NAV_LINKS.filter((l) => canAccess(profile.role, l.page)) : [];

  return (
    <div className="p-6 sm:p-8">
      <div className="max-w-3xl mx-auto flex flex-col gap-6">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt={ASSOCIATION_NAME} className="h-16 w-auto shrink-0" />
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-800">نظام الحلقات</h1>
            <p className="text-slate-400 text-sm">{ASSOCIATION_NAME}</p>
          </div>
        </div>

        {params?.denied && (
          <p className="text-amber-800 text-sm bg-amber-50 border border-amber-200 rounded-xl p-3">
            هذي الصفحة خارج صلاحيات حسابك.
          </p>
        )}

        {profile ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-xs text-slate-400 mb-1">الاسم</p>
                <p className="font-bold text-slate-800">{profile.name}</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-xs text-slate-400 mb-1">الدور</p>
                <p className="font-bold text-slate-800">
                  {ROLE_LABELS[profile.role] ?? profile.role}
                </p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-xs text-slate-400 mb-1">الحلقات</p>
                <p className="font-bold text-brand-700 text-xl">{halaqat?.length ?? 0}</p>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-4">
                <p className="text-xs text-slate-400 mb-1">الطلاب</p>
                <p className="font-bold text-brand-700 text-xl">{students?.length ?? 0}</p>
              </div>
            </div>

            <div>
              <h2 className="font-bold text-slate-500 text-sm mb-3">الأقسام</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {visibleLinks.map((l) => (
                  <a
                    key={l.href}
                    href={l.href}
                    className="bg-white rounded-xl border border-slate-200 hover:border-brand-500 hover:shadow-sm p-4 font-bold text-slate-700 transition flex items-center justify-between gap-2"
                  >
                    <span>{l.label}</span>
                    <span className="text-brand-600">←</span>
                  </a>
                ))}
              </div>
            </div>
          </>
        ) : (
          <p className="text-red-600 bg-white rounded-xl border border-red-200 p-4">
            تسجيل الدخول نجح، لكن ما فيه ملف شخصي مرتبط بهذا الحساب بجدول users.
          </p>
        )}
      </div>
    </div>
  );
}
