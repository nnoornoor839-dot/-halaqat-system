import { SURAHS } from '@/lib/quran-surahs';
import { computeProgress } from '@/lib/quran-progress';
import { buildQuranIndex } from '@/lib/quran-index';
import { levelName } from '@/lib/level-name';
import { countWorkDaysBetween } from '@/lib/work-days';
import { requireRole, PAGE_ROLES } from '@/lib/auth';

// الطالب يتوقف عن الجديد والمراجعة أثناء التجهيز للاختبار، فتأخّره يعطّله تماماً.
const EXAM_DELAY_WORK_DAYS = 3;

function surahName(num) {
  return SURAHS.find((s) => s.number === num)?.name ?? num;
}

export default async function LevelsPage() {
  const { supabase } = await requireRole(PAGE_ROLES.levels);

  const { data: students } = await supabase
    .from('students')
    .select('id, name, halaqat(name)')
    .order('name');

  const studentIds = (students ?? []).map((s) => s.id);
  const idsFilter = studentIds.length ? studentIds : [-1];

  const [{ data: levels }, { data: allRecords }] = await Promise.all([
    supabase
      .from('student_levels')
      .select(
        'id, student_id, level_number, semester, target_start_surah, target_start_ayah, target_end_surah, target_end_ayah'
      )
      .in('student_id', idsFilter)
      .order('level_number', { ascending: true }),
    supabase
      .from('daily_records')
      .select('student_id, type, date, start_surah, start_ayah, end_surah, end_ayah')
      .in('student_id', idsFilter),
  ]);

  const today = new Date().toISOString().slice(0, 10);

  // مستويات كل طالب مرتّبة: الأخير هو مستواه الحالي، والباقي سجلّه السابق
  const levelsByStudent = new Map();
  for (const l of levels ?? []) {
    if (!levelsByStudent.has(l.student_id)) levelsByStudent.set(l.student_id, []);
    levelsByStudent.get(l.student_id).push(l);
  }

  const recordsMap = new Map();
  for (const r of allRecords ?? []) {
    if (!recordsMap.has(r.student_id)) recordsMap.set(r.student_id, []);
    recordsMap.get(r.student_id).push(r);
  }

  const allLevelIds = (levels ?? []).map((l) => l.id);
  const { data: examRows } = await supabase
    .from('exam_results')
    .select('id, level_id, exam_date, score, grade, passed, retry_date')
    .in('level_id', allLevelIds.length ? allLevelIds : [-1])
    .order('id', { ascending: true });

  // آخر محاولة لكل مستوى هي المعتمدة (الترتيب تصاعدي، فالأخيرة تفوز)
  const examByLevel = new Map((examRows ?? []).map((e) => [e.level_id, e]));

  const quranIndex = buildQuranIndex();

  const rows = (students ?? []).map((s) => {
    const studentLevels = levelsByStudent.get(s.id) ?? [];
    const current = studentLevels[studentLevels.length - 1] ?? null;
    const past = studentLevels.slice(0, -1);
    const progress = current
      ? computeProgress(quranIndex, current, recordsMap.get(s.id) ?? [])
      : null;
    const exam = current ? examByLevel.get(current.id) : null;

    let status;
    if (!current) {
      status = { key: 'none', label: 'ما فيه مستوى بعد', color: 'text-slate-400' };
    } else if (exam?.passed) {
      status = { key: 'passed', label: `✅ ناجح — ${exam.grade}`, color: 'text-brand-700 font-bold' };
    } else if (exam && !exam.passed) {
      status = {
        key: 'failed',
        label: exam.retry_date ? `⏳ إعادة بتاريخ ${exam.retry_date}` : '⏳ بانتظار إعادة الاختبار',
        color: 'text-red-600 font-bold',
      };
    } else if (progress && progress.percent >= 100) {
      // متى صار جاهزاً؟ آخر تسجيل جديد هو ما أتمّ مستواه، لأن التسجيل يُقفل بعد الإتمام
      const newDates = (recordsMap.get(s.id) ?? [])
        .filter((r) => r.type === 'جديد' && r.date)
        .map((r) => r.date)
        .sort();
      const readySince = newDates[newDates.length - 1] ?? null;
      const waitedWorkDays = readySince ? countWorkDaysBetween(readySince, today) : 0;
      const overdue = waitedWorkDays > EXAM_DELAY_WORK_DAYS;

      status = {
        key: 'ready',
        label: overdue
          ? `⚠️ متأخر — جاهز للاختبار منذ ${waitedWorkDays} أيام عمل`
          : '🏆 جاهز للاختبار',
        color: overdue ? 'text-red-700 font-bold' : 'text-amber-700 font-bold',
        overdue,
      };
    } else {
      status = { key: 'progress', label: 'قيد التقدم', color: 'text-slate-500' };
    }

    return { student: s, current, past, progress, exam, status };
  });

  const overdueRows = rows.filter((r) => r.status.overdue);

  return (
    <div dir="rtl" className="bg-slate-50 p-8">
      <div className="max-w-6xl mx-auto bg-white rounded-2xl shadow-md border border-slate-200 p-8">
        <h1 className="text-2xl font-bold text-slate-800 mb-1">إدارة المستويات والاختبارات</h1>
        <p className="text-slate-500 mb-6">
          تعيين المستويات، ورصد نتائج الاختبارات، وتسجيل مستويات الطلاب المنتقلين
        </p>

        {overdueRows.length > 0 && (
          <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 mb-6">
            <p className="font-bold text-red-800 mb-1">
              ⚠️ {overdueRows.length} طالب تجاوز {EXAM_DELAY_WORK_DAYS} أيام عمل بانتظار الاختبار
            </p>
            <p className="text-red-700 text-sm mb-2">
              الطالب يتوقف عن الحفظ الجديد والمراجعة أثناء التجهيز، فتأخّر اختباره يعطّله تماماً.
            </p>
            <p className="text-red-800 text-sm font-bold">
              {overdueRows.map((r) => r.student.name).join('، ')}
            </p>
          </div>
        )}

        {/* الجوال: بطاقات — أزرار الإجراء آخر عمود في الجدول، وهي أول ما يختفي
            خلف التمرير الأفقي على شاشة صغيرة. */}
        <div className="flex flex-col gap-3 md:hidden">
          {rows.map(({ student: s, current, past, progress, exam, status }) => (
            <div
              key={s.id}
              className={`rounded-xl p-3.5 border ${
                status.overdue ? 'border-red-300 bg-red-50/40' : 'border-slate-200'
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-bold text-slate-800">{s.name}</span>
                <span className="text-xs text-slate-400 shrink-0">{s.halaqat?.name ?? '—'}</span>
              </div>

              {past.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {past.map((p) => {
                    const pe = examByLevel.get(p.id);
                    return (
                      <span
                        key={p.id}
                        title={`${levelName(p.level_number)}${pe ? ` — ${pe.grade}` : ''}`}
                        className="text-[11px] bg-slate-100 text-slate-500 rounded px-1.5 py-0.5"
                      >
                        {p.level_number}
                        {pe?.passed ? ' ✅' : ''}
                      </span>
                    );
                  })}
                </div>
              )}

              {current ? (
                <p className="text-sm text-slate-600 mt-2">
                  <span className="font-bold text-slate-700">
                    {levelName(current.level_number)}
                  </span>
                  {current.semester && (
                    <span className="text-xs text-slate-400"> · {current.semester}</span>
                  )}
                  <br />
                  <span className="text-xs">
                    من {surahName(current.target_start_surah)}:{current.target_start_ayah} إلى{' '}
                    {surahName(current.target_end_surah)}:{current.target_end_ayah}
                  </span>
                </p>
              ) : (
                <p className="text-sm text-slate-400 mt-2">بلا مستوى</p>
              )}

              <div className="flex items-center gap-2 mt-2">
                {progress && (
                  <>
                    <div className="h-1.5 flex-1 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-brand-500"
                        style={{ width: `${progress.percent}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-500 shrink-0">{progress.percent}%</span>
                  </>
                )}
              </div>

              <p className={`text-sm mt-2 ${status.color}`}>{status.label}</p>

              <div className="flex flex-wrap gap-2 mt-3">
                {(status.key === 'ready' || status.key === 'failed') && current && (
                  <a
                    href={`/levels/exam?levelId=${current.id}`}
                    className="text-xs font-bold bg-blue-50 text-blue-700 rounded-lg px-3 py-2 transition"
                  >
                    تسجيل نتيجة اختبار
                  </a>
                )}
                {status.key === 'passed' && exam && (
                  <a
                    href={`/levels/certificate?examId=${exam.id}`}
                    className="text-xs font-bold bg-brand-50 text-brand-700 rounded-lg px-3 py-2 transition"
                  >
                    عرض الشهادة
                  </a>
                )}
                <a
                  href={`/levels/assign?studentId=${s.id}`}
                  className="text-xs font-bold bg-slate-100 text-slate-600 rounded-lg px-3 py-2 transition"
                >
                  {current ? 'تعيين المستوى التالي' : 'تعيين المستوى'}
                </a>
                <a
                  href={`/levels/assign?studentId=${s.id}&mode=historical`}
                  className="text-xs font-bold bg-amber-50 text-amber-700 rounded-lg px-3 py-2 transition"
                >
                  تسجيل مستوى سابق
                </a>
              </div>
            </div>
          ))}

          {(!students || students.length === 0) && (
            <p className="py-6 text-center text-slate-400">ما فيه طلاب مرتبطين بحسابك.</p>
          )}
        </div>

        <div className="overflow-x-auto hidden md:block">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="border-b-2 border-slate-200 text-slate-600 text-sm">
                <th className="py-2 px-2">الطالب</th>
                <th className="py-2 px-2">الحلقة</th>
                <th className="py-2 px-2">المستوى الحالي</th>
                <th className="py-2 px-2">التقدم</th>
                <th className="py-2 px-2">الحالة</th>
                <th className="py-2 px-2">إجراء</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ student: s, current, past, progress, exam, status }) => (
                <tr key={s.id} className="border-b border-slate-100 align-top">
                  <td className="py-3 px-2">
                    <div className="font-bold text-slate-700">{s.name}</div>
                    {past.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {past.map((p) => {
                          const pe = examByLevel.get(p.id);
                          return (
                            <span
                              key={p.id}
                              title={`${levelName(p.level_number)}${pe ? ` — ${pe.grade}` : ''}`}
                              className="text-[11px] bg-slate-100 text-slate-500 rounded px-1.5 py-0.5"
                            >
                              {p.level_number}
                              {pe?.passed ? ' ✅' : ''}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-2 text-slate-500">{s.halaqat?.name ?? '—'}</td>
                  <td className="py-3 px-2 text-slate-600 text-sm">
                    {current ? (
                      <>
                        <div className="font-bold text-slate-700">{levelName(current.level_number)}</div>
                        {current.semester && (
                          <div className="text-xs text-slate-400">{current.semester}</div>
                        )}
                        من {surahName(current.target_start_surah)}:{current.target_start_ayah} إلى{' '}
                        {surahName(current.target_end_surah)}:{current.target_end_ayah}
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-3 px-2">{progress ? `${progress.percent}%` : '—'}</td>
                  <td className={`py-3 px-2 text-sm ${status.color}`}>{status.label}</td>
                  <td className="py-3 px-2">
                    <div className="flex flex-wrap gap-2">
                      {(status.key === 'ready' || status.key === 'failed') && current && (
                        <a
                          href={`/levels/exam?levelId=${current.id}`}
                          className="text-xs font-bold bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg px-3 py-1.5 transition"
                        >
                          تسجيل نتيجة اختبار
                        </a>
                      )}
                      {status.key === 'passed' && exam && (
                        <a
                          href={`/levels/certificate?examId=${exam.id}`}
                          className="text-xs font-bold bg-brand-50 text-brand-700 hover:bg-brand-100 rounded-lg px-3 py-1.5 transition"
                        >
                          عرض الشهادة
                        </a>
                      )}
                      <a
                        href={`/levels/assign?studentId=${s.id}`}
                        className="text-xs font-bold bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg px-3 py-1.5 transition"
                      >
                        {current ? 'تعيين المستوى التالي' : 'تعيين المستوى'}
                      </a>
                      <a
                        href={`/levels/assign?studentId=${s.id}&mode=historical`}
                        className="text-xs font-bold bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg px-3 py-1.5 transition"
                      >
                        تسجيل مستوى سابق
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

        <p className="text-xs text-slate-400 mt-6 leading-relaxed">
          للطالب المنتقل: سجّل مستوياته السابقة بالترتيب أولاً (كل واحد بدرجته)، ثم عيّن مستواه
          الحالي. النظام يرقّم المستويات تلقائياً حسب ترتيب تسجيلها.
        </p>
      </div>
    </div>
  );
}
