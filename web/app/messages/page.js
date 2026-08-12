import { requireRole, PAGE_ROLES } from '@/lib/auth';

const ASSOCIATION_NAME = '[اسم الجمعية]'; // نص عام مؤقت — يستبدل لاحقاً بالاسم الحقيقي

function notifyLink(table, id, phone, text) {
  const params = new URLSearchParams({ table, id: String(id), phone: phone || '', text });
  return `/api/notify?${params.toString()}`;
}

export default async function MessagesPage() {
  const { supabase } = await requireRole(PAGE_ROLES.messages);

  const today = new Date().toISOString().slice(0, 10);
  const todayLabel = new Date().toLocaleDateString('ar-SA', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const { data: students } = await supabase
    .from('students')
    .select('id, name, parent_phone, halaqat(name)');
  const studentMap = new Map((students ?? []).map((s) => [s.id, s]));
  const studentIds = [...studentMap.keys()];
  const idsFilter = studentIds.length ? studentIds : [-1];

  const [{ data: absences }, { data: newMilestones }] = await Promise.all([
    supabase
      .from('attendance')
      .select('id, student_id, date')
      .eq('date', today)
      .eq('attended', false)
      .eq('notified', false)
      .in('student_id', idsFilter),
    supabase
      .from('milestone_log')
      .select('id, student_id, milestone_percent')
      .eq('notified', false)
      .in('student_id', idsFilter),
  ]);

  const absenceItems = (absences ?? [])
    .map((a) => {
      const student = studentMap.get(a.student_id);
      if (!student) return null;
      const text = `السلام عليكم ولي أمر الطالب ${student.name}،

نفيدكم بغياب ابنكم اليوم ${todayLabel} عن ${student.halaqat?.name ?? 'حلقته'}.
نأمل التواصل معنا في حال وجود عذر.

${ASSOCIATION_NAME}`;
      return { key: `att-${a.id}`, table: 'attendance', id: a.id, student, text, kind: 'غياب', icon: '🔴' };
    })
    .filter(Boolean);

  const milestoneItems = (newMilestones ?? [])
    .map((m) => {
      const student = studentMap.get(m.student_id);
      if (!student) return null;
      const isFull = m.milestone_percent === 100;
      const text = isFull
        ? `السلام عليكم ولي أمر الطالب ${student.name}،

يسعدنا إبلاغكم بأن ابنكم أنهى هدفه المحدد بالكامل، وأصبح جاهزاً لاختبار نهاية الفصل. بارك الله فيه.

${ASSOCIATION_NAME}`
        : `السلام عليكم ولي أمر الطالب ${student.name}،

يسعدنا إبلاغكم بأن ابنكم بلغ ${m.milestone_percent}% من هدفه المحدد لهذا الفصل. نشجعه على الاستمرار.

${ASSOCIATION_NAME}`;
      return {
        key: `ms-${m.id}`,
        table: 'milestone_log',
        id: m.id,
        student,
        text,
        kind: isFull ? 'إنهاء الهدف' : `إنجاز ${m.milestone_percent}%`,
        icon: isFull ? '🏆' : '🎉',
      };
    })
    .filter(Boolean);

  const items = [...absenceItems, ...milestoneItems];

  return (
    <div dir="rtl" className="min-h-screen bg-slate-50 p-8">
      <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-md border border-slate-200 p-8">
        <h1 className="text-2xl font-bold text-slate-800 mb-1">رسائل اليوم</h1>
        <p className="text-slate-500 mb-6">{todayLabel}</p>

        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <div
              key={item.key}
              className="border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
            >
              <div>
                <p className="font-bold text-slate-700">
                  {item.icon} {item.kind}: {item.student.name}
                </p>
                <p className="text-sm text-slate-400">
                  {item.student.halaqat?.name ?? ''}
                  {!item.student.parent_phone && (
                    <span className="text-red-500"> — ما فيه رقم جوال مسجّل لولي الأمر</span>
                  )}
                </p>
              </div>
              <div className="flex gap-2 shrink-0">
                {item.student.parent_phone ? (
                  <a
                    href={notifyLink(item.table, item.id, item.student.parent_phone, item.text)}
                    target="_blank"
                    rel="noreferrer"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-lg px-4 py-2 transition"
                  >
                    إرسال واتساب
                  </a>
                ) : (
                  <span className="text-slate-400 text-sm">لا يوجد رقم</span>
                )}
              </div>
            </div>
          ))}

          {items.length === 0 && (
            <p className="text-slate-400 text-center py-8">ما فيه رسائل تحتاج إرسال اليوم 🎉</p>
          )}
        </div>

        <a href="/dashboard" className="inline-block mt-8 text-emerald-700 font-bold">
          ← رجوع للوحة التحكم
        </a>
      </div>
    </div>
  );
}
