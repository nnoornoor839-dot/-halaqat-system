import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { computeProgress } from '@/lib/quran-progress';
import { buildQuranIndex } from '@/lib/quran-index';
import { computeNewMemorizationState } from '@/lib/new-memorization';
import { SURAHS } from '@/lib/quran-surahs';
import { levelName } from '@/lib/level-name';
import { previousWorkDays } from '@/lib/work-days';
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
  const priorWorkDays = previousWorkDays(today, 4);

  const { data: students } = await supabase
    .from('students')
    .select('id, name, halaqah_id, halaqat(name)')
    .order('name');
  const studentIds = (students ?? []).map((s) => s.id);
  const idsFilter = studentIds.length ? studentIds : [-1];

  const [{ data: attendanceRows }, { data: levels }, { data: allRecords }] = await Promise.all([
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
      .select('student_id, type, start_surah, start_ayah, end_surah, end_ayah')
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
      .select('level_id, passed, grade, retry_date')
      .in('level_id', levelList.length ? levelList.map((l) => l.id) : [-1])
      .order('id', { ascending: true }),
  ]);

  const examByLevel = new Map((examRows ?? []).map((e) => [e.level_id, e]));

  const todayAttendance = new Map();
  const attendanceByStudentDate = new Map();
  for (const a of attendanceRows ?? []) {
    if (a.date === today) todayAttendance.set(a.student_id, a);
    attendanceByStudentDate.set(`${a.student_id}|${a.date}`, a);
  }

  const levelMap = new Map(levelList.map((l) => [l.student_id, l]));

  const recordsMap = new Map();
  for (const r of allRecords ?? []) {
    if (!recordsMap.has(r.student_id)) recordsMap.set(r.student_id, []);
    recordsMap.get(r.student_id).push(r);
  }

  const deliveriesMap = new Map();
  for (const d of deliveries ?? []) {
    if (!deliveriesMap.has(d.student_id)) deliveriesMap.set(d.student_id, []);
    deliveriesMap.get(d.student_id).push(d);
  }

  const quranIndex = buildQuranIndex();

  // غياب متتالٍ في أيام العمل السابقة — يوم بلا تسجيل يقطع العدّ فلا نفترض غياباً
  function absenceStreak(studentId) {
    let streak = 0;
    for (const day of priorWorkDays) {
      const row = attendanceByStudentDate.get(`${studentId}|${day}`);
      if (row && row.attended === false) streak++;
      else break;
    }
    return streak;
  }

  const groups = new Map();
  for (const s of students ?? []) {
    const level = levelMap.get(s.id);
    const records = recordsMap.get(s.id) ?? [];
    const newState = level
      ? computeNewMemorizationState(
          quranIndex,
          level,
          records.filter((r) => r.type === 'جديد'),
          deliveriesMap.get(s.id) ?? [],
          level.level_number
        )
      : null;

    const key = s.halaqat?.name ?? 'بلا حلقة';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({
      student: s,
      level,
      newState,
      exam: level ? examByLevel.get(level.id) : null,
      progress: level ? computeProgress(quranIndex, level, records) : null,
      attendance: todayAttendance.get(s.id) ?? null,
      streak: absenceStreak(s.id),
    });
  }

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 p-6 sm:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800">تحضير اليوم</h1>
          <p className="text-slate-500">{today}</p>
        </div>

        {params?.error && (
          <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            صار خطأ أثناء الحفظ، حاول مرة ثانية.
          </p>
        )}

        {params?.milestone && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 mb-6 text-center">
            <p className="text-2xl mb-1">{params.milestone === '100' ? '🏆' : '🎉'}</p>
            <p className="font-bold text-amber-800">
              {params.milestone === '100'
                ? 'مبروك! طالب أنهى هدفه بالكامل — جاهز للاختبار'
                : `مبروك! طالب بلغ ${params.milestone}% من هدفه`}
            </p>
          </div>
        )}

        <div className="flex flex-col gap-8">
          {[...groups.entries()].map(([halaqahName, cards]) => (
            <section key={halaqahName}>
              <h2 className="font-bold text-slate-500 mb-3 border-b border-slate-200 pb-2">
                {halaqahName}
                <span className="text-slate-400 font-normal text-sm"> · {cards.length} طالب</span>
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {cards.map(({ student: s, level, newState, exam, progress, attendance, streak }) => {
                  const isAbsent = attendance?.attended === false;
                  const isPresent = attendance?.attended === true && !attendance?.early_arrival;
                  const isEarly = attendance?.attended === true && attendance?.early_arrival === true;

                  const border =
                    streak >= 2
                      ? 'border-red-400 border-2'
                      : streak === 1
                        ? 'border-amber-400 border-2'
                        : 'border-slate-200';

                  return (
                    <div
                      key={s.id}
                      className={`relative bg-white rounded-2xl shadow-sm p-4 flex flex-col gap-3 ${border}`}
                    >
                      {streak > 0 && (
                        <span
                          className={`absolute -top-2 -left-2 text-[11px] font-bold px-2 py-0.5 rounded-full shadow ${
                            streak >= 2 ? 'bg-red-500 text-white' : 'bg-amber-400 text-slate-900'
                          }`}
                        >
                          ⚠️ غاب {streak === 1 ? 'آخر يوم' : `${streak} أيام`}
                        </span>
                      )}

                      <div>
                        <p className="font-bold text-slate-800 leading-tight">{s.name}</p>
                        {level && (
                          <p className="text-xs text-slate-400">{levelName(level.level_number)}</p>
                        )}
                      </div>

                      {progress && (
                        <div>
                          <div className="flex justify-between text-xs text-slate-500 mb-1">
                            <span>التقدم</span>
                            <span className="font-bold">{progress.percent}%</span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-brand-500"
                              style={{ width: `${progress.percent}%` }}
                            />
                          </div>
                        </div>
                      )}

                      <div className="text-xs">
                        {exam?.passed ? (
                          <span className="inline-block bg-brand-100 text-brand-800 font-bold px-2 py-1 rounded-full">
                            ✅ أنهى مستواه — بانتظار التالي
                          </span>
                        ) : exam ? (
                          <span className="inline-block bg-red-100 text-red-800 font-bold px-2 py-1 rounded-full">
                            ⏳ بانتظار إعادة الاختبار
                          </span>
                        ) : newState?.pendingDelivery ? (
                          <span className="inline-block bg-blue-100 text-blue-800 font-bold px-2 py-1 rounded-full">
                            🔒 بانتظار تسليم {surahName(newState.pendingDelivery)}
                          </span>
                        ) : newState?.isLevelComplete ? (
                          <span className="inline-block bg-amber-100 text-amber-800 font-bold px-2 py-1 rounded-full">
                            🏆 جاهز للاختبار
                          </span>
                        ) : newState?.currentSurah ? (
                          <span className="text-slate-500">
                            {surahName(newState.currentSurah)}
                            {newState.lastAyahReached > 0 && ` — آية ${newState.lastAyahReached}`}
                          </span>
                        ) : (
                          <span className="text-slate-400">ما فيه مستوى محدد</span>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-1.5">
                        <form action={markAttendance}>
                          <input type="hidden" name="studentId" value={s.id} />
                          <input type="hidden" name="attended" value="true" />
                          <input type="hidden" name="early" value="true" />
                          <button
                            className={`w-full px-1 py-2 rounded-lg font-bold text-xs transition ${
                              isEarly
                                ? 'bg-amber-500 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            مبكراً
                          </button>
                        </form>
                        <form action={markAttendance}>
                          <input type="hidden" name="studentId" value={s.id} />
                          <input type="hidden" name="attended" value="true" />
                          <input type="hidden" name="early" value="false" />
                          <button
                            className={`w-full px-1 py-2 rounded-lg font-bold text-xs transition ${
                              isPresent
                                ? 'bg-brand-600 text-white'
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
                            className={`w-full px-1 py-2 rounded-lg font-bold text-xs transition ${
                              isAbsent
                                ? 'bg-red-600 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            غائب
                          </button>
                        </form>
                      </div>

                      {!exam && (newState?.pendingDelivery || newState?.currentSurah) && (
                        <a
                          href={`/teacher/sard?studentId=${s.id}`}
                          className={`block text-center px-3 py-2 rounded-lg font-bold text-sm transition ${
                            newState?.pendingDelivery
                              ? 'bg-blue-600 text-white hover:bg-blue-700'
                              : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                          }`}
                        >
                          {newState?.pendingDelivery ? 'تسليم السورة' : 'تسجيل الجديد'}
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          {(!students || students.length === 0) && (
            <p className="text-slate-400 text-center py-8">ما فيه طلاب مرتبطين بحسابك.</p>
          )}
        </div>

        <a href="/dashboard" className="inline-block mt-8 text-brand-700 font-bold">
          ← رجوع للوحة التحكم
        </a>
      </div>
    </div>
  );
}
