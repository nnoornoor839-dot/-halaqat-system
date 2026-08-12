import { requireUser, canAccess } from '@/lib/auth';

const ROLE_LABELS = {
  teacher: 'معلم',
  supervisor: 'مشرف',
  admin: 'مدير تنفيذي',
};

// الروابط تُبنى من نفس مصدر الصلاحيات المستخدم لحماية الصفحات، فلا يظهر
// للمستخدم رابط لصفحة سيُمنع منها.
const LINKS = [
  { page: 'teacher', href: '/teacher', label: 'تحضير اليوم', color: 'bg-emerald-600 hover:bg-emerald-700' },
  { page: 'review', href: '/review', label: 'المراجعة', color: 'bg-sky-600 hover:bg-sky-700' },
  { page: 'overview', href: '/overview', label: 'نظرة عامة', color: 'bg-indigo-600 hover:bg-indigo-700' },
  { page: 'levels', href: '/levels', label: 'المستويات والاختبارات', color: 'bg-rose-600 hover:bg-rose-700' },
  { page: 'tickets', href: '/tickets', label: 'تذاكر الترفيه', color: 'bg-amber-500 hover:bg-amber-600' },
  { page: 'screen', href: '/screen', label: 'شاشة العرض الدوارة', color: 'bg-slate-800 hover:bg-slate-900' },
  { page: 'messages', href: '/messages', label: 'رسائل اليوم', color: 'bg-green-600 hover:bg-green-700' },
  { page: 'finance', href: '/finance', label: 'حاسبة الميزانية', color: 'bg-teal-600 hover:bg-teal-700' },
  { page: 'executive', href: '/executive', label: 'لوحة القيادة', color: 'bg-purple-700 hover:bg-purple-800' },
];

export default async function DashboardPage({ searchParams }) {
  const params = await searchParams;
  const { supabase, profile } = await requireUser();

  const [{ data: halaqat }, { data: students }] = await Promise.all([
    supabase.from('halaqat').select('name'),
    supabase.from('students').select('name'),
  ]);

  const visibleLinks = profile ? LINKS.filter((l) => canAccess(profile.role, l.page)) : [];

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-md border border-slate-200 p-8">
        <h1 className="text-2xl font-bold text-slate-800 mb-6">لوحة تحكم نظام الحلقات</h1>

        {params?.denied && (
          <p className="text-amber-800 text-sm bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
            هذي الصفحة خارج صلاحيات حسابك.
          </p>
        )}

        {profile ? (
          <div className="flex flex-col gap-2 text-lg">
            <p>
              <span className="font-bold text-slate-600">الاسم: </span>
              {profile.name}
            </p>
            <p>
              <span className="font-bold text-slate-600">الدور: </span>
              {ROLE_LABELS[profile.role] ?? profile.role}
            </p>
            <p>
              <span className="font-bold text-slate-600">الفرع: </span>
              {profile.branch_id ?? 'كل الفروع (مدير)'}
            </p>

            <hr className="my-4" />

            <p className="font-bold text-slate-600">
              الحلقات اللي تقدر تشوفها ({halaqat?.length ?? 0}):
            </p>
            <ul className="list-disc pr-6">
              {halaqat?.map((h, i) => <li key={i}>{h.name}</li>)}
            </ul>

            <p className="font-bold text-slate-600 mt-3">
              الطلاب اللي تقدر تشوفهم ({students?.length ?? 0}):
            </p>
            <ul className="list-disc pr-6">
              {students?.map((s, i) => <li key={i}>{s.name}</li>)}
            </ul>
          </div>
        ) : (
          <p className="text-red-600">
            تسجيل الدخول نجح، لكن ما فيه ملف شخصي مرتبط بهذا الحساب بجدول users.
          </p>
        )}

        <div className="flex flex-wrap gap-3 mt-8">
          {visibleLinks.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className={`inline-block ${l.color} text-white font-bold rounded-lg px-5 py-2.5 transition`}
            >
              {l.label} ←
            </a>
          ))}
        </div>

        <form action="/api/logout" method="post" className="mt-4">
          <LogoutButton />
        </form>
      </div>
    </div>
  );
}

function LogoutButton() {
  return (
    <button
      formAction="/api/logout"
      className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg px-4 py-2 transition"
    >
      تسجيل الخروج
    </button>
  );
}
