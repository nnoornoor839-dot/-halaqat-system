import { redirect } from 'next/navigation';
import { SURAHS } from '@/lib/quran-surahs';
import { computeProgress } from '@/lib/quran-progress';
import { buildQuranIndex } from '@/lib/quran-index';
import { computeNewMemorizationState } from '@/lib/new-memorization';
import { levelName } from '@/lib/level-name';
import { requireRole, PAGE_ROLES } from '@/lib/auth';

const MILESTONES = [25, 50, 75, 100];

function surahName(num) {
  return SURAHS.find((s) => s.number === num)?.name ?? num;
}

function surahAyahCount(num) {
  return SURAHS.find((s) => s.number === num)?.ayahCount ?? 0;
}

// نجمع كل ما تحتاجه الصفحة والإجراءات معاً، حتى يُعاد حساب الحالة من مصدرها
// في كل مرة بدل الاعتماد على ما أرسله المتصفح (قد يكون قديماً أو معدَّلاً).
async function loadState(supabase, studentId) {
  const [{ data: student }, { data: level }, { data: allRecords }, { data: deliveries }] =
    await Promise.all([
      supabase.from('students').select('id, name').eq('id', studentId).single(),
      supabase
        .from('student_levels')
        .select(
          'id, level_number, target_start_surah, target_start_ayah, target_end_surah, target_end_ayah'
        )
        .eq('student_id', studentId)
        .order('level_number', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('daily_records')
        .select('type, date, start_surah, start_ayah, end_surah, end_ayah')
        .eq('student_id', studentId),
      supabase
        .from('surah_deliveries')
        .select('surah_number, approved, delivered_at')
        .eq('student_id', studentId),
    ]);

  const records = allRecords ?? [];
  const newRecords = records.filter((r) => r.type === 'جديد');
  const index = buildQuranIndex();
  const state = level
    ? computeNewMemorizationState(index, level, newRecords, deliveries ?? [], level.level_number)
    : null;

  // آخر محاولة اختبار لهذا المستوى — تميّز "أنهى وينتظر الاختبار" عن "اختبر ونجح"
  let exam = null;
  if (level) {
    const { data: examRows } = await supabase
      .from('exam_results')
      .select('passed, grade, retry_date')
      .eq('level_id', level.id)
      .order('id', { ascending: true });
    exam = (examRows ?? [])[examRows?.length ? examRows.length - 1 : 0] ?? null;
  }

  return { student, level, records, newRecords, deliveries: deliveries ?? [], index, state, exam };
}

async function recordSard(formData) {
  'use server';

  const studentId = formData.get('studentId');
  const endAyah = parseInt(formData.get('endAyah'), 10);
  const back = `/teacher/sard?studentId=${studentId}`;

  const { supabase } = await requireRole(PAGE_ROLES.sard);
  const { level, newRecords, index, state, exam } = await loadState(supabase, studentId);

  if (!level || !state) {
    redirect(`${back}&error=${encodeURIComponent('ما فيه مستوى محدد لهذا الطالب')}`);
  }
  if (exam) {
    redirect(
      `${back}&error=${encodeURIComponent('هذا المستوى اختُبر فعلاً — ينتظر المشرف يعيّن المستوى التالي')}`
    );
  }
  // البوابة تُطبَّق هنا لا في الواجهة فقط، فالإجراء نقطة وصول مستقلة
  if (state.pendingDelivery) {
    redirect(
      `${back}&error=${encodeURIComponent(`لازم تسليم سورة ${surahName(state.pendingDelivery)} أولاً`)}`
    );
  }
  if (state.isLevelComplete) {
    redirect(`${back}&error=${encodeURIComponent('الطالب أنهى مستواه — جاهز للاختبار')}`);
  }

  const maxAyah = surahAyahCount(state.currentSurah);
  if (Number.isNaN(endAyah) || endAyah < 1 || endAyah > maxAyah) {
    redirect(
      `${back}&error=${encodeURIComponent(`آية النهاية لازم تكون بين 1 و${maxAyah}`)}`
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const { error } = await supabase.from('daily_records').insert({
    student_id: studentId,
    date: today,
    type: 'جديد',
    start_surah: state.currentSurah,
    start_ayah: 1,
    end_surah: state.currentSurah,
    end_ayah: endAyah,
  });

  if (error) {
    redirect(`${back}&error=${encodeURIComponent(error.message)}`);
  }

  // هل عبر الطالب محطة جديدة (25/50/75/100%) بالنسبة لمستواه الحالي؟
  let newMilestone = null;
  const { data: existingMilestones } = await supabase
    .from('milestone_log')
    .select('milestone_percent')
    .eq('student_id', studentId)
    .eq('level_id', level.id);

  const updatedRecords = [
    ...newRecords,
    {
      type: 'جديد',
      start_surah: state.currentSurah,
      start_ayah: 1,
      end_surah: state.currentSurah,
      end_ayah: endAyah,
    },
  ];
  const progress = computeProgress(index, level, updatedRecords);
  const already = new Set((existingMilestones ?? []).map((m) => m.milestone_percent));
  const reached = MILESTONES.filter((m) => progress.percent >= m && !already.has(m));

  if (reached.length > 0) {
    newMilestone = Math.max(...reached);
    await supabase
      .from('milestone_log')
      .insert(reached.map((m) => ({ student_id: studentId, level_id: level.id, milestone_percent: m })));
  }

  redirect(newMilestone ? `/teacher?milestone=${newMilestone}` : '/teacher');
}

async function recordDelivery(formData) {
  'use server';

  const studentId = formData.get('studentId');
  const surahNumber = parseInt(formData.get('surahNumber'), 10);
  const approved = formData.get('approved') === 'true';
  const back = `/teacher/sard?studentId=${studentId}`;

  const { supabase } = await requireRole(PAGE_ROLES.sard);
  const today = new Date().toISOString().slice(0, 10);

  const { error } = await supabase.from('surah_deliveries').insert({
    student_id: studentId,
    surah_number: surahNumber,
    delivered_at: today,
    approved,
  });

  if (error) {
    redirect(`${back}&error=${encodeURIComponent(error.message)}`);
  }

  redirect('/teacher');
}

export default async function SardPage({ searchParams }) {
  const params = await searchParams;
  const studentId = params?.studentId;

  const { supabase } = await requireRole(PAGE_ROLES.sard);

  if (!studentId) {
    redirect('/teacher');
  }

  const { student, level, records, state, exam } = await loadState(supabase, studentId);

  if (!student) {
    redirect('/teacher');
  }

  const today = new Date().toISOString().slice(0, 10);
  const todayRecords = records.filter((r) => r.date === today);

  // متى آخر مرة سجّل فيها الطالب جديداً في سورته الحالية — تذكير للمعلم لا أكثر
  let lastRecordNote = null;
  if (state?.currentSurah && state.lastAyahReached > 0) {
    const surahRecords = records
      .filter((r) => r.type === 'جديد' && r.end_surah === state.currentSurah)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    const lastDate = surahRecords[0]?.date;
    if (lastDate) {
      const days = Math.round((new Date(today) - new Date(lastDate)) / 86400000);
      const when = days === 0 ? 'اليوم' : days === 1 ? 'أمس' : `قبل ${days} أيام`;
      lastRecordNote = `آخر نقطة سجّلها الطالب: آية ${state.lastAyahReached} — ${when}`;
    }
  }

  const errorText = params?.error;

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-xl mx-auto bg-white rounded-2xl shadow-md border border-slate-200 p-8">
        <h1 className="text-2xl font-bold text-slate-800 mb-1">تسجيل الحفظ الجديد</h1>
        <p className="text-slate-500 mb-1">{student.name}</p>
        {level && (
          <p className="text-slate-400 text-sm mb-6">
            {levelName(level.level_number)} — {today}
          </p>
        )}

        {errorText && (
          <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            {errorText}
          </p>
        )}

        {todayRecords.length > 0 && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-6 text-sm">
            <p className="font-bold text-slate-600 mb-2">مسجّل اليوم:</p>
            <ul className="flex flex-col gap-1">
              {todayRecords.map((r, i) => (
                <li key={i}>
                  {r.type}: {surahName(r.start_surah)} {r.start_ayah} — {r.end_ayah}
                </li>
              ))}
            </ul>
          </div>
        )}

        {!level && (
          <p className="text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-4">
            ما فيه مستوى محدد لهذا الطالب. المشرف يعيّن له مستوى أولاً من صفحة المستويات.
          </p>
        )}

        {level && exam?.passed && (
          <div className="bg-brand-50 border-2 border-brand-300 rounded-xl p-5 text-center">
            <p className="text-3xl mb-1">✅</p>
            <p className="font-bold text-brand-800">
              الطالب اجتاز {levelName(level.level_number)} بتقدير {exam.grade}
            </p>
            <p className="text-brand-700 text-sm mt-1">
              ينتظر المشرف يعيّن له المستوى التالي حتى يكمل الحفظ الجديد.
            </p>
          </div>
        )}

        {level && exam && !exam.passed && (
          <div className="bg-red-50 border-2 border-red-300 rounded-xl p-5 text-center">
            <p className="text-3xl mb-1">⏳</p>
            <p className="font-bold text-red-800">بانتظار إعادة اختبار {levelName(level.level_number)}</p>
            {exam.retry_date && (
              <p className="text-red-700 text-sm mt-1">موعد الإعادة: {exam.retry_date}</p>
            )}
          </div>
        )}

        {/* التسليم أولاً: الطالب ما يُعد جاهزاً للاختبار وعنده سورة لم تُسلَّم بعد */}
        {level && !exam && !state?.pendingDelivery && state?.isLevelComplete && (
          <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-5 text-center">
            <p className="text-3xl mb-1">🏆</p>
            <p className="font-bold text-amber-800">
              الطالب أنهى {levelName(level.level_number)} بالكامل — جاهز للاختبار
            </p>
            <p className="text-amber-700 text-sm mt-1">
              يتوقف الجديد والمراجعة حتى يُرصد اختباره.
            </p>
          </div>
        )}

        {level && !exam && state?.pendingDelivery && (
          <div className="bg-blue-50 border-2 border-blue-300 rounded-xl p-5">
            <p className="text-center text-3xl mb-1">🔒</p>
            <p className="font-bold text-blue-900 text-center mb-1">
              بانتظار تسليم سورة {surahName(state.pendingDelivery)}
            </p>
            <p className="text-blue-800 text-sm text-center mb-4">
              يسمّع السورة كاملة بجلسة واحدة. ما ينفتح الحفظ الجديد إلا بعد اعتمادك.
            </p>
            <div className="flex gap-2">
              <form action={recordDelivery} className="flex-1">
                <input type="hidden" name="studentId" value={student.id} />
                <input type="hidden" name="surahNumber" value={state.pendingDelivery} />
                <input type="hidden" name="approved" value="true" />
                <button className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-lg py-2.5 transition">
                  ✅ اعتماد التسليم
                </button>
              </form>
              <form action={recordDelivery} className="flex-1">
                <input type="hidden" name="studentId" value={student.id} />
                <input type="hidden" name="surahNumber" value={state.pendingDelivery} />
                <input type="hidden" name="approved" value="false" />
                <button className="w-full bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg py-2.5 transition">
                  ↻ يحتاج إعادة
                </button>
              </form>
            </div>
          </div>
        )}

        {level && state && !exam && !state.isLevelComplete && !state.pendingDelivery && (
          <form action={recordSard} className="flex flex-col gap-4">
            <input type="hidden" name="studentId" value={student.id} />

            <div className="bg-brand-50 border border-brand-200 rounded-xl p-4">
              <p className="text-sm text-brand-800 font-bold mb-1">السورة الحالية</p>
              <p className="text-2xl font-black text-brand-900">
                {surahName(state.currentSurah)}
              </p>
              <p className="text-brand-700 text-sm mt-1">
                السرد يبدأ من آية ١ ({surahAyahCount(state.currentSurah)} آية بالسورة)
              </p>
            </div>

            {lastRecordNote && (
              <p className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-3">
                ℹ️ {lastRecordNote}
              </p>
            )}

            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1">
                إلى آية رقم
              </label>
              <input
                type="number"
                name="endAyah"
                min="1"
                max={surahAyahCount(state.currentSurah)}
                required
                placeholder="اكتب آخر آية سردها الطالب اليوم"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-brand-500"
              />
            </div>

            <button
              type="submit"
              className="bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-lg py-2.5 transition"
            >
              حفظ السرد
            </button>
          </form>
        )}

        <a href="/teacher" className="inline-block mt-6 text-brand-700 font-bold">
          ← رجوع لتحضير اليوم
        </a>
      </div>
    </div>
  );
}
