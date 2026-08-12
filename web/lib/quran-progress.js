// حساب نسبة تقدم الطالب نحو هدفه المحدد (target)، عبر المحرك القرآني المعتمد
// (quranEngine.js) بدل الحساب المبسط القديم — بنفس شكل النتيجة القديم
// { percent, coveredInTarget, targetTotal } عشان ما تحتاج صفحات العرض تتغيّر.
//
// مهم: التقدم نحو الهدف (وبالتالي "جاهز للاختبار") يُحسب من تسجيلات "جديد" فقط.
// المراجعة لا تُحتسب إنجازاً جديداً نحو تجاوز الهدف — عشان الاختبار يقيس حفظاً
// فعلياً جديداً، لا مجرد لمس الآيات. records يجب أن تتضمن حقل type.
import QuranEngine from './quranEngine';

export function computeProgress(index, target, records) {
  const targetRange = QuranEngine.calculateRangeStats(
    index,
    target.target_start_surah,
    target.target_start_ayah,
    target.target_end_surah,
    target.target_end_ayah
  );
  const targetSet = new Set(targetRange.ayahsToProcess);

  const newRecords = records.filter((r) => r.type === 'جديد');

  const state = QuranEngine.createCoverageState();
  for (const r of newRecords) {
    const { ayahsToProcess } = QuranEngine.calculateRangeStats(
      index,
      r.start_surah,
      r.start_ayah,
      r.end_surah,
      r.end_ayah
    );
    QuranEngine.recordCoverage(state, 'الكل', ayahsToProcess);
  }
  const coveredSet = new Set(state.coverage['الكل'] || []);

  let coveredInTarget = 0;
  for (const a of targetSet) {
    if (coveredSet.has(a)) coveredInTarget++;
  }

  const percent = targetSet.size > 0 ? Math.round((coveredInTarget / targetSet.size) * 100) : 0;
  return { percent, coveredInTarget, targetTotal: targetSet.size };
}
