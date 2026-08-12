import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SURAHS } from '@/lib/quran-surahs';
import { computeProgress } from '@/lib/quran-progress';
import { buildQuranIndex } from '@/lib/quran-index';

function surahName(num) {
  return SURAHS.find((s) => s.number === num)?.name ?? num;
}

export default async function LevelsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const { data: students } = await supabase
    .from('students')
    .select('id, name, halaqat(name)')
    .order('name');

  const studentIds = (students ?? []).map((s) => s.id);
  const idsFilter = studentIds.length ? studentIds : [-1];

  const [{ data: levels }, { data: allRecords }] = await Promise.all([
    supabase
      .from('student_levels')
      .select('id, student_id, semester, target_start_surah, target_start_ayah, target_end_surah, target_end_ayah')
      .in('student_id', idsFilter)
      .order('id', { ascending: true }),
    supabase
      .from('daily_records')
      .select('student_id, start_surah, start_ayah, end_surah, end_ayah')
      .in('student_id', idsFilter),
  ]);

  // آخر صف لكل طالب هو هدفه الحالي
  const levelMap = new Map((levels ?? []).map((l) => [l.student_id, l]));
  const recordsMap = new Map();
  for (const r of allRecords ?? []) {
    if (!recordsMap.has(r.student_id)) recordsMap.set(r.student_id, []);
    recordsMap.get(r.student_id).push(r);
  }

  const currentLevelIds = [...levelMap.values()].map((l) => l.id);
  const idsFilterLevels = currentLevelIds.length ? currentLevelIds : [-1];

  const [{ data: milestones100 }, { data: examRows }] = await Promise.all([
    supabase.from('milestone_log').select('level_id').eq('milestone_percent', 100).in('level_id', idsFilterLevels),
    supabase
      .from('exam_results')
      .select('id, level_id, exam_date, score, grade, passed, retry_date')
      .in('level_id', idsFilterLevels)
      .order('id', { ascending: true }),
  ]);

  const readyLevelIds = new Set((milestones100 ?? []).map((m) => m.level_id));
  const examByLevel = new Map((examRows ?? []).map((e) => [e.level_id, e])); // آخر محاولة تفوز (ترتيب تصاعدي)

  const quranIndex = buildQuranIndex();

  const rows = (students ?? []).map((s) => {
    const level = levelMap.get(s.id);
    const progress = level ? computeProgress(quranIndex, level, recordsMap.get(s.id) ?? []) : null;
    const exam = level ? examByLevel.get(level.id) : null;

    let status;
    if (!level) {
      status = { key: 'none', label: 'ما فيه هدف محدد', color: 'text-slate-400' };
    } else if (exam?.passed) {
      status = { key: 'passed', label: `✅ ناجح — ${exam.grade}`, color: 'text-emerald-700 font-bold' };
    } else if (exam && !exam.passed) {
      status = {
        key: 'failed',
        label: exam.retry_date ? `⏳ إعادة بتاريخ ${exam.retry_date}` : '⏳ بانتظار إعادة الاختبار',
        color: 'text-red-600 font-bold',
      };
    } else if (readyLevelIds.has(level.id)) {
      status = { key: 'ready', label: '🏆 جاهز للاختبار', color: 'text-amber-700 font-bold' };
    } else {
      status = { key: 'progress', label: 'قيد التقدم', color: 'text-slate-500' };
    }

    return { student: s, level, progress, exam, status };
  });

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-5xl mx-auto bg-white rounded-2xl shadow-md border border-slate-200 p-8">
        <h1 className="text-2xl font-bold text-slate-800 mb-1">إدارة المستويات والاختبارات</h1>
        <p className="text-slate-500 mb-6">تعيين الأهداف، ورصد نتائج اختبارات نهاية المستوى</p>

        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-200 text-slate-600 text-sm">
                <th className="py-2 px-2">الطالب</th>
                <th className="py-2 px-2">الحلقة</th>
                <th className="py-2 px-2">الهدف الحالي</th>
                <th className="py-2 px-2">التقدم</th>
                <th className="py-2 px-2">الحالة</th>
                <th className="py-2 px-2">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ student: s, level, progress, exam, status }) => (
                <tr key={s.id} className="border-b border-slate-100">
                  <td className="py-3 px-2 font-bold text-slate-700">{s.name}</td>
                  <td className="py-3 px-2 text-slate-500">{s.halaqat?.name ?? '—'}</td>
                  <td className="py-3 px-2 text-slate-600 text-sm">
                    {level ? (
                      <>
                        {level.semester && <div className="text-xs text-slate-400">{level.semester}</div>}
                        من {surahName(level.target_start_surah)}:{level.target_start_ayah} إلى{' '}
                        {surahName(level.target_end_surah)}:{level.target_end_ayah}
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-3 px-2">{progress ? `${progress.percent}%` : '—'}</td>
                  <td className={`py-3 px-2 text-sm ${status.color}`}>{status.label}</td>
                  <td className="py-3 px-2">
                    <div className="flex flex-wrap gap-2">
                      {(status.key === 'ready' || status.key === 'failed') && level && (
                        <a
                          href={`/levels/exam?levelId=${level.id}`}
                          className="text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg px-3 py-1.5 transition"
                        >
                          تسجيل نتيجة اختبار
                        </a>
                      )}
                      {status.key === 'passed' && exam && (
                        <a
                          href={`/levels/certificate?examId=${exam.id}`}
                          className="text-xs font-bold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-lg px-3 py-1.5 transition"
                        >
                          عرض الشهادة
                        </a>
                      )}
                      <a
                        href={`/levels/assign?studentId=${s.id}`}
                        className="text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg px-3 py-1.5 transition"
                      >
                        {level ? 'تعيين هدف جديد' : 'تعيين هدف'}
                      </a>
                    </div>
                  </td>
                </tr>
              ))}

              {(!students || students.length === 0) && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400">
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
