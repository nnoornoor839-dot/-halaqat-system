const QuranEngine = require('./quranEngine.js');

const data = {
    surahs: { references: [
        { number: 1, numberOfAyahs: 7 }, { number: 2, numberOfAyahs: 286 }
    ]},
    hizbQuarters: { references: [
        { surah: 1, ayah: 1 }, { surah: 2, ayah: 26 }, { surah: 2, ayah: 44 }, { surah: 2, ayah: 60 },
        { surah: 2, ayah: 75 }, { surah: 2, ayah: 92 }, { surah: 2, ayah: 106 }, { surah: 2, ayah: 124 }, { surah: 2, ayah: 142 }
    ]},
    pages: { references: [
        { surah: 1, ayah: 1 }, { surah: 2, ayah: 1 }, { surah: 2, ayah: 6 }, { surah: 2, ayah: 17 }
    ]}
};

const index = QuranEngine.buildQuranIndex(data);
let pass = 0, fail = 0;
function check(name, cond) { if (cond) { pass++; console.log('✅', name); } else { fail++; console.log('❌', name); } }

console.log('=== اختبار 1: البقرة 27→43 فقط ===');
{
    const state = QuranEngine.createCoverageState();
    const stats = QuranEngine.calculateRangeStats(index, 2, 27, 2, 43);
    QuranEngine.recordCoverage(state, 'جديد', stats.ayahsToProcess);
    const cov = QuranEngine.getCoverageStats(index, state, ['جديد', 'مراجعة']);
    check('اختبار 1: 0 ربع متوقع', cov.completedQuarters === 0);
}

console.log('\n=== اختبار 2 (الحرج): 26→42 ثم 44→50 ===');
{
    const state = QuranEngine.createCoverageState();
    QuranEngine.recordCoverage(state, 'جديد', QuranEngine.calculateRangeStats(index, 2, 26, 2, 42).ayahsToProcess);
    QuranEngine.recordCoverage(state, 'جديد', QuranEngine.calculateRangeStats(index, 2, 44, 2, 50).ayahsToProcess);
    const cov = QuranEngine.getCoverageStats(index, state, ['جديد', 'مراجعة']);
    check('اختبار 2: 0 ربع متوقع (الخلل الأصلي مُصلَح)', cov.completedQuarters === 0);
}

console.log('\n=== اختبار 3: 26→50 كنطاق واحد متصل (25 آية) ===');
{
    const state = QuranEngine.createCoverageState();
    QuranEngine.recordCoverage(state, 'جديد', QuranEngine.calculateRangeStats(index, 2, 26, 2, 50).ayahsToProcess);
    const cov = QuranEngine.getCoverageStats(index, state, ['جديد', 'مراجعة']);
    check('اختبار 3: 1 ربع متوقع (26-43 مكتمل، 44-59 لا)', cov.completedQuarters === 1);
}

console.log('\n=== اختبار 4: جديد + مراجعة تكمّل فجوة ===');
{
    const state = QuranEngine.createCoverageState();
    QuranEngine.recordCoverage(state, 'جديد', QuranEngine.calculateRangeStats(index, 2, 27, 2, 43).ayahsToProcess);
    QuranEngine.recordCoverage(state, 'مراجعة', QuranEngine.calculateRangeStats(index, 2, 20, 2, 26).ayahsToProcess);
    const newOnly = QuranEngine.getCoverageStats(index, state, ['جديد']);
    const reviewOnly = QuranEngine.getCoverageStats(index, state, ['مراجعة']);
    const combined = QuranEngine.getCoverageStats(index, state, ['جديد', 'مراجعة']);
    check('اختبار 4أ: جديد بمفرده = 0', newOnly.completedQuarters === 0);
    check('اختبار 4ب: مراجعة بمفردها = 0', reviewOnly.completedQuarters === 0);
    check('اختبار 4ج: الإنجاز (اتحاد) = 1', combined.completedQuarters === 1);
}

console.log('\n=== اختبار 5: البقرة 1→141 (مطابق للسكرين شوت الحقيقي) ===');
{
    const state = QuranEngine.createCoverageState();
    const stats = QuranEngine.calculateRangeStats(index, 2, 1, 2, 141);
    QuranEngine.recordCoverage(state, 'جديد', stats.ayahsToProcess);
    const cov = QuranEngine.getCoverageStats(index, state, ['جديد']);
    check('اختبار 5: 141 آية', stats.totalAyahs === 141);
    check('اختبار 5: 7 أرباع، 0 جزء 1 حزب 3 ربع', cov.completedQuarters === 7 && cov.juzs === 0 && cov.hizbs === 1 && cov.quarters === 3);
}

console.log('\n=== اختبار 6: الصفحات لا تزال تناسبية وصحيحة ===');
{
    const stats = QuranEngine.calculateRangeStats(index, 2, 1, 2, 5); // صفحة 2 كاملة (البقرة 1-5)
    check('اختبار 6: صفحة كاملة = 1.0', Math.abs(stats.exactPages - 1.0) < 1e-9);
}

console.log(`\n=== النتيجة النهائية: ${pass} نجح / ${fail} فشل ===`);
process.exit(fail > 0 ? 1 : 0);
