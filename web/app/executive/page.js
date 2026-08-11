import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { rangeToAyahSet } from '@/lib/quran-coverage';

export default async function ExecutivePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const [
    { data: students },
    { data: halaqat },
    { data: allRecords },
    { data: allAttendance },
    { data: financialRequests },
  ] = await Promise.all([
    supabase.from('students').select('id'),
    supabase.from('halaqat').select('id'),
    supabase.from('daily_records').select('student_id, start_surah, start_ayah, end_surah, end_ayah'),
    supabase.from('attendance').select('attended'),
    supabase.from('financial_requests').select('total_amount'),
  ]);

  // إجمالي الآيات المحفوظة (فريدة لكل طالب، بلا تكرار — نفس فلسفة quranEngine.js)
  const coverageByStudent = new Map();
  for (const r of allRecords ?? []) {
    if (!coverageByStudent.has(r.student_id)) coverageByStudent.set(r.student_id, new Set());
    const set = coverageByStudent.get(r.student_id);
    for (const a of rangeToAyahSet(r.start_surah, r.start_ayah, r.end_surah, r.end_ayah)) {
      set.add(a);
    }
  }
  let totalAyahs = 0;
  for (const set of coverageByStudent.values()) totalAyahs += set.size;

  // نسبة الانضباط العامة (كل السجلات، كل الوقت)
  const totalAttendanceRows = allAttendance?.length ?? 0;
  const presentRows = (allAttendance ?? []).filter((a) => a.attended).length;
  const disciplinePercent =
    totalAttendanceRows > 0 ? Math.round((presentRows / totalAttendanceRows) * 100) : 0;

  // إجمالي الميزانيات المطلوب اعتمادها
  const totalFinancial = (financialRequests ?? []).reduce((sum, f) => sum + Number(f.total_amount), 0);

  const stats = [
    { label: 'إجمالي الطلاب', value: students?.length ?? 0, color: 'text-indigo-700 bg-indigo-50' },
    { label: 'إجمالي الحلقات', value: halaqat?.length ?? 0, color: 'text-blue-700 bg-blue-50' },
    {
      label: 'إجمالي الآيات المحفوظة',
      value: totalAyahs.toLocaleString('en-US'),
      color: 'text-emerald-700 bg-emerald-50',
    },
    { label: 'نسبة الانضباط العامة', value: `${disciplinePercent}%`, color: 'text-amber-700 bg-amber-50' },
    {
      label: 'إجمالي الميزانيات المطلوبة',
      value: `${totalFinancial.toLocaleString('en-US')} ريال`,
      color: 'text-teal-700 bg-teal-50',
    },
  ];

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold text-slate-800 mb-1">لوحة القيادة</h1>
        <p className="text-slate-500 mb-8">نظرة شاملة على أداء النظام</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {stats.map((s) => (
            <div key={s.label} className={`rounded-2xl p-6 shadow-sm border border-slate-200 ${s.color}`}>
              <p className="text-sm font-bold opacity-80 mb-2">{s.label}</p>
              <p className="text-4xl font-black">{s.value}</p>
            </div>
          ))}
        </div>

        <a href="/dashboard" className="inline-block mt-8 text-emerald-700 font-bold">
          ← رجوع للوحة التحكم
        </a>
      </div>
    </div>
  );
}
