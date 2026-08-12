import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { SURAHS } from '@/lib/quran-surahs';
import { levelName } from '@/lib/level-name';
import PrintButton from './PrintButton';

const ASSOCIATION_NAME = '[اسم الجمعية]';

function surahName(num) {
  return SURAHS.find((s) => s.number === num)?.name ?? num;
}

export default async function CertificatePage({ searchParams }) {
  const params = await searchParams;
  const examId = params?.examId;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  if (!examId) {
    redirect('/levels');
  }

  const { data: exam } = await supabase
    .from('exam_results')
    .select('id, level_id, exam_date, score, grade, passed')
    .eq('id', examId)
    .single();

  if (!exam || !exam.passed) {
    redirect('/levels');
  }

  const { data: level } = await supabase
    .from('student_levels')
    .select(
      'id, student_id, level_number, semester, target_start_surah, target_start_ayah, target_end_surah, target_end_ayah'
    )
    .eq('id', exam.level_id)
    .single();

  if (!level) {
    redirect('/levels');
  }

  const { data: student } = await supabase.from('students').select('id, name').eq('id', level.student_id).single();

  const examDateLabel = new Date(exam.exam_date).toLocaleDateString('ar-SA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div dir="rtl" className="min-h-screen bg-slate-100 p-8 print:bg-white print:p-0">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
        }
      `}</style>

      <div className="max-w-2xl mx-auto no-print mb-6 flex justify-between items-center">
        <a href="/levels" className="text-emerald-700 font-bold">
          ← رجوع
        </a>
        <PrintButton />
      </div>

      <div className="max-w-2xl mx-auto bg-white shadow-md border border-slate-300 p-10 print:shadow-none print:border-0 text-center">
        <div className="border-b-4 border-slate-800 pb-4 mb-8">
          <h1 className="text-2xl font-black text-slate-800">{ASSOCIATION_NAME}</h1>
          <p className="text-slate-500 mt-1">
            شهادة اجتياز {levelName(level.level_number)}
          </p>
        </div>

        <p className="text-lg text-slate-600 mb-2">تشهد إدارة الجمعية بأن الطالب</p>
        <p className="text-3xl font-black text-slate-800 mb-6">{student?.name}</p>

        <p className="text-lg leading-loose text-slate-700 mb-8">
          قد اجتاز بنجاح اختبار حفظ المدى الممتد من{' '}
          <strong>
            {surahName(level.target_start_surah)}:{level.target_start_ayah}
          </strong>{' '}
          إلى{' '}
          <strong>
            {surahName(level.target_end_surah)}:{level.target_end_ayah}
          </strong>
          {level.semester && (
            <>
              {' '}
              ضمن <strong>{level.semester}</strong>
            </>
          )}
          ، بتاريخ <strong>{examDateLabel}</strong>.
        </p>

        <table className="w-full border-collapse mb-8">
          <tbody>
            <tr className="border-b border-slate-200">
              <td className="py-3 font-bold text-slate-600">الدرجة</td>
              <td className="py-3 text-left font-black">{exam.score} / 100</td>
            </tr>
            <tr className="bg-slate-50">
              <td className="py-3 font-bold text-slate-800 text-lg">التقدير</td>
              <td className="py-3 text-left font-black text-emerald-700 text-xl">{exam.grade}</td>
            </tr>
          </tbody>
        </table>

        <div className="flex justify-between mt-16 text-slate-600">
          <div className="text-center">
            <p className="mb-12">توقيع المشرف</p>
            <p>____________________</p>
          </div>
          <div className="text-center">
            <p className="mb-12">اعتماد المدير التنفيذي</p>
            <p>____________________</p>
          </div>
        </div>
      </div>
    </div>
  );
}
