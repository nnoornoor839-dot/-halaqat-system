import { redirect } from 'next/navigation';
import { SURAHS } from '@/lib/quran-surahs';
import { scoreToGrade, isPassing } from '@/lib/exam-grade';
import { levelName } from '@/lib/level-name';
import { requireRole, PAGE_ROLES } from '@/lib/auth';

// الحفظ يبدأ من الناس صعوداً إلى البقرة، فنعرض السور بالترتيب المعكوس
// ليكون أول خيار في القائمة هو ما يبدأ منه الطالب فعلاً.
const SURAHS_DESC = [...SURAHS].reverse();

async function assignLevel(formData) {
  'use server';

  const studentId = formData.get('studentId');
  const mode = formData.get('mode');
  const semester = formData.get('semester');
  const startSurah = parseInt(formData.get('startSurah'), 10);
  const startAyah = parseInt(formData.get('startAyah'), 10);
  const endSurah = parseInt(formData.get('endSurah'), 10);
  const endAyah = parseInt(formData.get('endAyah'), 10);

  const back = `/levels/assign?studentId=${studentId}${mode === 'historical' ? '&mode=historical' : ''}`;
  // الإجراء نفسه نقطة وصول مستقلة عن الصفحة، فيحتاج تحققه الخاص
  const { supabase } = await requireRole(PAGE_ROLES.levels);

  // في الوضع التاريخي نتحقق من الدرجة قبل إنشاء المستوى، حتى لا يبقى
  // مستوى معلّق بلا نتيجة لو كانت الدرجة غير صالحة.
  let score = null;
  let examDate = null;
  if (mode === 'historical') {
    score = parseFloat(formData.get('score'));
    examDate = formData.get('examDate');
    if (Number.isNaN(score) || score < 0 || score > 100) {
      redirect(`${back}&error=${encodeURIComponent('الدرجة لازم تكون رقم بين 0 و100')}`);
    }
  }

  // رقم المستوى يحدده النظام: أعلى رقم موجود للطالب + 1
  const { data: last } = await supabase
    .from('student_levels')
    .select('level_number')
    .eq('student_id', studentId)
    .order('level_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  const levelNumber = (last?.level_number ?? 0) + 1;

  const { data: level, error } = await supabase
    .from('student_levels')
    .insert({
      student_id: studentId,
      level_number: levelNumber,
      semester,
      target_start_surah: startSurah,
      target_start_ayah: startAyah,
      target_end_surah: endSurah,
      target_end_ayah: endAyah,
    })
    .select('id')
    .single();

  if (error || !level) {
    redirect(`${back}&error=${encodeURIComponent(error?.message || 'خطأ غير معروف')}`);
  }

  if (mode === 'historical') {
    const { error: examError } = await supabase.from('exam_results').insert({
      level_id: level.id,
      exam_date: examDate,
      score,
      grade: scoreToGrade(score),
      passed: isPassing(score),
    });

    if (examError) {
      redirect(`${back}&error=${encodeURIComponent(examError.message)}`);
    }
  }

  redirect('/levels');
}

export default async function AssignLevelPage({ searchParams }) {
  const params = await searchParams;
  const studentId = params?.studentId;
  const isHistorical = params?.mode === 'historical';

  const { supabase } = await requireRole(PAGE_ROLES.levels);

  if (!studentId) {
    redirect('/levels');
  }

  const [{ data: student }, { data: last }] = await Promise.all([
    supabase.from('students').select('id, name').eq('id', studentId).single(),
    supabase
      .from('student_levels')
      .select('level_number')
      .eq('student_id', studentId)
      .order('level_number', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!student) {
    redirect('/levels');
  }

  const nextNumber = (last?.level_number ?? 0) + 1;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-xl mx-auto bg-white rounded-2xl shadow-md border border-slate-200 p-8">
        <h1 className="text-2xl font-bold text-slate-800 mb-1">
          {isHistorical ? 'تسجيل مستوى سابق' : 'تعيين المستوى التالي'}
        </h1>
        <p className="text-slate-500 mb-1">{student.name}</p>
        <p className="text-brand-700 font-bold mb-6">
          سيُسجَّل باسم: {levelName(nextNumber)}
        </p>

        {isHistorical ? (
          <p className="text-sm bg-amber-50 border border-amber-200 text-amber-800 rounded-lg p-3 mb-4">
            هذا لمستوى أنهاه الطالب فعلاً من قبل. يُعتمد ناجحاً فوراً بالدرجة اللي تدخلها،
            وتصدر شهادته مباشرة، بدون انتظار تقدم يومي.
          </p>
        ) : (
          <p className="text-sm bg-slate-50 border border-slate-200 text-slate-600 rounded-lg p-3 mb-4">
            هذا هو المستوى اللي يشتغل عليه الطالب الآن. يتتبّع النظام تقدمه يومياً من سرد
            الحفظ الجديد، وإذا أكمله يصير جاهزاً للاختبار.
          </p>
        )}

        {params?.error && (
          <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            {params.error}
          </p>
        )}

        <form action={assignLevel} className="flex flex-col gap-4">
          <input type="hidden" name="studentId" value={student.id} />
          <input type="hidden" name="mode" value={isHistorical ? 'historical' : 'current'} />

          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1">الفصل/الفترة</label>
            <input
              type="text"
              name="semester"
              placeholder="مثال: الفصل الثاني ١٤٤٧"
              required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-brand-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1">من سورة</label>
              <select
                name="startSurah"
                required
                className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-brand-500"
              >
                {SURAHS_DESC.map((s) => (
                  <option key={s.number} value={s.number}>
                    {s.number}. {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1">آية</label>
              <input
                type="number"
                name="startAyah"
                min="1"
                required
                defaultValue="1"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-brand-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1">إلى سورة</label>
              <select
                name="endSurah"
                required
                className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-brand-500"
              >
                {SURAHS_DESC.map((s) => (
                  <option key={s.number} value={s.number}>
                    {s.number}. {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1">آية</label>
              <input
                type="number"
                name="endAyah"
                min="1"
                required
                defaultValue="1"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-brand-500"
              />
            </div>
          </div>

          {isHistorical && (
            <>
              <hr className="border-slate-200" />
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
            </>
          )}

          <button
            type="submit"
            className="bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-lg py-2.5 transition mt-2"
          >
            {isHistorical ? 'حفظ المستوى السابق' : 'حفظ المستوى'}
          </button>
        </form>

        <a href="/levels" className="inline-block mt-6 text-brand-700 font-bold">
          ← رجوع
        </a>
      </div>
    </div>
  );
}
