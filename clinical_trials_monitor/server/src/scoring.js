// Materiality engine for the biotech morning dossier.
//
// Every news item is scored 0-100 and bucketed HIGH / MED / LOW so the
// dossier can lead with what actually moves a biotech stock. Scoring is
// rules-based and intentionally transparent: the returned `tags` explain
// *why* something scored the way it did, which matters for an analyst
// triaging a morning feed.

const LEVELS = { HIGH: 'HIGH', MED: 'MED', LOW: 'LOW' };

// SEC form type -> base materiality. Matched by prefix so "424B5",
// "S-1/A", "SC 13D/A" etc. all resolve.
const FORM_RULES = [
    { prefix: '425', score: 90, tag: 'M&A' },
    { prefix: 'DEFM14A', score: 90, tag: 'M&A vote' },
    { prefix: 'SC TO', score: 88, tag: 'Tender offer' },
    { prefix: 'SC 14D9', score: 88, tag: 'Tender offer' },
    { prefix: 'SC 13D', score: 78, tag: 'Activist 13D' },
    { prefix: 'SC 13G', score: 45, tag: '13G stake' },
    { prefix: '424B', score: 75, tag: 'Offering / dilution' },
    { prefix: 'S-1', score: 70, tag: 'Registration / offering' },
    { prefix: 'S-3', score: 62, tag: 'Shelf registration' },
    { prefix: 'EFFECT', score: 55, tag: 'Registration effective' },
    { prefix: '8-K', score: 55, tag: '8-K' },
    { prefix: '6-K', score: 55, tag: '6-K (foreign issuer)' },
    { prefix: '10-K', score: 45, tag: 'Annual report' },
    { prefix: '20-F', score: 45, tag: 'Annual report (20-F)' },
    { prefix: '10-Q', score: 42, tag: 'Quarterly report' },
    { prefix: '4', score: 30, tag: 'Insider transaction' },
];

// Biotech catalyst lexicon. Order doesn't matter; the highest single
// match sets the keyword contribution, and every match adds a tag.
const KEYWORD_RULES = [
    { re: /\bcomplete response letter\b|\bCRL\b/i, score: 96, tag: 'CRL' },
    { re: /clinical hold|trial halt|halted the (study|trial)|study halt/i, score: 95, tag: 'Clinical hold' },
    { re: /\bPDUFA\b/i, score: 92, tag: 'PDUFA' },
    { re: /did not meet|failed to meet|missed the primary|primary endpoint was not/i, score: 92, tag: 'Endpoint MISS' },
    { re: /met the primary|achieved the primary|statistically significant|hit the primary/i, score: 90, tag: 'Endpoint HIT' },
    { re: /\btopline\b|top-line results/i, score: 88, tag: 'Topline data' },
    { re: /FDA approv|approved by the FDA|marketing authoriz|grants? approval/i, score: 90, tag: 'Approval' },
    { re: /advisory committee|\bAdCom\b|\bODAC\b/i, score: 86, tag: 'AdCom' },
    { re: /breakthrough therapy|fast track|priority review|accelerated approval|orphan drug/i, score: 80, tag: 'FDA designation' },
    { re: /\bBLA\b|\bNDA\b|biologics license application|new drug application|FDA accept|filing accepted/i, score: 78, tag: 'Regulatory filing' },
    { re: /to acquire|definitive (merger|agreement)|to be acquired|business combination|merger agreement/i, score: 90, tag: 'M&A' },
    { re: /going concern|chapter 11|bankrupt|wind[- ]down|cease operations|reverse split/i, score: 85, tag: 'Solvency risk' },
    { re: /workforce reduction|restructur|layoff|pipeline prioritiz/i, score: 70, tag: 'Restructuring' },
    { re: /registered direct|private placement|public offering|prices? \$?\d|underwritten offering|at-the-market|ATM facility/i, score: 72, tag: 'Financing' },
    { re: /phase 3|phase iii/i, score: 68, tag: 'Phase 3' },
    { re: /interim (analysis|results)|data monitoring committee|\bDSMB\b/i, score: 66, tag: 'Interim / DSMB' },
    { re: /collaboration|licens(e|ing) agreement|partnership|option agreement|out-licens|strategic alliance/i, score: 62, tag: 'Partnership' },
    { re: /phase 2|phase ii\b/i, score: 52, tag: 'Phase 2' },
    { re: /enrollment complete|first patient (dosed|enrolled)|completed enrollment/i, score: 50, tag: 'Enrollment' },
    { re: /presented? at|poster|publication|peer-reviewed|to present/i, score: 44, tag: 'Conference / publication' },
    { re: /phase 1|phase i\b|\bIND\b/i, score: 42, tag: 'Early stage' },
];

// ClinicalTrials.gov change classification.
const CT_STATUS_SCORE = {
    TERMINATED: 90,
    WITHDRAWN: 85,
    SUSPENDED: 82,
    COMPLETED: 70,
    ACTIVE_NOT_RECRUITING: 55,
    RECRUITING: 50,
    NOT_YET_RECRUITING: 40,
    ENROLLING_BY_INVITATION: 45,
};

function levelFor(score) {
    if (score >= 70) return LEVELS.HIGH;
    if (score >= 40) return LEVELS.MED;
    return LEVELS.LOW;
}

function matchForm(formType) {
    if (!formType) return null;
    const f = String(formType).toUpperCase().trim();
    // Longest prefix wins so "SC 13D" beats a hypothetical bare "S".
    let best = null;
    for (const rule of FORM_RULES) {
        if (f.startsWith(rule.prefix) && (!best || rule.prefix.length > best.prefix.length)) {
            best = rule;
        }
    }
    return best;
}

function scanKeywords(text) {
    const hits = [];
    if (!text) return hits;
    for (const rule of KEYWORD_RULES) {
        if (rule.re.test(text)) hits.push(rule);
    }
    return hits;
}

// item: { source, type, formType, title, summary, ctChange }
//   source  - 'edgar' | 'clinicaltrials' | 'news' | 'fda'
//   ctChange - { kind:'status'|'new'|'completion'|'update', newStatus, oldStatus }
function scoreItem(item = {}) {
    const tags = [];
    let score = 0;

    const formRule = item.source === 'edgar' ? matchForm(item.formType) : null;
    if (formRule) {
        score = Math.max(score, formRule.score);
        tags.push(formRule.tag);
    }

    if (item.source === 'clinicaltrials' && item.ctChange) {
        const c = item.ctChange;
        if (c.kind === 'status') {
            const s = CT_STATUS_SCORE[String(c.newStatus || '').toUpperCase()] || 48;
            score = Math.max(score, s);
            tags.push(`Status -> ${c.newStatus}`);
        } else if (c.kind === 'new') {
            score = Math.max(score, 50);
            tags.push('New trial');
        } else if (c.kind === 'completion') {
            score = Math.max(score, 58);
            tags.push('Completion date change');
        } else {
            score = Math.max(score, 45);
            tags.push('Trial update');
        }
    }

    const text = `${item.title || ''}\n${item.summary || ''}`;
    let keywordMax = 0;
    for (const hit of scanKeywords(text)) {
        keywordMax = Math.max(keywordMax, hit.score);
        if (!tags.includes(hit.tag)) tags.push(hit.tag);
    }
    score = Math.max(score, keywordMax);

    // A material keyword inside an 8-K (or 6-K) is the classic biotech
    // catalyst pattern: nudge it above a bare filing so it leads.
    if (formRule && (formRule.prefix === '8-K' || formRule.prefix === '6-K') && keywordMax >= 70) {
        score = Math.min(100, score + 4);
    }

    if (score === 0) {
        score = 20;
        if (tags.length === 0) tags.push('Routine');
    }

    return { score, level: levelFor(score), tags };
}

module.exports = { scoreItem, levelFor, LEVELS, FORM_RULES, KEYWORD_RULES };
