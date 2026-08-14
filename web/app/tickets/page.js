import { revalidatePath } from 'next/cache';
import { requireRole, PAGE_ROLES } from '@/lib/auth';
import { getWorkWeekDates } from '@/lib/work-days';

const DAY_NAMES = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء'];

async function issueTickets(formData) {
  'use server';
  const weekStart = formData.get('weekStart');
  const eligibleIds = formData.getAll('eligibleStudentId');

  const { supabase } = await requireRole(PAGE_ROLES.tickets);
  if (eligibleIds.length > 0) {
    // نتأكد ما نصدر تذكرة مكررة (الصفحة نفسها ما ترسل إلا الطلاب اللي لسه ما صدرت لهم،
    // بس نتحقق مرة ثانية هنا احتياطاً من حالة سباق لو فتح المشرف الصفحة بتبويبين).
    const { data: alreadyIssued } = await supabase
      .from('weekly_tickets')
      .select('student_id')
      .eq('week_start', weekStart)
      .in('student_id', eligibleIds);
    const alreadyIssuedSet = new Set((alreadyIssued ?? []).map((r) => r.student_id));
    const toInsert = eligibleIds
      .filter((id) => !alreadyIssuedSet.has(id))
      .map((id) => ({ student_id: id, week_start: weekStart }));

    if (toInsert.length > 0) {
      await supabase.from('weekly_tickets').insert(toInsert);
    }
  }
  revalidatePath('/tickets');
}

export default async function TicketsPage() {
  const { supabase } = await requireRole(PAGE_ROLES.tickets);

  const weekDates = getWorkWeekDates();
  const weekStart = weekDates[0];

  const [{ data: students }, { data: issuedRows }] = await Promise.all([
    supabase.from('students').select('id, name').order('name'),
    supabase.from('weekly_tickets').select('student_id').eq('week_start', weekStart),
  ]);
  const studentIds = (students ?? []).map((s) => s.id);
  const idsFilter = studentIds.length ? studentIds : [-1];

  const [{ data: attendanceRows }, { data: recordRows }] = await Promise.all([
    supabase
      .from('attendance')
      .select('student_id, date, attended, early_arrival')
      .in('student_id', idsFilter)
      .in('date', weekDates),
    supabase.from('daily_records').select('student_id, date').in('student_id', idsFilter).in('date', weekDates),
  ]);

  const issuedSet = new Set((issuedRows ?? []).map((r) => r.student_id));

  const attendanceMap = new Map(); // studentId -> { date -> row }
  for (const a of attendanceRows ?? []) {
    if (!attendanceMap.has(a.student_id)) attendanceMap.set(a.student_id, new Map());
    attendanceMap.get(a.student_id).set(a.date, a);
  }
  const recordDaysMap = new Map(); // studentId -> Set(date)
  for (const r of recordRows ?? []) {
    if (!recordDaysMap.has(r.student_id)) recordDaysMap.set(r.student_id, new Set());
    recordDaysMap.get(r.student_id).add(r.date);
  }

  const rows = (students ?? []).map((s) => {
    const att = attendanceMap.get(s.id) ?? new Map();
    const recDays = recordDaysMap.get(s.id) ?? new Set();

    const dayStatus = weekDates.map((date) => {
      const a = att.get(date);
      return a?.attended === true && a?.early_arrival === true && recDays.has(date);
    });

    const eligible = dayStatus.every(Boolean);
    return { student: s, dayStatus, eligible, issued: issuedSet.has(s.id) };
  });

  return (
    <div dir="rtl" className="bg-slate-50 p-4 sm:p-8">
      <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-md border border-slate-200 p-5 sm:p-8">
        <h1 className="text-2xl font-bold text-slate-800 mb-1">تذاكر الترفيه الأسبوعية</h1>
        <p className="text-slate-500 mb-6">
          أسبوع {weekDates[0]} إلى {weekDates[3]} — الشرط: حضور مبكر + سرد يومي طول أيام العمل
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse text-sm">
            <thead>
              <tr className="border-b-2 border-slate-200 text-slate-600">
                <th className="py-2 px-2">الطالب</th>
                {DAY_NAMES.map((d) => (
                  <th key={d} className="py-2 px-2 text-center">
                    {d}
                  </th>
                ))}
                <th className="py-2 px-2 text-center">الاستحقاق</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ student, dayStatus, eligible, issued }) => (
                <tr key={student.id} className="border-b border-slate-100">
                  <td className="py-3 px-2 font-bold text-slate-700">{student.name}</td>
                  {dayStatus.map((ok, i) => (
                    <td key={i} className="py-3 px-2 text-center">
                      {ok ? '✅' : '—'}
                    </td>
                  ))}
                  <td className="py-3 px-2 text-center">
                    {issued ? (
                      <span className="text-brand-600 font-bold">🎟️ صدرت</span>
                    ) : eligible ? (
                      <span className="text-amber-600 font-bold">مستحق</span>
                    ) : (
                      <span className="text-slate-400">غير مستحق</span>
                    )}
                  </td>
                </tr>
              ))}

              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400">
                    ما فيه طلاب مرتبطين بحسابك.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <form action={issueTickets} className="mt-6">
          <input type="hidden" name="weekStart" value={weekStart} />
          {rows
            .filter((r) => r.eligible && !r.issued)
            .map((r) => (
              <input
                key={r.student.id}
                type="hidden"
                name="eligibleStudentId"
                value={r.student.id}
              />
            ))}
          <button
            type="submit"
            className="bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg px-5 py-2.5 transition"
          >
            إصدار تذاكر المستحقين 🎟️
          </button>
        </form>
      </div>
    </div>
  );
}
