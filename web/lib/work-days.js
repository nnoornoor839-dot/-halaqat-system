// أسبوع العمل بالجمعية: الأحد إلى الأربعاء (getDay: 0=الأحد … 3=الأربعاء).
const WORK_DAYS = [0, 1, 2, 3];

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

/** تواريخ أسبوع العمل الحالي (الأحد إلى الأربعاء). */
export function getWorkWeekDates(today = new Date()) {
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
