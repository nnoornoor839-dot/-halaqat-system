import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { SURAHS } from '@/lib/quran-surahs';
import { buildQuranIndex } from '@/lib/quran-index';
import QuranEngine from '@/lib/quranEngine';
import { buildMemorizedSet, buildCycleSteps, portionForStep } from '@/lib/review-cycle';
import { levelName } from '@/lib/level-name';
import { requireRole, PAGE_ROLES } from '@/lib/auth';

function surahName(num) {
  return SURAHS.find((s) => s.number === num)?.name ?? num;
}

// دالة خالصة تحسب حالة طالب واحد من بيانات مُحضَّرة مسبقاً، فتصلح للصفحة
// (تجلب دفعة واحدة لكل الطلاب) وللإجراء (يجلب طالباً واحداً) بلا تكرار منطق.
function computeState({ index, levels, records, passedLevelIds, examByLevel }) {
  const currentLevel = levels[levels.length - 1] ?? null;
  const passedLevels = levels.filter((l) => passedLevelIds.has(l.id));

  const newRecords = records.filter((r) => r.type === 'جديد');
  const reviewCount = records.filter((r) => r.type === 'مراجعة').length;

  const memorizedSet = buildMemorizedSet(index, newRecords, passedLevels);
  const levelNumber = currentLevel?.level_number ?? 1;
  const steps = buildCycleSteps(index, memorizedSet, levelNumber);
  const portion = portionForStep(index, memorizedSet, steps, reviewCount);

  // المراجعة تتوقف أثناء التجهيز للاختبار الأول فقط: أنهى مدى مستواه ولم يُرصد له
  // اختبار بعد، لأنه يراجع محفوظه كاملاً استعداداً له.
  //
  // الشرط `!currentExam` لا `!currentExam?.passed`: الطالب الراسب لديه اختبار
  // مرصود، فلا يُعدّ في تجهيز أول، والمراجعة هي بالضبط ما يحتاجه قبل الإعادة —
  // إيقافها عنه كان يعطّله تماماً (لا مراجعة ولا حفظ جديد).
  let awaitingExam = false;
  const currentExam = currentLevel ? examByLevel.get(currentLevel.id) : null;
  if (currentLevel && !currentExam) {
    const { ayahsToProcess } = QuranEngine.calculateRangeStats(
      index,
      currentLevel.target_start_surah,
      currentLevel.target_start_ayah,
      currentLevel.target_end_surah,
      currentLevel.target_end_ayah
    );
    const newCoverage = buildMemorizedSet(index, newRecords, []);
    awaitingExam =
      ayahsToProcess.length > 0 && ayahsToProcess.every((a) => newCoverage.has(a));
  }

  return { currentLevel, portion, awaitingExam, hasMemorized: memorizedSet.size > 0 };
}

async function recordReview(formData) {
  'use server';

  const studentId = formData.get('studentId');
  const { supabase } = await requireRole(PAGE_ROLES.review);

  const [{ data: levels }, { data: records }] = await Promise.all([
    supabase
      .from('student_levels')
      .select(
        'id, level_number, target_start_surah, target_start_ayah, target_end_surah, target_end_ayah'
      )
      .eq('student_id', studentId)
      .order('level_number', { ascending: true }),
    supabase
      .from('daily_records')
      .select('type, start_surah, start_ayah, end_surah, end_ayah')
      .eq('student_id', studentId),
  ]);

  const levelList = levels ?? [];
  const { data: exams } = await supabase
    .from('exam_results')
    .select('level_id, passed')
    .in('level_id', levelList.length ? levelList.map((l) => l.id) : [-1]);

  const { portion, awaitingExam } = computeState({
    index: buildQuranIndex(),
    levels: levelList,
    records: records ?? [],
    passedLevelIds: new Set((exams ?? []).filter((e) => e.passed).map((e) => e.level_id)),
    examByLevel: new Map((exams ?? []).map((e) => [e.level_id, e])),
  });

  if (awaitingExam || !portion) {
    redirect('/review?error=1');
  }

  const today = new Date().toISOString().slice(0, 10);
  await supabase.from('daily_records').insert({
    student_id: studentId,
    date: today,
    type: 'مراجعة',
    start_surah: portion.fromSurah,
    start_ayah: portion.fromAyah,
    end_surah: portion.toSurah,
    end_ayah: portion.toAyah,
  });

  revalidatePath('/review');
  redirect('/review');
}

export default async function ReviewPage({ searchParams }) {
  const params = await searchParams;
  const { supabase } = await requireRole(PAGE_ROLES.review);

  const { data: students } = await supabase
    .from('students')
    .select('id, name, halaqah_id, halaqat(name)')
    .order('name');

  const studentIds = (students ?? []).map((s) => s.id);
  const idsFilter = studentIds.length ? studentIds : [-1];
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: levels }, { data: records }] = await Promise.all([
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
  const { data: exams } = await supabase
    .from('exam_results')
    .select('level_id, passed')
    .in('level_id', levelList.length ? levelList.map((l) => l.id) : [-1]);

  const passedLevelIds = new Set((exams ?? []).filter((e) => e.passed).map((e) => e.level_id));
  const examByLevel = new Map((exams ?? []).map((e) => [e.level_id, e]));

  const levelsByStudent = new Map();
  for (const l of levelList) {
    if (!levelsByStudent.has(l.student_id)) levelsByStudent.set(l.student_id, []);
    levelsByStudent.get(l.student_id).push(l);
  }

  const recordsByStudent = new Map();
  const reviewedToday = new Set();
  for (const r of records ?? []) {
    if (!recordsByStudent.has(r.student_id)) recordsByStudent.set(r.student_id, []);
    recordsByStudent.get(r.student_id).push(r);
    if (r.date === today && r.type === 'مراجعة') reviewedToday.add(r.student_id);
  }

  const index = buildQuranIndex();

  const groups = new Map();
  for (const s of students ?? []) {
    const state = computeState({
      index,
      levels: levelsByStudent.get(s.id) ?? [],
      records: recordsByStudent.get(s.id) ?? [],
      passedLevelIds,
      examByLevel,
    });
    const key = s.halaqat?.name ?? 'بلا حلقة';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ student: s, ...state, doneToday: reviewedToday.has(s.id) });
  }

  return (
    <div dir="rtl" className="bg-slate-50 p-8">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-md border border-slate-200 p-8">
        <h1 className="text-2xl font-bold text-slate-800 mb-1">المراجعة</h1>
        <p className="text-slate-500 mb-6">نصيب اليوم محسوب تلقائياً لكل طالب — {today}</p>

        {params?.error && (
          <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            ما قدرنا نسجّل المراجعة، حدّث الصفحة وحاول مرة ثانية.
          </p>
        )}

        <div className="flex flex-col gap-6">
          {[...groups.entries()].map(([halaqahName, groupRows]) => (
            <div key={halaqahName}>
              <h2 className="font-bold text-slate-400 text-sm mb-2">{halaqahName}</h2>
              <div className="flex flex-col gap-3">
                {groupRows.map(
                  ({ student: s, portion, awaitingExam, hasMemorized, doneToday, currentLevel }) => (
                    <div
                      key={s.id}
                      className="border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-slate-700">{s.name}</div>
                        {currentLevel && (
                          <div className="text-xs text-slate-400">
                            {levelName(currentLevel.level_number)}
                          </div>
                        )}

                        {awaitingExam ? (
                          <p className="text-sm text-amber-700 mt-1">
                            ⏸️ المراجعة متوقفة — الطالب يجهّز لاختبار مستواه
                          </p>
                        ) : !hasMemorized ? (
                          <p className="text-sm text-slate-400 mt-1">ما فيه محفوظ للمراجعة بعد</p>
                        ) : portion ? (
                          <p className="text-sm text-slate-600 mt-1">
                            <span className="font-bold text-brand-700">
                              {surahName(portion.fromSurah)}:{portion.fromAyah}
                            </span>
                            {' → '}
                            <span className="font-bold text-brand-700">
                              {surahName(portion.toSurah)}:{portion.toAyah}
                            </span>
                            <span className="text-slate-400">
                              {' '}
                              ({portion.ayahCount} آية · اليوم {portion.stepIndex + 1} من{' '}
                              {portion.totalSteps})
                            </span>
                          </p>
                        ) : null}
                      </div>

                      <div className="shrink-0">
                        {doneToday ? (
                          <span className="text-brand-700 font-bold text-sm">✅ سُمعت اليوم</span>
                        ) : portion && !awaitingExam ? (
                          <form action={recordReview}>
                            <input type="hidden" name="studentId" value={s.id} />
                            <button className="bg-brand-600 hover:bg-brand-700 text-white font-bold text-sm rounded-lg px-4 py-2 transition">
                              تسجيل المراجعة
                            </button>
                          </form>
                        ) : null}
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          ))}

          {(!students || students.length === 0) && (
            <p className="text-slate-400 text-center py-8">ما فيه طلاب مرتبطين بحسابك.</p>
          )}
        </div>

        <p className="text-xs text-slate-400 mt-6 leading-relaxed">
          الدورة تتقدّم بتسجيل المراجعة لا بمرور الأيام — لو غاب الطالب، ينتظره نصيبه كما هو.
        </p>
      </div>
    </div>
  );
}
