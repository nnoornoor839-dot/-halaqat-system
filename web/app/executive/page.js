import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import QuranEngine from '@/lib/quranEngine';
import { buildQuranIndex } from '@/lib/quran-index';

// عدّ الصفحات "المكتملة فعلياً" (كل آية في الصفحة مسجّلة عند الطالب) — بنفس فلسفة
// اكتمال الأرباع في quranEngine.js (0/1 لكل صفحة، بلا نسب)، لكن كدالة مساعدة هنا
// لأن حساب الصفحات اختياري في تصميم المحرك الأصلي ولا يوفّر دالة جاهزة له.
function countCompletedPages(index, unionSet) {
  const totals = {};
  const covered = {};
  for (let abs = 1; abs <= 6236; abs++) {
    const p = index.ayahToPage[abs];
    if (!p) continue;
    totals[p] = (totals[p] || 0) + 1;
    if (unionSet.has(abs)) covered[p] = (covered[p] || 0) + 1;
  }
  let completed = 0;
  for (const p in totals) {
    if (covered[p] === totals[p]) completed++;
  }
  return completed;
}

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

  const index = buildQuranIndex();

  // نبني حالة تغطية لكل طالب (كل السجلات، بغض النظر عن النوع جديد/مراجعة — الهدف
  // "هل لمس الطالب هذه الآية فعلياً؟")، ثم نجمع النتائج عبر كل الطلاب
  const recordsByStudent = new Map();
  for (const r of allRecords ?? []) {
    if (!recordsByStudent.has(r.student_id)) recordsByStudent.set(r.student_id, []);
    recordsByStudent.get(r.student_id).push(r);
  }

  let totalAyahs = 0;
  let totalCompletedQuarters = 0;
  let totalCompletedPages = 0;

  for (const records of recordsByStudent.values()) {
    const state = QuranEngine.createCoverageState();
    for (const r of records) {
      const { ayahsToProcess } = QuranEngine.calculateRangeStats(
        index,
        r.start_surah,
        r.start_ayah,
        r.end_surah,
        r.end_ayah
      );
      QuranEngine.recordCoverage(state, 'الكل', ayahsToProcess);
    }
    const unionSet = new Set(state.coverage['الكل'] || []);
    const stats = QuranEngine.getCoverageStats(index, state, ['الكل']);

    totalAyahs += stats.totalAyahsCovered;
    totalCompletedQuarters += stats.completedQuarters;
    totalCompletedPages += countCompletedPages(index, unionSet);
  }

  const totalHizbs = Math.floor(totalCompletedQuarters / 4);
  const totalJuz = Math.floor(totalCompletedQuarters / 8);

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
    {
      label: 'إجمالي الصفحات المكتملة',
      value: totalCompletedPages.toLocaleString('en-US'),
      color: 'text-cyan-700 bg-cyan-50',
    },
    {
      label: 'إجمالي الأرباع المكتملة',
      value: totalCompletedQuarters.toLocaleString('en-US'),
      color: 'text-fuchsia-700 bg-fuchsia-50',
    },
    {
      label: 'إجمالي الأحزاب المكتملة',
      value: totalHizbs.toLocaleString('en-US'),
      color: 'text-orange-700 bg-orange-50',
    },
    {
      label: 'إجمالي الأجزاء المكتملة',
      value: totalJuz.toLocaleString('en-US'),
      color: 'text-rose-700 bg-rose-50',
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
