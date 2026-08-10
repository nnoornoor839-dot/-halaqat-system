import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

async function markAttendance(formData) {
  'use server';
  const studentId = formData.get('studentId');
  const attended = formData.get('attended') === 'true';
  const early = formData.get('early') === 'true';
  const today = new Date().toISOString().slice(0, 10);

  const supabase = await createClient();
  const { error } = await supabase.from('attendance').upsert(
    { student_id: studentId, date: today, attended, early_arrival: early },
    { onConflict: 'student_id,date' }
  );

  revalidatePath('/teacher');

  if (error) {
    redirect('/teacher?error=1');
  }
}

export default async function TeacherPage({ searchParams }) {
  const params = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const today = new Date().toISOString().slice(0, 10);

  const { data: students } = await supabase.from('students').select('id, name').order('name');
  const { data: todayAttendance } = await supabase
    .from('attendance')
    .select('student_id, attended, early_arrival')
    .eq('date', today);

  const attendanceMap = new Map(
    (todayAttendance ?? []).map((a) => [a.student_id, a])
  );

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-md border border-slate-200 p-8">
        <h1 className="text-2xl font-bold text-slate-800 mb-1">تحضير اليوم</h1>
        <p className="text-slate-500 mb-6">{today}</p>

        {params?.error && (
          <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            صار خطأ أثناء الحفظ، حاول مرة ثانية.
          </p>
        )}

        <div className="flex flex-col gap-3">
          {students?.map((s) => {
            const status = attendanceMap.get(s.id);
            const isAbsent = status?.attended === false;
            const isPresent = status?.attended === true && !status?.early_arrival;
            const isEarly = status?.attended === true && status?.early_arrival === true;
            return (
              <div
                key={s.id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border border-slate-200 rounded-xl p-3"
              >
                <span className="font-bold text-slate-700">{s.name}</span>
                <div className="flex flex-wrap gap-2">
                  <form action={markAttendance}>
                    <input type="hidden" name="studentId" value={s.id} />
                    <input type="hidden" name="attended" value="true" />
                    <input type="hidden" name="early" value="true" />
                    <button
                      className={`px-4 py-1.5 rounded-lg font-bold text-sm transition ${
                        isEarly
                          ? 'bg-amber-500 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      حاضر مبكراً
                    </button>
                  </form>
                  <form action={markAttendance}>
                    <input type="hidden" name="studentId" value={s.id} />
                    <input type="hidden" name="attended" value="true" />
                    <input type="hidden" name="early" value="false" />
                    <button
                      className={`px-4 py-1.5 rounded-lg font-bold text-sm transition ${
                        isPresent
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      حاضر
                    </button>
                  </form>
                  <form action={markAttendance}>
                    <input type="hidden" name="studentId" value={s.id} />
                    <input type="hidden" name="attended" value="false" />
                    <input type="hidden" name="early" value="false" />
                    <button
                      className={`px-4 py-1.5 rounded-lg font-bold text-sm transition ${
                        isAbsent
                          ? 'bg-red-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      غائب
                    </button>
                  </form>
                  <a
                    href={`/teacher/sard?studentId=${s.id}`}
                    className="px-4 py-1.5 rounded-lg font-bold text-sm bg-blue-50 text-blue-700 hover:bg-blue-100 transition"
                  >
                    تسجيل سرد
                  </a>
                </div>
              </div>
            );
          })}

          {(!students || students.length === 0) && (
            <p className="text-slate-400">ما فيه طلاب مرتبطين بحسابك.</p>
          )}
        </div>

        <a href="/dashboard" className="inline-block mt-8 text-emerald-700 font-bold">
          ← رجوع للوحة التحكم
        </a>
      </div>
    </div>
  );
}
