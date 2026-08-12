import { computeProgress } from '@/lib/quran-progress';
import { buildQuranIndex } from '@/lib/quran-index';
import QuranEngine from '@/lib/quranEngine';
import { requireRole, PAGE_ROLES } from '@/lib/auth';
import ScreenRotator from './ScreenRotator';

export default async function ScreenPage() {
  const { supabase } = await requireRole(PAGE_ROLES.screen);

  const [{ data: halaqatRows }, { data: students }] = await Promise.all([
    supabase.from('halaqat').select('id, name').order('name'),
    supabase.from('students').select('id, name, halaqah_id').order('name'),
  ]);

  const studentIds = (students ?? []).map((s) => s.id);
  const idsFilter = studentIds.length ? studentIds : [-1];

  const [{ data: levels }, { data: allRecords }] = await Promise.all([
    supabase
      .from('student_levels')
      .select('student_id, target_start_surah, target_start_ayah, target_end_surah, target_end_ayah')
      .in('student_id', idsFilter)
      .order('id', { ascending: true }),
    supabase
      .from('daily_records')
      .select('student_id, type, date, start_surah, start_ayah, end_surah, end_ayah')
      .eq('type', 'جديد')
      .in('student_id', idsFilter),
  ]);

  const levelMap = new Map((levels ?? []).map((l) => [l.student_id, l]));
  const recordsMap = new Map();
  for (const r of allRecords ?? []) {
    if (!recordsMap.has(r.student_id)) recordsMap.set(r.student_id, []);
    recordsMap.get(r.student_id).push(r);
  }

  const quranIndex = buildQuranIndex();

  const halaqat = (halaqatRows ?? []).map((h) => ({
    id: h.id,
    name: h.name,
    students: (students ?? [])
      .filter((s) => s.halaqah_id === h.id)
      .map((s) => {
        const level = levelMap.get(s.id);
        const progress = level ? computeProgress(quranIndex, level, recordsMap.get(s.id) ?? []).percent : null;
        return { id: s.id, name: s.name, progress };
      }),
  }));

  // فرسان اليوم: ترتيب بالآيات الجديدة فعلاً اليوم، لا بالمسرود.
  // السرد تراكمي من أول السورة، فطالب سرد ١-١٠ اليوم وكان واصلاً ١-٥ أمس
  // أنتج ٥ آيات جديدة لا ١٠ — وبدون هذا الفرق يتصدّر صاحب السورة الطويلة
  // لمجرد تراكم إعادته.
  const today = new Date().toISOString().slice(0, 10);
  const studentMap = new Map((students ?? []).map((s) => [s.id, s]));
  const halaqahNameMap = new Map((halaqatRows ?? []).map((h) => [h.id, h.name]));

  const splitByStudent = new Map();
  for (const r of allRecords ?? []) {
    if (!splitByStudent.has(r.student_id)) {
      splitByStudent.set(r.student_id, { before: [], today: [] });
    }
    const bucket = splitByStudent.get(r.student_id);
    if (r.date === today) bucket.today.push(r);
    else if (r.date < today) bucket.before.push(r);
  }

  const ayahsOf = (records) => {
    const set = new Set();
    for (const r of records) {
      const { ayahsToProcess } = QuranEngine.calculateRangeStats(
        quranIndex,
        r.start_surah,
        r.start_ayah,
        r.end_surah,
        r.end_ayah
      );
      for (const a of ayahsToProcess) set.add(a);
    }
    return set;
  };

  const champions = [];
  for (const [studentId, { before, today: todayRecs }] of splitByStudent.entries()) {
    if (todayRecs.length === 0) continue;
    const beforeSet = ayahsOf(before);
    let ayahsToday = 0;
    for (const a of ayahsOf(todayRecs)) {
      if (!beforeSet.has(a)) ayahsToday++;
    }
    const student = studentMap.get(studentId);
    if (ayahsToday === 0 || !student) continue;
    champions.push({
      id: studentId,
      name: student.name,
      halaqahName: halaqahNameMap.get(student.halaqah_id) ?? '',
      ayahsToday,
    });
  }
  champions.sort((a, b) => b.ayahsToday - a.ayahsToday);
  const topChampions = champions.slice(0, 3);

  const slides = [
    ...(topChampions.length > 0 ? [{ type: 'champions', champions: topChampions }] : []),
    ...halaqat.map((h) => ({ type: 'halaqa', ...h })),
  ];

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-10" dir="rtl">
      <ScreenRotator slides={slides} />
    </div>
  );
}
