import { redirect } from 'next/navigation';
import { requireRole, PAGE_ROLES } from '@/lib/auth';

function getWorkWeekDates() {
  const today = new Date();
  const sunday = new Date(today);
  sunday.setDate(today.getDate() - today.getDay());
  const dates = [];
  for (let i = 0; i < 4; i++) {
    const d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

async function generateRequest(formData) {
  'use server';

  const branchId = formData.get('branchId');
  const weekStart = formData.get('weekStart');
  const ticketCount = parseInt(formData.get('ticketCount'), 10);
  const costPerStudent = parseFloat(formData.get('costPerStudent'));
  const totalAmount = ticketCount * costPerStudent;

  const { supabase } = await requireRole(PAGE_ROLES.finance);
  const { data, error } = await supabase
    .from('financial_requests')
    .insert({
      branch_id: branchId,
      week_start: weekStart,
      ticket_count: ticketCount,
      total_amount: totalAmount,
    })
    .select('id')
    .single();

  if (error || !data) {
    redirect('/finance?error=1');
  }

  redirect(`/finance/letter?id=${data.id}`);
}

export default async function FinancePage() {
  const { supabase, profile } = await requireRole(PAGE_ROLES.finance);

  if (!profile?.branch_id) {
    return (
      <div dir="rtl" className="bg-slate-50 p-4 sm:p-8">
        <div className="max-w-xl mx-auto bg-white rounded-2xl shadow-md border border-slate-200 p-5 sm:p-8">
          <h1 className="text-2xl font-bold text-slate-800 mb-4">حاسبة الميزانية</h1>
          <p className="text-slate-500">
            هذي الميزة مصممة حالياً لحساب المشرف (المرتبط بفرع محدد). سجّل دخول بحساب مشرف
            لاستخدامها.
          </p>
        </div>
      </div>
    );
  }

  const weekDates = getWorkWeekDates();
  const weekStart = weekDates[0];

  const [{ data: students }, { data: existing }] = await Promise.all([
    supabase.from('students').select('id').eq('branch_id', profile.branch_id),
    supabase
      .from('financial_requests')
      .select('id')
      .eq('branch_id', profile.branch_id)
      .eq('week_start', weekStart)
      .maybeSingle(),
  ]);
  const studentIds = (students ?? []).map((s) => s.id);

  const { data: tickets } = await supabase
    .from('weekly_tickets')
    .select('student_id')
    .eq('week_start', weekStart)
    .in('student_id', studentIds.length ? studentIds : [-1]);

  const ticketCount = tickets?.length ?? 0;

  return (
    <div dir="rtl" className="bg-slate-50 p-4 sm:p-8">
      <div className="max-w-xl mx-auto bg-white rounded-2xl shadow-md border border-slate-200 p-5 sm:p-8">
        <h1 className="text-2xl font-bold text-slate-800 mb-1">حاسبة الميزانية</h1>
        <p className="text-slate-500 mb-6">
          أسبوع {weekDates[0]} إلى {weekDates[3]}
        </p>

        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-6">
          <p className="text-lg">
            <span className="font-bold text-slate-600">عدد المستحقين لتذاكر الترفيه: </span>
            <span className="font-black text-brand-700">{ticketCount}</span>
          </p>
        </div>

        {existing ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-amber-800 font-bold mb-3">
              فيه طلب اعتماد مالي صادر أصلاً لهذا الأسبوع.
            </p>
            <a
              href={`/finance/letter?id=${existing.id}`}
              className="inline-block bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-lg px-5 py-2.5 transition"
            >
              عرض / طباعة الخطاب
            </a>
          </div>
        ) : (
          <form action={generateRequest} className="flex flex-col gap-4">
            <input type="hidden" name="branchId" value={profile.branch_id} />
            <input type="hidden" name="weekStart" value={weekStart} />
            <input type="hidden" name="ticketCount" value={ticketCount} />

            <div>
              <label className="block text-sm font-bold text-slate-600 mb-1">
                تكلفة الفرد الواحد (ريال)
              </label>
              <input
                type="number"
                name="costPerStudent"
                min="0"
                step="0.01"
                required
                className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:border-brand-500"
              />
            </div>

            <button
              type="submit"
              className="bg-brand-600 hover:bg-brand-700 text-white font-bold rounded-lg py-2.5 transition"
            >
              توليد خطاب الاعتماد المالي
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
