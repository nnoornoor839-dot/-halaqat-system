// منطق نظام الجديد: السرد التراكمي داخل السورة، وبوابة تسليم السورة.
//
// السرد التراكمي: كل يوم يبدأ الطالب من آية ١ من سورته الحالية إلى النقطة الجديدة،
// لا من حيث توقّف. فتغطية السورة دائماً متصلة من أولها.
//
// بوابة التسليم: من المستوى الثاني فما فوق، بعد إتمام السورة يسمّعها كاملة بجلسة
// واحدة ويعتمدها المعلم، ولا تُفتح السورة التالية قبل الاعتماد.
import QuranEngine from './quranEngine';
import { requiresSurahDelivery } from './level-name';

// ترتيب سور الهدف باتجاه الحفظ (من الناس صعوداً إلى البقرة عند الجمعية،
// أي تنازلياً برقم السورة). ندعم الاتجاهين احتياطاً.
export function targetSurahOrder(level) {
  const s1 = level.target_start_surah;
  const s2 = level.target_end_surah;
  const out = [];
  if (s1 >= s2) {
    for (let s = s1; s >= s2; s--) out.push(s);
  } else {
    for (let s = s1; s <= s2; s++) out.push(s);
  }
  return out;
}

// أي آيات من هذي السورة تقع داخل الهدف. السورة الأولى تُقرأ من آية البداية إلى
// آخرها، والأخيرة من أولها إلى آية النهاية، وما بينهما كاملة.
export function targetAyahRangeForSurah(level, surahNumber, surahAyahCount) {
  const s1 = level.target_start_surah;
  const a1 = level.target_start_ayah;
  const s2 = level.target_end_surah;
  const a2 = level.target_end_ayah;

  if (s1 === s2) {
    if (surahNumber !== s1) return null;
    return { from: Math.min(a1, a2), to: Math.max(a1, a2) };
  }

  const descending = s1 > s2;
  const withinRange = descending
    ? surahNumber <= s1 && surahNumber >= s2
    : surahNumber >= s1 && surahNumber <= s2;
  if (!withinRange) return null;

  if (surahNumber === s1) return { from: a1, to: surahAyahCount };
  if (surahNumber === s2) return { from: 1, to: a2 };
  return { from: 1, to: surahAyahCount };
}

/**
 * يحسب حالة الجديد للطالب: سورته الحالية، وآخر آية وصلها فيها، وهل فيه سورة
 * تنتظر التسليم تقفل عليه الانتقال للتالية.
 *
 * newRecords: سجلات "جديد" فقط.
 * deliveries: صفوف surah_deliveries للطالب.
 */
export function computeNewMemorizationState(index, level, newRecords, deliveries, levelNumber) {
  const covered = new Set();
  for (const r of newRecords) {
    const { ayahsToProcess } = QuranEngine.calculateRangeStats(
      index,
      r.start_surah,
      r.start_ayah,
      r.end_surah,
      r.end_ayah
    );
    for (const a of ayahsToProcess) covered.add(a);
  }

  const approvedSurahs = new Set(
    (deliveries ?? []).filter((d) => d.approved).map((d) => d.surah_number)
  );

  const completedSurahs = [];
  let currentSurah = null;
  let lastAyahReached = 0;

  for (const s of targetSurahOrder(level)) {
    const surahAyahCount = index.surahAyahCount[s];
    const range = targetAyahRangeForSurah(level, s, surahAyahCount);
    if (!range) continue;

    const surahStart = index.surahStarts[s];
    let allTargetCovered = true;
    for (let a = range.from; a <= range.to; a++) {
      if (!covered.has(surahStart + a - 1)) {
        allTargetCovered = false;
        break;
      }
    }

    if (allTargetCovered) {
      completedSurahs.push(s);
      continue;
    }

    // السورة الحالية: آخر آية وصلها متصلة من أول السورة (لأن السرد تراكمي)
    currentSurah = s;
    lastAyahReached = 0;
    for (let a = 1; a <= surahAyahCount; a++) {
      if (covered.has(surahStart + a - 1)) lastAyahReached = a;
      else break;
    }
    break;
  }

  // أول سورة مكتملة بلا اعتماد تسليم تقفل البوابة
  let pendingDelivery = null;
  if (requiresSurahDelivery(levelNumber)) {
    for (const s of completedSurahs) {
      if (!approvedSurahs.has(s)) {
        pendingDelivery = s;
        break;
      }
    }
  }

  return {
    currentSurah,
    lastAyahReached,
    pendingDelivery,
    completedSurahs,
    isLevelComplete: currentSurah === null,
  };
}
