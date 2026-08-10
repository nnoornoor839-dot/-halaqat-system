import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: profile } = await supabase
    .from('users')
    .select('name, role, branch_id')
    .eq('id', user.id)
    .single();

  const { data: halaqat } = await supabase.from('halaqat').select('name');
  const { data: students } = await supabase.from('students').select('name');

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-md border border-slate-200 p-8">
        <h1 className="text-2xl font-bold text-slate-800 mb-6">لوحة تحكم نظام الحلقات</h1>

        {profile ? (
          <div className="flex flex-col gap-2 text-lg">
            <p>
              <span className="font-bold text-slate-600">الاسم: </span>
              {profile.name}
            </p>
            <p>
              <span className="font-bold text-slate-600">الدور: </span>
              {profile.role}
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

        <form action="/api/logout" method="post" className="mt-8">
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
