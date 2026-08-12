import { redirect } from 'next/navigation';
import { SURAHS } from '@/lib/quran-surahs';
import { scoreToGrade, isPassing } from '@/lib/exam-grade';
import { requireRole, PAGE_ROLES } from '@/lib/auth';

function surahName(num) {
  return SURAHS.find((s) => s.number === num)?.name ?? num;
}

async function recordExam(formData) {
  'use server';

  const levelId = formData.get('levelId');
  const examDate = formData.get('examDate');
  const score = parseFloat(formData.get('score'));
  const retryDateInput = formData.get('retryDate');

  if (Number.isNaN(score) || score < 0 || score > 100) {
    redirect(`/levels/exam?levelId=${levelId}&error=${encodeURIComponent('الدرجة لازم تكون رقم بين 0 و100')}`);
  }

  const grade = scoreToGrade(score);
  const passed = isPassing(score);
  const retryDate = !passed && retryDateInput ? retryDateInput : null;

  const { supabase } = await requireRole(PAGE_ROLES.levels);
  const { data, error } = await supabase
    .from('exam_results')
    .insert({ level_id: levelId, exam_date: examDate, score, grade, passed, retry_date: retryDate })
    .select('id')
    .single();

  if (error || !data) {
    redirect(`/levels/exam?levelId=${levelId}&error=${encodeURIComponent(error?.message || 'خطأ غير معروف')}`);
  }

  redirect(passed ? `/levels/certificate?examId=${data.id}` : '/levels');
}

export default async function ExamPage({ searchParams }) {
  const params = await searchParams;
  const levelId = params?.levelId;

  const { supabase } = await requireRole(PAGE_ROLES.levels);

  if (!levelId) {
    redirect('/levels');
  }

  const { data: level } = await supabase
    .from('student_levels')
    .select('id, student_id, semester, target_start_surah, target_start_ayah, target_end_surah, target_end_ayah')
    .eq('id', levelId)
    .single();

  if (!level) {
    redirect('/levels');
  }

  const { data: student } = await supabase.from('students').select('id, name').eq('id', level.student_id).single();

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div dir="rtl" className="bg-slate-50 p-8">
      <div className="max-w-xl mx-auto bg-white rounded-2xl shadow-md border border-slate-200 p-8">
        <h1 className="text-2xl font-bold text-slate-800 mb-1">تسجيل نتيجة اختبار</h1>
        <p className="text-slate-500 mb-1">{student?.name}</p>
        <p className="text-slate-400 text-sm mb-6">
          من {surahName(level.target_start_surah)}:{level.target_start_ayah} إلى{' '}
          {surahName(level.target_end_surah)}:{level.target_end_ayah}
        </p>

        {params?.error && (
          <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            {params.error}
          </p>
        )}

        <form action={recordExam} className="flex flex-col gap-4">
          <input type="hidden" name="levelId" value={level.id} />

          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1">تاريخ الاختبار</label>
            <input
              type="date"
              name="examDate"
              required
              defaultValue={today}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-brand-500"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1">الدرجة (من 100)</label>
            <input
              type="number"
              name="score"
              min="0"
              max="100"
              step="0.5"
              required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-brand-500"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1">
              تاريخ إعادة الاختبار <span className="text-slate-400 font-normal">(يُملأ بس لو تتوقع رسوبه)</span>
            </label>
            <input
              type="date"
              name="retryDate"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-brand-500"
            />
          </div>

          <button
            type="submit"
            className="bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-lg py-2.5 transition mt-2"
          >
            حفظ النتيجة
          </button>
        </form>

        <a href="/levels" className="inline-block mt-6 text-brand-700 font-bold">
          ← رجوع
        </a>
      </div>
    </div>
  );
}
