// بوابة تأكيد الجاهزية للاختبار — منطق واحد تستخدمه أربع صفحات.
//
// إتمام التغطية حسابٌ آلي لا يعرف إن كان الطالب يتقن ما غطّاه. فالمعلم
// يؤكد، والمشرف لا يرصد اختباراً قبل تأكيده.

/**
 * حالة التأكيد لمستوى واحد.
 *
 * @param rows  صفوف exam_readiness لهذا المستوى (أي ترتيب)
 * @param exams صفوف exam_results لهذا المستوى (أي ترتيب)
 *
 * القاعدة: التأكيد صالح فقط إن كان آخر فعل هو `confirm`، وكان أحدث من آخر
 * محاولة اختبار. الشرط الثاني هو ما يُسقط التأكيد تلقائياً بعد الرسوب:
 * صف الاختبار يصير أحدث، فيُطلب من المعلم تأكيد جديد للإعادة — بلا عمود
 * إضافي ولا حالة تُمسح.
 */
export function readinessState(rows = [], exams = []) {
  const latest = [...rows].sort(byTimeDesc('acted_at'))[0] ?? null;
  const latestExam = [...exams].sort(byTimeDesc('created_at'))[0] ?? null;

  if (!latest || latest.action !== 'confirm') {
    return { confirmed: false, confirmedAt: null, staleAfterExam: false };
  }

  // اختبار أحدث من التأكيد يعني أن التأكيد كان لمحاولة انتهت.
  if (latestExam && time(latestExam.created_at) > time(latest.acted_at)) {
    return { confirmed: false, confirmedAt: null, staleAfterExam: true };
  }

  return { confirmed: true, confirmedAt: latest.acted_at, staleAfterExam: false };
}

/** تجميع صفوف exam_readiness بمعرّف المستوى. */
export function groupByLevel(rows = []) {
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.level_id)) map.set(r.level_id, []);
    map.get(r.level_id).push(r);
  }
  return map;
}

/** تاريخ إتمام المستوى = آخر تسجيل جديد، لأن التسجيل يُقفل بعد الإتمام. */
export function completionDate(newRecords = []) {
  const dates = newRecords.filter((r) => r.date).map((r) => r.date).sort();
  return dates[dates.length - 1] ?? null;
}

function time(v) {
  return v ? new Date(v).getTime() : 0;
}

function byTimeDesc(field) {
  return (a, b) => {
    const d = time(b[field]) - time(a[field]);
    return d !== 0 ? d : (b.id ?? 0) - (a.id ?? 0);
  };
}
