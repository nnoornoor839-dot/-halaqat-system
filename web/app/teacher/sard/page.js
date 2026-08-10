import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SURAHS } from '@/lib/quran-surahs';

async function recordSard(formData) {
  'use server';

  const studentId = formData.get('studentId');
  const type = formData.get('type');
  const startSurah = parseInt(formData.get('startSurah'), 10);
  const startAyah = parseInt(formData.get('startAyah'), 10);
  const endSurah = parseInt(formData.get('endSurah'), 10);
  const endAyah = parseInt(formData.get('endAyah'), 10);
  const today = new Date().toISOString().slice(0, 10);

  const supabase = await createClient();
  const { error } = await supabase.from('daily_records').insert({
    student_id: studentId,
    date: today,
    type,
    start_surah: startSurah,
    start_ayah: startAyah,
    end_surah: endSurah,
    end_ayah: endAyah,
  });

  if (error) {
    redirect(`/teacher/sard?studentId=${studentId}&error=1`);
  }

  redirect('/teacher');
}

export default async function SardPage({ searchParams }) {
  const params = await searchParams;
  const studentId = params?.studentId;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  if (!studentId) {
    redirect('/teacher');
  }

  const { data: student } = await supabase
    .from('students')
    .select('id, name')
    .eq('id', studentId)
    .single();

  if (!student) {
    redirect('/teacher');
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data: todayRecords } = await supabase
    .from('daily_records')
    .select('type, start_surah, start_ayah, end_surah, end_ayah')
    .eq('student_id', studentId)
    .eq('date', today);

  const surahName = (num) => SURAHS.find((s) => s.number === num)?.name ?? num;

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-xl mx-auto bg-white rounded-2xl shadow-md border border-slate-200 p-8">
        <h1 className="text-2xl font-bold text-slate-800 mb-1">تسجيل سرد</h1>
        <p className="text-slate-500 mb-6">
          {student.name} — {today}
        </p>

        {params?.error && (
          <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            صار خطأ أثناء الحفظ، تأكد من البيانات وحاول مرة ثانية.
          </p>
        )}

        {todayRecords && todayRecords.length > 0 && (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-6 text-sm">
            <p className="font-bold text-slate-600 mb-2">مسجّل اليوم:</p>
            <ul className="flex flex-col gap-1">
              {todayRecords.map((r, i) => (
                <li key={i}>
                  {r.type}: من {surahName(r.start_surah)} ({r.start_ayah}) إلى{' '}
                  {surahName(r.end_surah)} ({r.end_ayah})
                </li>
              ))}
            </ul>
          </div>
        )}

        <form action={recordSard} className="flex flex-col gap-4">
          <input type="hidden" name="studentId" value={student.id} />

          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1">النوع</label>
            <select
              name="type"
              required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-emerald-500"
            >
              <option value="جديد">حفظ جديد</option>
              <option value="مراجعة">مراجعة</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1">من سورة</label>
              <select
                name="startSurah"
                required
                className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-emerald-500"
              >
                {SURAHS.map((s) => (
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
                className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1">إلى سورة</label>
              <select
                name="endSurah"
                required
                className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-emerald-500"
              >
                {SURAHS.map((s) => (
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
                className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <button
            type="submit"
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg py-2.5 transition mt-2"
          >
            حفظ السرد
          </button>
        </form>

        <a href="/teacher" className="inline-block mt-6 text-emerald-700 font-bold">
          ← رجوع لتحضير اليوم
        </a>
      </div>
    </div>
  );
}
