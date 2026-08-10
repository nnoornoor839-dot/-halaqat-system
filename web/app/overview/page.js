import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { computeProgress } from '@/lib/quran-coverage';

export default async function OverviewPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const today = new Date().toISOString().slice(0, 10);

  const { data: students } = await supabase
    .from('students')
    .select('id, name, halaqat(name)')
    .order('name');

  const studentIds = (students ?? []).map((s) => s.id);

  const { data: todayAttendance } = await supabase
    .from('attendance')
    .select('student_id, attended, early_arrival')
    .eq('date', today)
    .in('student_id', studentIds.length ? studentIds : [-1]);

  const { data: levels } = await supabase
    .from('student_levels')
    .select('student_id, target_start_surah, target_start_ayah, target_end_surah, target_end_ayah')
    .in('student_id', studentIds.length ? studentIds : [-1]);

  const { data: allRecords } = await supabase
    .from('daily_records')
    .select('student_id, start_surah, start_ayah, end_surah, end_ayah')
    .in('student_id', studentIds.length ? studentIds : [-1]);

  const { data: milestones } = await supabase
    .from('milestone_log')
    .select('student_id, milestone_percent')
    .in('student_id', studentIds.length ? studentIds : [-1]);

  const attendanceMap = new Map((todayAttendance ?? []).map((a) => [a.student_id, a]));
  const levelMap = new Map((levels ?? []).map((l) => [l.student_id, l]));
  const recordsMap = new Map();
  for (const r of allRecords ?? []) {
    if (!recordsMap.has(r.student_id)) recordsMap.set(r.student_id, []);
    recordsMap.get(r.student_id).push(r);
  }
  const milestonesMap = new Map();
  for (const m of milestones ?? []) {
    if (!milestonesMap.has(m.student_id)) milestonesMap.set(m.student_id, []);
    milestonesMap.get(m.student_id).push(m.milestone_percent);
  }

  function attendanceLabel(status) {
    if (!status) return { text: 'لم يُسجَّل بعد', color: 'text-slate-400' };
    if (status.attended && status.early_arrival) return { text: 'حاضر مبكراً', color: 'text-amber-600' };
    if (status.attended) return { text: 'حاضر', color: 'text-emerald-600' };
    return { text: 'غائب', color: 'text-red-600' };
  }

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-4xl mx-auto bg-white rounded-2xl shadow-md border border-slate-200 p-8">
        <h1 className="text-2xl font-bold text-slate-800 mb-1">نظرة عامة</h1>
        <p className="text-slate-500 mb-6">{today}</p>

        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-200 text-slate-600 text-sm">
                <th className="py-2 px-2">الطالب</th>
                <th className="py-2 px-2">الحلقة</th>
                <th className="py-2 px-2">حضور اليوم</th>
                <th className="py-2 px-2">التقدم</th>
                <th className="py-2 px-2">المحطات</th>
              </tr>
            </thead>
            <tbody>
              {students?.map((s) => {
                const status = attendanceMap.get(s.id);
                const att = attendanceLabel(status);
                const level = levelMap.get(s.id);
                const progress = level ? computeProgress(level, recordsMap.get(s.id) ?? []) : null;
                const achieved = (milestonesMap.get(s.id) ?? []).sort((a, b) => a - b);

                return (
                  <tr key={s.id} className="border-b border-slate-100">
                    <td className="py-3 px-2 font-bold text-slate-700">{s.name}</td>
                    <td className="py-3 px-2 text-slate-500">{s.halaqat?.name ?? '—'}</td>
                    <td className={`py-3 px-2 font-bold ${att.color}`}>{att.text}</td>
                    <td className="py-3 px-2">
                      {progress ? (
                        <div className="w-32">
                          <div className="flex justify-between text-xs text-slate-500 mb-0.5">
                            <span>{progress.percent}%</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500"
                              style={{ width: `${progress.percent}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-sm">بلا هدف محدد</span>
                      )}
                    </td>
                    <td className="py-3 px-2">
                      {achieved.map((m) => (
                        <span key={m} title={`${m}%`}>
                          {m === 100 ? '🏆' : '🏅'}
                        </span>
                      ))}
                    </td>
                  </tr>
                );
              })}

              {(!students || students.length === 0) && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-slate-400">
                    ما فيه طلاب مرتبطين بحسابك.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <a href="/dashboard" className="inline-block mt-8 text-emerald-700 font-bold">
          ← رجوع للوحة التحكم
        </a>
      </div>
    </div>
  );
}
