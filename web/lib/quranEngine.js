/**
 * quranEngine.js
 * ============================================================
 * محرك عام ومستقل لتتبع تغطية حفظ/مراجعة القرآن الكريم.
 * لا يعتمد على DOM أو تخزين محلي أو أي منطق خاص ببرنامج معين —
 * مصمَّم لإعادة الاستخدام في أي تطبيق تحفيظ.
 *
 * الفلسفة الأساسية (سبب وجود هذا الملف):
 * -------------------------------------------------------------
 * أغلب أنظمة تتبع الحفظ تحسب "اكتمال الربع" بالتحقق من نقطة واحدة
 * فقط (أول آية في الربع). هذا خطأ: يمنح اعتمادًا كاملًا للربع بمجرد
 * لمس بدايته، حتى لو كانت آخر آية فيه غير مسجَّلة إطلاقًا.
 *
 * هذا المحرك يتحقق من **كل آية في الربع** قبل اعتماده (0 أو 1 فقط،
 * لا نسب مئوية) — عبر تسجيل تراكمي للآيات الفعلية التي غطّاها الطالب
 * عبر كل تاريخه، وليس مجرد عدّاد أرقام مجمّعة.
 *
 * لماذا ليس حسابًا تناسبيًا (نسبة مئوية)؟
 * تم اختبار هذا الخيار واستُبعد لسببين:
 * 1) يتعارض مع فلسفة "اعتماد رسمي" (0/1، لا نِسَب).
 * 2) خطر مؤكَّد بالاختبار الفعلي: جمع كسور عشرية (1/طول_الربع) ثم
 *    Math.floor يفشل في أكثر من نصف أطوال الأرباع الواقعية (13-44
 *    آية) بسبب دقة الأعداد الثنائية العشرية في JavaScript، فيمنح
 *    أحيانًا "0" لربع مكتمل 100% فعليًا. الحل الحالي (عدّ أعداد
 *    صحيحة فقط) محصَّن من هذا الخطر تمامًا.
 *
 * شكل بيانات الإدخال المتوقع (data):
 * -------------------------------------------------------------
 * نفس شكل استجابة الـ API العام: https://api.alquran.cloud/v1/meta
 * {
 *   surahs:      { references: [{ number, numberOfAyahs }, ...] },   // 114 سورة
 *   hizbQuarters:{ references: [{ surah, ayah }, ...] },              // 240 بداية ربع
 *   pages:       { references: [{ surah, ayah }, ...] }               // بدايات الصفحات (اختياري، لحساب الصفحات)
 * }
 * ============================================================
 */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.QuranEngine = factory();
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const TOTAL_AYAHS = 6236;

    /**
     * يبني كل الفهارس اللازمة من بيانات القرآن الخام.
     * استدعِها مرة واحدة عند تحميل بيانات الـ API، واحتفظ بالناتج
     * لتمريره لباقي دوال المحرك.
     */
    function buildQuranIndex(data) {
        const surahStarts = {};
        let absIndex = 1;
        data.surahs.references.forEach(s => { surahStarts[s.number] = absIndex; absIndex += s.numberOfAyahs; });

        const surahAyahCount = {};
        data.surahs.references.forEach(s => { surahAyahCount[s.number] = s.numberOfAyahs; });

        // --- الأرباع الـ240 (بداية/نهاية/طول لكل ربع) ---
        const quarterStartsAbs = data.hizbQuarters.references.map(q => surahStarts[q.surah] + q.ayah - 1);
        const quarters = [];
        for (let i = 0; i < quarterStartsAbs.length; i++) {
            const start = quarterStartsAbs[i];
            const end = (i + 1 < quarterStartsAbs.length) ? quarterStartsAbs[i + 1] - 1 : TOTAL_AYAHS;
            quarters.push({ index: i + 1, start, end, length: end - start + 1 });
        }
        const ayahToQuarterIndex = {};
        quarters.forEach(q => { for (let a = q.start; a <= q.end; a++) ayahToQuarterIndex[a] = q.index; });

        // --- الصفحات (اختياري، لحساب صفحات تناسبي دقيق) ---
        let pageLengths = {}, ayahToPage = {};
        if (data.pages) {
            let pageStarts = data.pages.references.map(p => surahStarts[p.surah] + p.ayah - 1);
            pageStarts.push(TOTAL_AYAHS + 1);
            for (let i = 0; i < pageStarts.length - 1; i++) {
                const start = pageStarts[i], end = pageStarts[i + 1] - 1;
                pageLengths[i + 1] = end - start + 1;
                for (let a = start; a <= end; a++) ayahToPage[a] = i + 1;
            }
        }

        return { surahStarts, surahAyahCount, quarters, ayahToQuarterIndex, pageLengths, ayahToPage };
    }

    /**
     * يحوّل نطاق (سورة:آية → سورة:آية) إلى قائمة أرقام آيات مطلقة + إحصائيات أساسية.
     * يدعم الاتجاهين (سورة أولى أصغر أو أكبر من الثانية)، بنفس منطق
     * التطبيقات القرآنية القياسية (قراءة للأمام دومًا داخل كل سورة).
     */
    function calculateRangeStats(index, s1, a1, s2, a2) {
        if (!index.surahStarts[s1] || !index.surahStarts[s2]) return { totalAyahs: 0, exactPages: 0, ayahsToProcess: [] };
        const max1 = index.surahAyahCount[s1], max2 = index.surahAyahCount[s2];
        a1 = Math.min(Math.max(1, a1), max1); a2 = Math.min(Math.max(1, a2), max2);

        let ayahsToProcess = [];
        if (s1 === s2) {
            const minA = Math.min(a1, a2), maxA = Math.max(a1, a2);
            for (let a = minA; a <= maxA; a++) ayahsToProcess.push(index.surahStarts[s1] + a - 1);
        } else if (s1 < s2) {
            for (let a = a1; a <= max1; a++) ayahsToProcess.push(index.surahStarts[s1] + a - 1);
            for (let s = s1 + 1; s < s2; s++) { for (let a = 1; a <= index.surahAyahCount[s]; a++) ayahsToProcess.push(index.surahStarts[s] + a - 1); }
            for (let a = 1; a <= a2; a++) ayahsToProcess.push(index.surahStarts[s2] + a - 1);
        } else {
            for (let a = a1; a <= max1; a++) ayahsToProcess.push(index.surahStarts[s1] + a - 1);
            for (let s = s1 - 1; s > s2; s--) { for (let a = 1; a <= index.surahAyahCount[s]; a++) ayahsToProcess.push(index.surahStarts[s] + a - 1); }
            for (let a = 1; a <= a2; a++) ayahsToProcess.push(index.surahStarts[s2] + a - 1);
        }

        let exactPages = 0;
        ayahsToProcess.forEach(abs => {
            const p = index.ayahToPage[abs];
            if (p && index.pageLengths[p]) exactPages += 1.0 / index.pageLengths[p];
        });

        return { totalAyahs: ayahsToProcess.length, exactPages, ayahsToProcess };
    }

    /**
     * ينشئ "حالة تغطية" فارغة لطالب/مستخدم واحد.
     * state.coverage[type] = Array of covered absolute ayah numbers (type = اسم حر: "جديد"، "مراجعة"، ...)
     */
    function createCoverageState() {
        return { coverage: {} };
    }

    /** يسجّل نطاق آيات (قائمة أرقام مطلقة) تحت تصنيف معيّن (اسم حر بالكامل) */
    function recordCoverage(state, type, absAyahsList) {
        if (!absAyahsList || absAyahsList.length === 0) return;
        if (!state.coverage[type]) state.coverage[type] = [];
        const set = new Set(state.coverage[type]);
        absAyahsList.forEach(a => set.add(a));
        state.coverage[type] = Array.from(set);
    }

    /**
     * يحسب إحصائية الاكتمال (جزء/حزب/ربع) باتحاد تصنيف واحد أو أكثر.
     * مثال: getCoverageStats(index, state, ['جديد'])                 → حفظ جديد فقط
     *       getCoverageStats(index, state, ['جديد', 'مراجعة'])       → الإنجاز الكلي (اتحاد الاثنين)
     */
    function getCoverageStats(index, state, types) {
        const unionSet = new Set();
        types.forEach(t => { (state.coverage[t] || []).forEach(a => unionSet.add(a)); });

        let completedQuarters = 0;
        index.quarters.forEach(q => {
            let complete = true;
            for (let a = q.start; a <= q.end; a++) { if (!unionSet.has(a)) { complete = false; break; } }
            if (complete) completedQuarters++;
        });

        return {
            completedQuarters,
            juzs: Math.floor(completedQuarters / 8),
            hizbs: Math.floor((completedQuarters % 8) / 4),
            quarters: completedQuarters % 4,
            totalAyahsCovered: unionSet.size
        };
    }

    return { buildQuranIndex, calculateRangeStats, createCoverageState, recordCoverage, getCoverageStats };
}));
