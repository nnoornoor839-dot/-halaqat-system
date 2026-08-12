import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SURAHS } from '@/lib/quran-surahs';

async function assignLevel(formData) {
  'use server';

  const studentId = formData.get('studentId');
  const semester = formData.get('semester');
  const startSurah = parseInt(formData.get('startSurah'), 10);
  const startAyah = parseInt(formData.get('startAyah'), 10);
  const endSurah = parseInt(formData.get('endSurah'), 10);
  const endAyah = parseInt(formData.get('endAyah'), 10);

  const supabase = await createClient();
  const { error } = await supabase.from('student_levels').insert({
    student_id: studentId,
    semester,
    target_start_surah: startSurah,
    target_start_ayah: startAyah,
    target_end_surah: endSurah,
    target_end_ayah: endAyah,
  });

  if (error) {
    redirect(`/levels/assign?studentId=${studentId}&error=${encodeURIComponent(error.message)}`);
  }

  redirect('/levels');
}

export default async function AssignLevelPage({ searchParams }) {
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
    redirect('/levels');
  }

  const { data: student } = await supabase.from('students').select('id, name').eq('id', studentId).single();

  if (!student) {
    redirect('/levels');
  }

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-xl mx-auto bg-white rounded-2xl shadow-md border border-slate-200 p-8">
        <h1 className="text-2xl font-bold text-slate-800 mb-1">تعيين هدف جديد</h1>
        <p className="text-slate-500 mb-6">{student.name}</p>

        {params?.error && (
          <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
            {params.error}
          </p>
        )}

        <form action={assignLevel} className="flex flex-col gap-4">
          <input type="hidden" name="studentId" value={student.id} />

          <div>
            <label className="block text-sm font-bold text-slate-600 mb-1">الفصل/الفترة</label>
            <input
              type="text"
              name="semester"
              placeholder="مثال: الفصل الثاني ١٤٤٧"
              required
              className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-emerald-500"
            />
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
            حفظ الهدف
          </button>
        </form>

        <a href="/levels" className="inline-block mt-6 text-emerald-700 font-bold">
          ← رجوع
        </a>
      </div>
    </div>
  );
}
