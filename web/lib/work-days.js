// أسبوع العمل بالجمعية: الأحد إلى الأربعاء (getDay: 0=الأحد … 3=الأربعاء).
const WORK_DAYS = [0, 1, 2, 3];

// عتبات التنبيه، بأيام العمل. مكانها هنا لا في الصفحات لأن أكثر من صفحة
// تعرض التنبيه نفسه، فتعريفها مرتين يعني تعديلين عند أي تغيير — ويُنسى أحدهما.

/**
 * ساعة المعلم: من إتمام التغطية إلى تأكيد الجاهزية. أقصر من ساعة المشرف
 * لأن المعلم يسمع الطالب يومياً، فلا عذر له في التأخر.
 */
export const CONFIRM_DELAY_WORK_DAYS = 2;

/** ساعة المشرف: من تأكيد المعلم إلى رصد الاختبار. */
export const EXAM_DELAY_WORK_DAYS = 3;

/** طالب لم تُسجَّل له مراجعة منذ هذي المدة وهو غير متوقف لاختبار. */
export const STALE_REVIEW_WORK_DAYS = 3;

export function isWorkDay(date) {
  return WORK_DAYS.includes(date.getDay());
}

/** أيام العمل التي مرّت بعد fromISO حتى toISO (لا تشمل يوم البداية نفسه). */
export function countWorkDaysBetween(fromISO, toISO) {
  if (!fromISO || !toISO) return 0;
  const to = new Date(`${toISO}T00:00:00Z`);
  const cursor = new Date(`${fromISO}T00:00:00Z`);
  cursor.setUTCDate(cursor.getUTCDate() + 1);

  let count = 0;
  while (cursor <= to) {
    if (WORK_DAYS.includes(cursor.getUTCDay())) count++;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

/** أيام العمل السابقة مباشرةً قبل يوم معيّن، الأقرب أولاً. */
export function previousWorkDays(todayISO, count) {
  const days = [];
  const cursor = new Date(`${todayISO}T00:00:00Z`);
  let guard = 0;
  while (days.length < count && guard < 60) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    if (WORK_DAYS.includes(cursor.getUTCDay())) {
      days.push(cursor.toISOString().slice(0, 10));
    }
    guard++;
  }
  return days;
}

/**
 * تواريخ أسبوع العمل الحالي (الأحد إلى الأربعاء).
 *
 * الحساب كله بـ UTC كبقية دوال الملف. النسخة السابقة كانت تقرأ اليوم
 * بالتوقيت المحلي (getDate و getDay) ثم تُخرج بـ toISOString وهي UTC،
 * فتختلط المرجعيتان. لا فرق على Vercel لأن خوادمه تعمل بـ UTC، لكن أي
 * بيئة بمنطقة زمنية أخرى كانت ستزيح الأسبوع يوماً كاملاً بصمت، فتُحتسب
 * التذاكر على أيام خاطئة.
 */
export function getWorkWeekDates(today = new Date()) {
  const cursor = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  );
  cursor.setUTCDate(cursor.getUTCDate() - cursor.getUTCDay()); // الرجوع للأحد

  const dates = [];
  for (let i = 0; i < 4; i++) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}
