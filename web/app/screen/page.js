import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { computeProgress } from '@/lib/quran-progress';
import { buildQuranIndex } from '@/lib/quran-index';
import QuranEngine from '@/lib/quranEngine';
import ScreenRotator from './ScreenRotator';

export default async function ScreenPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

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
      .select('student_id, date, start_surah, start_ayah, end_surah, end_ayah')
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

  // فرسان اليوم: أعلى 3 طلاب حسب عدد الآيات المسجّلة اليوم فقط (بلا تكرار لو فيه تسجيلات متداخلة)
  const today = new Date().toISOString().slice(0, 10);
  const studentMap = new Map((students ?? []).map((s) => [s.id, s]));
  const halaqahNameMap = new Map((halaqatRows ?? []).map((h) => [h.id, h.name]));

  const todayRecordsByStudent = new Map();
  for (const r of allRecords ?? []) {
    if (r.date !== today) continue;
    if (!todayRecordsByStudent.has(r.student_id)) todayRecordsByStudent.set(r.student_id, []);
    todayRecordsByStudent.get(r.student_id).push(r);
  }

  const champions = [];
  for (const [studentId, records] of todayRecordsByStudent.entries()) {
    const state = QuranEngine.createCoverageState();
    for (const r of records) {
      const { ayahsToProcess } = QuranEngine.calculateRangeStats(
        quranIndex,
        r.start_surah,
        r.start_ayah,
        r.end_surah,
        r.end_ayah
      );
      QuranEngine.recordCoverage(state, 'اليوم', ayahsToProcess);
    }
    const ayahsToday = (state.coverage['اليوم'] || []).length;
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
