// نظام المراجعة: نطاق تلقائي ودورة تتقدّم بالتسجيل.
//
// النطاق: من الناس إلى آخر ما حفظه الطالب. يتوسّع لوحده كلما تقدّم بالجديد،
// بلا تعيين يدوي. يشمل مستوياته السابقة المعتمدة أيضاً، لأن الطالب المنتقل
// أنهى مستويات بلا سجلات يومية عندنا.
//
// الدورة: الوحدة الكاملة حزب (المستوى ١-٢) أو جزء (الثالث فما فوق)، وتُراجَع
// على ثلاث خطوات — نصفها، ثم نصفها الآخر، ثم كاملة — ثم ننتقل للوحدة التالية.
// الوحدة الناقصة (أرباع لا تكمّل وحدة) تُؤخذ دفعة واحدة. وتُعاد الدورة من الناس.
//
// الحدود تُقرَّب لأقرب طرف سورة فلا تنقطع سورة نصفين.
import QuranEngine from './quranEngine';
import { reviewUnitQuarters } from './level-name';

const TOTAL_QUARTERS = 240;
const TOTAL_AYAHS = 6236;

function surahOf(index, abs) {
  for (let s = 114; s >= 1; s--) {
    const start = index.surahStarts[s];
    if (start !== undefined && abs >= start) return s;
  }
  return 1;
}

/** يبني مجموعة الآيات المحفوظة: سجلات الجديد + مدى كل مستوى سابق معتمد. */
export function buildMemorizedSet(index, newRecords, passedLevels) {
  const set = new Set();

  for (const r of newRecords ?? []) {
    const { ayahsToProcess } = QuranEngine.calculateRangeStats(
      index,
      r.start_surah,
      r.start_ayah,
      r.end_surah,
      r.end_ayah
    );
    for (const a of ayahsToProcess) set.add(a);
  }

  for (const l of passedLevels ?? []) {
    const { ayahsToProcess } = QuranEngine.calculateRangeStats(
      index,
      l.target_start_surah,
      l.target_start_ayah,
      l.target_end_surah,
      l.target_end_ayah
    );
    for (const a of ayahsToProcess) set.add(a);
  }

  return set;
}

/** يقرّب رقم آية مطلق لأقرب بداية سورة (الأقرب فعلياً، قد يتقدّم أو يتأخّر). */
function snapToSurahStart(index, abs) {
  const s = surahOf(index, abs);
  const surahStart = index.surahStarts[s];
  const surahEnd = surahStart + index.surahAyahCount[s] - 1;
  const toThisStart = abs - surahStart;
  const toNextStart = surahEnd + 1 - abs;
  return toThisStart <= toNextStart ? surahStart : surahEnd + 1;
}

/** يقرّب رقم آية مطلق لأقرب نهاية سورة. */
function snapToSurahEnd(index, abs) {
  const s = surahOf(index, abs);
  const surahStart = index.surahStarts[s];
  const surahEnd = surahStart + index.surahAyahCount[s] - 1;
  const toThisEnd = surahEnd - abs;
  const toPrevEnd = abs - (surahStart - 1);
  return toThisEnd <= toPrevEnd ? surahEnd : surahStart - 1;
}

/**
 * يبني خطوات دورة المراجعة كاملة لهذا الطالب.
 * كل خطوة = يوم مراجعة واحد، ممثّلة بقائمة أرقام أرباع مرتّبة باتجاه المراجعة.
 */
export function buildCycleSteps(index, memorizedSet, levelNumber) {
  const half = reviewUnitQuarters(levelNumber); // ٢ أو ٤
  const full = half * 2; // حزب أو جزء

  const memorizedQuarters = new Set();
  for (let qi = 1; qi <= TOTAL_QUARTERS; qi++) {
    const q = index.quarters[qi - 1];
    for (let a = q.start; a <= q.end; a++) {
      if (memorizedSet.has(a)) {
        memorizedQuarters.add(qi);
        break;
      }
    }
  }
  if (memorizedQuarters.size === 0) return [];

  // الوحدات محاذية للأحزاب/الأجزاء المعتمدة، ومرتّبة من الناس صعوداً
  const unitNumbers = new Set();
  for (const qi of memorizedQuarters) unitNumbers.add(Math.ceil(qi / full));

  const steps = [];
  for (const unitNumber of [...unitNumbers].sort((a, b) => b - a)) {
    const unitStart = (unitNumber - 1) * full + 1;
    const unitEnd = unitNumber * full;

    const quarters = [];
    for (let q = unitEnd; q >= unitStart; q--) {
      if (memorizedQuarters.has(q)) quarters.push(q);
    }

    if (quarters.length === full) {
      steps.push(quarters.slice(0, half));
      steps.push(quarters.slice(half));
      steps.push(quarters);
    } else if (quarters.length > 0) {
      // وحدة ناقصة: تُؤخذ كما هي دفعة واحدة
      steps.push(quarters);
    }
  }

  return steps;
}

/**
 * نصيب المراجعة لخطوة معيّنة من الدورة، محوَّلاً إلى مدى (سورة:آية → سورة:آية)
 * بعد تقريب حدوده لأقرب طرف سورة وقصره على المحفوظ فعلاً.
 */
export function portionForStep(index, memorizedSet, steps, stepCounter) {
  if (steps.length === 0) return null;

  const step = steps[stepCounter % steps.length];
  const quarters = step.map((qi) => index.quarters[qi - 1]);

  let startAbs = Math.min(...quarters.map((q) => q.start));
  let endAbs = Math.max(...quarters.map((q) => q.end));

  let deepest = TOTAL_AYAHS;
  for (const a of memorizedSet) if (a < deepest) deepest = a;

  startAbs = snapToSurahStart(index, startAbs);
  endAbs = snapToSurahEnd(index, endAbs);

  // لا نخرج عن المحفوظ فعلاً بعد التقريب
  if (startAbs < deepest) startAbs = snapToSurahStart(index, deepest);
  if (endAbs > TOTAL_AYAHS) endAbs = TOTAL_AYAHS;
  if (startAbs > endAbs) startAbs = endAbs;

  const fromSurah = surahOf(index, startAbs);
  const toSurah = surahOf(index, endAbs);

  return {
    fromSurah,
    fromAyah: startAbs - index.surahStarts[fromSurah] + 1,
    toSurah,
    toAyah: endAbs - index.surahStarts[toSurah] + 1,
    ayahCount: endAbs - startAbs + 1,
    quarterCount: step.length,
    stepIndex: stepCounter % steps.length,
    totalSteps: steps.length,
  };
}

/** الواجهة المختصرة: نصيب اليوم لهذا الطالب. */
export function computeTodayPortion(index, memorizedSet, levelNumber, stepCounter) {
  const steps = buildCycleSteps(index, memorizedSet, levelNumber);
  return portionForStep(index, memorizedSet, steps, stepCounter ?? 0);
}
