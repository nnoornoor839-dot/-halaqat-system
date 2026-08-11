// نقطة واحدة لبناء فهرس المحرك القرآني المعتمد (quranEngine.js)، مستخدَمة من كل
// صفحة تحتاج حساب تقدم/إحصائيات قرآنية — عشان يكون فيه مصدر واحد للفهرس بكل التطبيق.
import { SURAHS } from './quran-surahs';
import { QUARTERS, PAGES } from './quran-boundaries';
import QuranEngine from './quranEngine';

export function buildQuranIndex() {
  return QuranEngine.buildQuranIndex({
    surahs: { references: SURAHS.map((s) => ({ number: s.number, numberOfAyahs: s.ayahCount })) },
    hizbQuarters: { references: QUARTERS },
    pages: { references: PAGES },
  });
}
