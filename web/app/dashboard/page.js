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

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('name, role, branch_id')
    .eq('id', user.id)
    .single();

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
          </div>
        ) : (
          <div className="text-red-600 flex flex-col gap-2">
            <p>تسجيل الدخول نجح، لكن ما فيه ملف شخصي مرتبط بهذا الحساب بجدول users.</p>
            <p className="text-sm bg-red-50 border border-red-200 rounded-lg p-3 font-mono break-words">
              معرّف المستخدم الحالي (auth.uid): {user.id}
              <br />
              رسالة الخطأ الفعلية: {profileError?.message || 'لا يوجد خطأ، بس ما رجع صف'}
              <br />
              كود الخطأ: {profileError?.code || 'لا يوجد'}
            </p>
          </div>
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
