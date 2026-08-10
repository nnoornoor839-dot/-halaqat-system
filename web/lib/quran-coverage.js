// حساب نسبة تقدم الطالب: يحوّل مدى (سورة:آية → سورة:آية) لمجموعة أرقام آيات مطلقة،
// ويقارن بين "المدى المستهدف" و"كل الآيات اللي غطاها الطالب فعلياً عبر سجلاته اليومية"
// (بلا تكرار — نفس فلسفة quranEngine.js اللي بنيناه واختبرناه بالبداية).
import { SURAHS } from './quran-surahs.js';

const surahStarts = {};
let absIndex = 1;
for (const s of SURAHS) {
  surahStarts[s.number] = absIndex;
  absIndex += s.ayahCount;
}
const surahAyahCount = Object.fromEntries(SURAHS.map((s) => [s.number, s.ayahCount]));

export function rangeToAyahSet(s1, a1, s2, a2) {
  const max1 = surahAyahCount[s1];
  const max2 = surahAyahCount[s2];
  if (!max1 || !max2) return new Set();
  a1 = Math.min(Math.max(1, a1), max1);
  a2 = Math.min(Math.max(1, a2), max2);

  const set = new Set();
  if (s1 === s2) {
    const minA = Math.min(a1, a2);
    const maxA = Math.max(a1, a2);
    for (let a = minA; a <= maxA; a++) set.add(surahStarts[s1] + a - 1);
  } else if (s1 < s2) {
    for (let a = a1; a <= max1; a++) set.add(surahStarts[s1] + a - 1);
    for (let s = s1 + 1; s < s2; s++) {
      for (let a = 1; a <= surahAyahCount[s]; a++) set.add(surahStarts[s] + a - 1);
    }
    for (let a = 1; a <= a2; a++) set.add(surahStarts[s2] + a - 1);
  } else {
    for (let a = a1; a <= max1; a++) set.add(surahStarts[s1] + a - 1);
    for (let s = s1 - 1; s > s2; s--) {
      for (let a = 1; a <= surahAyahCount[s]; a++) set.add(surahStarts[s] + a - 1);
    }
    for (let a = 1; a <= a2; a++) set.add(surahStarts[s2] + a - 1);
  }
  return set;
}

export function computeProgress(target, records) {
  const targetSet = rangeToAyahSet(
    target.target_start_surah,
    target.target_start_ayah,
    target.target_end_surah,
    target.target_end_ayah
  );

  const coveredSet = new Set();
  for (const r of records) {
    const s = rangeToAyahSet(r.start_surah, r.start_ayah, r.end_surah, r.end_ayah);
    for (const a of s) coveredSet.add(a);
  }

  let coveredInTarget = 0;
  for (const a of targetSet) {
    if (coveredSet.has(a)) coveredInTarget++;
  }

  const percent = targetSet.size > 0 ? Math.round((coveredInTarget / targetSet.size) * 100) : 0;
  return { percent, coveredInTarget, targetTotal: targetSet.size };
}
