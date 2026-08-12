import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { computeProgress } from '@/lib/quran-progress';
import { buildQuranIndex } from '@/lib/quran-index';
import { computeNewMemorizationState } from '@/lib/new-memorization';
import { SURAHS } from '@/lib/quran-surahs';
import { requireRole, PAGE_ROLES } from '@/lib/auth';

function surahName(num) {
  return SURAHS.find((s) => s.number === num)?.name ?? num;
}

async function markAttendance(formData) {
  'use server';
  const studentId = formData.get('studentId');
  const attended = formData.get('attended') === 'true';
  const early = formData.get('early') === 'true';
  const today = new Date().toISOString().slice(0, 10);

  const { supabase } = await requireRole(PAGE_ROLES.teacher);
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
  const { supabase } = await requireRole(PAGE_ROLES.teacher);

  const today = new Date().toISOString().slice(0, 10);

  const { data: students } = await supabase.from('students').select('id, name').order('name');
  const studentIds = (students ?? []).map((s) => s.id);
  const idsFilter = studentIds.length ? studentIds : [-1];

  const [
    { data: todayAttendance },
    { data: levels },
    { data: allRecords },
    { data: milestones },
  ] = await Promise.all([
    supabase.from('attendance').select('student_id, attended, early_arrival').eq('date', today),
    supabase
      .from('student_levels')
      .select(
        'id, student_id, level_number, target_start_surah, target_start_ayah, target_end_surah, target_end_ayah'
      )
      .in('student_id', idsFilter)
      .order('level_number', { ascending: true }),
    supabase
      .from('daily_records')
      .select('student_id, type, start_surah, start_ayah, end_surah, end_ayah')
      .in('student_id', idsFilter),
    supabase.from('milestone_log').select('student_id, level_id, milestone_percent').in('student_id', idsFilter),
  ]);

  const { data: deliveries } = await supabase
    .from('surah_deliveries')
    .select('student_id, surah_number, approved')
    .in('student_id', idsFilter);

  // نحتاج نتائج الاختبارات حتى نميّز بين "أنهى مستواه وينتظر اختباره" وبين
  // "اختبر ونجح فعلاً وينتظر مستواه التالي" — الحالتان تبدوان متطابقتين بلا هذا.
  const levelIds = (levels ?? []).map((l) => l.id);
  const { data: examRows } = await supabase
    .from('exam_results')
    .select('level_id, passed, grade, retry_date')
    .in('level_id', levelIds.length ? levelIds : [-1])
    .order('id', { ascending: true });
  const examByLevel = new Map((examRows ?? []).map((e) => [e.level_id, e]));

  const attendanceMap = new Map((todayAttendance ?? []).map((a) => [a.student_id, a]));

  // آخر صف لكل طالب بجدول student_levels هو "هدفه الحالي" (لو تغيّر هدفه أكثر من مرة)
  const levelMap = new Map((levels ?? []).map((l) => [l.student_id, l]));
  const recordsMap = new Map();
  for (const r of allRecords ?? []) {
    if (!recordsMap.has(r.student_id)) recordsMap.set(r.student_id, []);
    recordsMap.get(r.student_id).push(r);
  }

  // المحطات المعروضة تخص الهدف الحالي بس (مو كل تاريخ الطالب)
  const milestonesMap = new Map();
  for (const m of milestones ?? []) {
    const currentLevel = levelMap.get(m.student_id);
    if (!currentLevel || m.level_id !== currentLevel.id) continue;
    if (!milestonesMap.has(m.student_id)) milestonesMap.set(m.student_id, []);
    milestonesMap.get(m.student_id).push(m.milestone_percent);
  }

  const deliveriesMap = new Map();
  for (const d of deliveries ?? []) {
    if (!deliveriesMap.has(d.student_id)) deliveriesMap.set(d.student_id, []);
    deliveriesMap.get(d.student_id).push(d);
  }

  const quranIndex = buildQuranIndex();

  // حالة الجديد لكل طالب: سورته الحالية، وهل فيه سورة تنتظر تسليماً تقفل عليه
  const newStateMap = new Map();
  for (const s of students ?? []) {
    const level = levelMap.get(s.id);
    if (!level) continue;
    const newRecords = (recordsMap.get(s.id) ?? []).filter((r) => r.type === 'جديد');
    newStateMap.set(
      s.id,
      computeNewMemorizationState(
        quranIndex,
        level,
        newRecords,
        deliveriesMap.get(s.id) ?? [],
        level.level_number
      )
    );
  }

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

        {params?.milestone && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 mb-4 text-center">
            <p className="text-2xl mb-1">
              {params.milestone === '100' ? '🏆' : '🎉'}
            </p>
            <p className="font-bold text-amber-800">
              {params.milestone === '100'
                ? 'مبروك! طالب أنهى هدفه بالكامل — جاهز للاختبار'
                : `مبروك! طالب بلغ ${params.milestone}% من هدفه`}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-3">
          {students?.map((s) => {
            const status = attendanceMap.get(s.id);
            const isAbsent = status?.attended === false;
            const isPresent = status?.attended === true && !status?.early_arrival;
            const isEarly = status?.attended === true && status?.early_arrival === true;
            const level = levelMap.get(s.id);
            const progress = level ? computeProgress(quranIndex, level, recordsMap.get(s.id) ?? []) : null;
            const achieved = (milestonesMap.get(s.id) ?? []).sort((a, b) => a - b);
            const newState = newStateMap.get(s.id);
            const exam = level ? examByLevel.get(level.id) : null;
            return (
              <div
                key={s.id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border border-slate-200 rounded-xl p-3"
              >
                <div>
                  <span className="font-bold text-slate-700">{s.name}</span>
                  {progress && (
                    <div className="mt-1 w-40">
                      <div className="flex justify-between text-xs text-slate-500 mb-0.5">
                        <span>التقدم</span>
                        <span>{progress.percent}%</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500"
                          style={{ width: `${progress.percent}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {exam?.passed ? (
                    <span className="inline-block bg-emerald-100 text-emerald-800 text-xs font-bold px-2 py-1 rounded-full mt-1">
                      ✅ أنهى مستواه — بانتظار المستوى التالي
                    </span>
                  ) : exam && !exam.passed ? (
                    <span className="inline-block bg-red-100 text-red-800 text-xs font-bold px-2 py-1 rounded-full mt-1">
                      ⏳ بانتظار إعادة الاختبار
                      {exam.retry_date ? ` — ${exam.retry_date}` : ''}
                    </span>
                  ) : newState?.isLevelComplete ? (
                    <span className="inline-block bg-amber-100 text-amber-800 text-xs font-bold px-2 py-1 rounded-full mt-1">
                      🏆 جاهز للاختبار
                    </span>
                  ) : newState?.pendingDelivery ? (
                    <span className="inline-block bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded-full mt-1">
                      🔒 بانتظار تسليم {surahName(newState.pendingDelivery)}
                    </span>
                  ) : newState?.currentSurah ? (
                    <span className="inline-block text-xs text-slate-500 mt-1">
                      السورة الحالية: {surahName(newState.currentSurah)}
                      {newState.lastAyahReached > 0 && ` — آية ${newState.lastAyahReached}`}
                    </span>
                  ) : null}
                  {achieved.length > 0 && (
                    <div className="flex gap-1 mt-1">
                      {achieved
                        .filter((m) => m !== 100)
                        .map((m) => (
                          <span key={m} title={`${m}%`}>
                            🏅
                          </span>
                        ))}
                    </div>
                  )}
                </div>
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
                    className={`px-4 py-1.5 rounded-lg font-bold text-sm transition ${
                      newState?.pendingDelivery
                        ? 'bg-blue-600 text-white hover:bg-blue-700'
                        : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                    }`}
                  >
                    {newState?.pendingDelivery ? 'تسليم السورة' : 'تسجيل الجديد'}
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
