import { computeProgress } from '@/lib/quran-progress';
import { buildQuranIndex } from '@/lib/quran-index';
import { computeNewMemorizationState } from '@/lib/new-memorization';
import { buildMemorizedSet, buildCycleSteps } from '@/lib/review-cycle';
import { SURAHS } from '@/lib/quran-surahs';
import { levelName } from '@/lib/level-name';
import { countWorkDaysBetween, previousWorkDays } from '@/lib/work-days';
import { requireRole, PAGE_ROLES } from '@/lib/auth';

const EXAM_DELAY_WORK_DAYS = 3;
const STALE_REVIEW_WORK_DAYS = 3;

function surahName(num) {
  return SURAHS.find((s) => s.number === num)?.name ?? num;
}

export default async function OverviewPage() {
  const { supabase } = await requireRole(PAGE_ROLES.overview);

  const today = new Date().toISOString().slice(0, 10);
  const priorWorkDays = previousWorkDays(today, 4);

  const { data: students } = await supabase
    .from('students')
    .select('id, name, halaqat(name)')
    .order('name');

  const studentIds = (students ?? []).map((s) => s.id);
  const idsFilter = studentIds.length ? studentIds : [-1];

  const [{ data: attendanceRows }, { data: levels }, { data: records }] = await Promise.all([
    supabase
      .from('attendance')
      .select('student_id, date, attended, early_arrival')
      .in('date', [today, ...priorWorkDays])
      .in('student_id', idsFilter),
    supabase
      .from('student_levels')
      .select(
        'id, student_id, level_number, target_start_surah, target_start_ayah, target_end_surah, target_end_ayah'
      )
      .in('student_id', idsFilter)
      .order('level_number', { ascending: true }),
    supabase
      .from('daily_records')
      .select('student_id, type, date, start_surah, start_ayah, end_surah, end_ayah')
      .in('student_id', idsFilter),
  ]);

  const levelList = levels ?? [];
  const [{ data: deliveries }, { data: examRows }] = await Promise.all([
    supabase
      .from('surah_deliveries')
      .select('student_id, surah_number, approved')
      .in('student_id', idsFilter),
    supabase
      .from('exam_results')
      .select('level_id, passed, grade')
      .in('level_id', levelList.length ? levelList.map((l) => l.id) : [-1])
      .order('id', { ascending: true }),
  ]);

  const examByLevel = new Map((examRows ?? []).map((e) => [e.level_id, e]));
  const passedLevelIds = new Set((examRows ?? []).filter((e) => e.passed).map((e) => e.level_id));

  const todayAttendance = new Map();
  const attendanceByKey = new Map();
  for (const a of attendanceRows ?? []) {
    if (a.date === today) todayAttendance.set(a.student_id, a);
    attendanceByKey.set(`${a.student_id}|${a.date}`, a);
  }

  const levelsByStudent = new Map();
  for (const l of levelList) {
    if (!levelsByStudent.has(l.student_id)) levelsByStudent.set(l.student_id, []);
    levelsByStudent.get(l.student_id).push(l);
  }

  const recordsMap = new Map();
  for (const r of records ?? []) {
    if (!recordsMap.has(r.student_id)) recordsMap.set(r.student_id, []);
    recordsMap.get(r.student_id).push(r);
  }

  const deliveriesMap = new Map();
  for (const d of deliveries ?? []) {
    if (!deliveriesMap.has(d.student_id)) deliveriesMap.set(d.student_id, []);
    deliveriesMap.get(d.student_id).push(d);
  }

  const quranIndex = buildQuranIndex();

  const rows = (students ?? []).map((s) => {
    const studentLevels = levelsByStudent.get(s.id) ?? [];
    const level = studentLevels[studentLevels.length - 1] ?? null;
    const studentRecords = recordsMap.get(s.id) ?? [];
    const newRecords = studentRecords.filter((r) => r.type === 'جديد');
    const reviewRecords = studentRecords.filter((r) => r.type === 'مراجعة');
    const exam = level ? examByLevel.get(level.id) : null;

    const progress = level ? computeProgress(quranIndex, level, studentRecords) : null;
    const newState = level
      ? computeNewMemorizationState(
          quranIndex,
          level,
          newRecords,
          deliveriesMap.get(s.id) ?? [],
          level.level_number
        )
      : null;

    // غياب متتالٍ: يوم بلا تسجيل يقطع العدّ فلا يُفترض غياباً
    let streak = 0;
    for (const day of priorWorkDays) {
      const row = attendanceByKey.get(`${s.id}|${day}`);
      if (row && row.attended === false) streak++;
      else break;
    }

    // تأخّر الاختبار: آخر تسجيل جديد هو ما أتمّ المستوى
    let examOverdue = 0;
    if (newState?.isLevelComplete && !exam) {
      const dates = newRecords.filter((r) => r.date).map((r) => r.date).sort();
      const readySince = dates[dates.length - 1];
      if (readySince) {
        const waited = countWorkDaysBetween(readySince, today);
        if (waited > EXAM_DELAY_WORK_DAYS) examOverdue = waited;
      }
    }

    // ركود المراجعة: مضت أيام عمل بلا تسجيل مراجعة، والطالب ليس متوقفاً للاختبار
    const passedLevels = studentLevels.filter((l) => passedLevelIds.has(l.id));
    const memorized = buildMemorizedSet(quranIndex, newRecords, passedLevels);
    const cycleSteps = buildCycleSteps(quranIndex, memorized, level?.level_number ?? 1);
    const pausedForExam = Boolean(newState?.isLevelComplete && !exam?.passed);

    let reviewStale = 0;
    if (cycleSteps.length > 0 && !pausedForExam) {
      const dates = reviewRecords.filter((r) => r.date).map((r) => r.date).sort();
      const last = dates[dates.length - 1];
      reviewStale = last
        ? countWorkDaysBetween(last, today)
        : STALE_REVIEW_WORK_DAYS + 1; // ما سُمعت مراجعته إطلاقاً
      if (reviewStale <= STALE_REVIEW_WORK_DAYS) reviewStale = 0;
    }

    const att = todayAttendance.get(s.id) ?? null;
    const attendance = !att
      ? { text: 'لم يُسجَّل', color: 'text-slate-400' }
      : att.attended && att.early_arrival
        ? { text: 'حاضر مبكراً', color: 'text-amber-600' }
        : att.attended
          ? { text: 'حاضر', color: 'text-brand-600' }
          : { text: 'غائب', color: 'text-red-600' };

    const flags = [];
    if (streak >= 2) flags.push({ key: 'absence', label: `غاب ${streak} أيام`, tone: 'red' });
    else if (streak === 1) flags.push({ key: 'absence', label: 'غاب آخر يوم', tone: 'amber' });
    if (examOverdue) flags.push({ key: 'exam', label: `اختبار متأخر ${examOverdue} أيام`, tone: 'red' });
    if (reviewStale) flags.push({ key: 'review', label: 'المراجعة راكدة', tone: 'amber' });
    if (newState?.pendingDelivery)
      flags.push({ key: 'delivery', label: `تسليم ${surahName(newState.pendingDelivery)}`, tone: 'blue' });
    if (!level) flags.push({ key: 'nolevel', label: 'بلا مستوى', tone: 'slate' });

    return { student: s, level, progress, exam, newState, attendance, flags };
  });

  const needsAttention = rows.filter((r) =>
    r.flags.some((f) => f.tone === 'red' || f.key === 'nolevel')
  );

  const toneClass = {
    red: 'bg-red-100 text-red-800',
    amber: 'bg-amber-100 text-amber-800',
    blue: 'bg-blue-100 text-blue-800',
    slate: 'bg-slate-100 text-slate-600',
  };

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 p-6 sm:p-8">
      <div className="max-w-6xl mx-auto bg-white rounded-2xl shadow-md border border-slate-200 p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-slate-800 mb-1">نظرة عامة</h1>
        <p className="text-slate-500 mb-6">متابعة الفرع وما يحتاج تدخّلاً — {today}</p>

        {needsAttention.length > 0 && (
          <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 mb-6">
            <p className="font-bold text-red-800 mb-1">
              ⚠️ {needsAttention.length} طالب يحتاج تدخّلاً
            </p>
            <p className="text-red-800 text-sm">
              {needsAttention.map((r) => r.student.name).join('، ')}
            </p>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-slate-200 text-slate-600">
                <th className="py-2 px-2">الطالب</th>
                <th className="py-2 px-2">الحلقة</th>
                <th className="py-2 px-2">المستوى</th>
                <th className="py-2 px-2">التقدم</th>
                <th className="py-2 px-2">حضور اليوم</th>
                <th className="py-2 px-2">تنبيهات</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ student: s, level, progress, exam, newState, attendance, flags }) => (
                <tr key={s.id} className="border-b border-slate-100">
                  <td className="py-2.5 px-2 font-bold text-slate-700">{s.name}</td>
                  <td className="py-2.5 px-2 text-slate-500">{s.halaqat?.name ?? '—'}</td>
                  <td className="py-2.5 px-2 text-slate-500">
                    {level ? levelName(level.level_number) : '—'}
                    {exam?.passed && (
                      <span className="text-brand-600 text-xs"> · {exam.grade}</span>
                    )}
                  </td>
                  <td className="py-2.5 px-2">
                    {progress ? (
                      <div className="flex items-center gap-2 min-w-24">
                        <div className="h-1.5 w-16 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-brand-500"
                            style={{ width: `${progress.percent}%` }}
                          />
                        </div>
                        <span className="text-slate-500 text-xs">{progress.percent}%</span>
                      </div>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className={`py-2.5 px-2 font-bold ${attendance.color}`}>{attendance.text}</td>
                  <td className="py-2.5 px-2">
                    <div className="flex flex-wrap gap-1">
                      {flags.map((f) => (
                        <span
                          key={f.key}
                          className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${toneClass[f.tone]}`}
                        >
                          {f.label}
                        </span>
                      ))}
                      {flags.length === 0 && <span className="text-slate-300">—</span>}
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

        <a href="/dashboard" className="inline-block mt-8 text-brand-700 font-bold">
          ← رجوع للوحة التحكم
        </a>
      </div>
    </div>
  );
}
