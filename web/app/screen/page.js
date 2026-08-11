import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { computeProgress } from '@/lib/quran-coverage';
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
      .in('student_id', idsFilter),
    supabase
      .from('daily_records')
      .select('student_id, start_surah, start_ayah, end_surah, end_ayah')
      .in('student_id', idsFilter),
  ]);

  const levelMap = new Map((levels ?? []).map((l) => [l.student_id, l]));
  const recordsMap = new Map();
  for (const r of allRecords ?? []) {
    if (!recordsMap.has(r.student_id)) recordsMap.set(r.student_id, []);
    recordsMap.get(r.student_id).push(r);
  }

  const halaqat = (halaqatRows ?? []).map((h) => ({
    id: h.id,
    name: h.name,
    students: (students ?? [])
      .filter((s) => s.halaqah_id === h.id)
      .map((s) => {
        const level = levelMap.get(s.id);
        const progress = level ? computeProgress(level, recordsMap.get(s.id) ?? []).percent : null;
        return { id: s.id, name: s.name, progress };
      }),
  }));

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-10" dir="rtl">
      <ScreenRotator halaqat={halaqat} />
    </div>
  );
}
