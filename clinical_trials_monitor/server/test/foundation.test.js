// Offline sanity tests for the dossier foundation (no network).
// Run: node test/foundation.test.js
const assert = require('assert');
const { parseUniverseInput, resolveTicker } = require('../src/universe');
const { scoreItem } = require('../src/scoring');

let passed = 0;
const check = (name, fn) => {
    try { fn(); console.log(`  ok  ${name}`); passed++; }
    catch (e) { console.log(`FAIL  ${name}\n      ${e.message}`); process.exitCode = 1; }
};

console.log('universe resolver');
check('resolves a biotech ticker to padded CIK', () => {
    const r = resolveTicker('srpt');
    assert.equal(r.cik, '873303');
    assert.equal(r.cikPadded, '0000873303');
    assert.match(r.name, /Sarepta/);
});
check('parses mixed separators + per-line notes', () => {
    const { resolved, unresolved } = parseUniverseInput(
        'SRPT | core long, PDUFA Q3\nVRTX, IONS RVMD\nZZZZNOTREAL'
    );
    const tickers = resolved.map(r => r.ticker).sort();
    assert.deepEqual(tickers, ['IONS', 'RVMD', 'SRPT', 'VRTX']);
    assert.equal(resolved.find(r => r.ticker === 'SRPT').note, 'core long, PDUFA Q3');
    assert.equal(resolved.find(r => r.ticker === 'VRTX').note, null);
    assert.deepEqual(unresolved, ['ZZZZNOTREAL']);
});
check('dedupes repeated tickers', () => {
    const { resolved } = parseUniverseInput('SRPT\nsrpt\nSRPT');
    assert.equal(resolved.length, 1);
});

console.log('materiality scoring');
check('CRL in an 8-K is HIGH', () => {
    const s = scoreItem({ source: 'edgar', formType: '8-K', title: 'Company Receives Complete Response Letter from FDA' });
    assert.equal(s.level, 'HIGH');
    assert.ok(s.tags.includes('CRL'));
});
check('shelf S-3 alone is MED', () => {
    const s = scoreItem({ source: 'edgar', formType: 'S-3', title: 'Form S-3' });
    assert.equal(s.level, 'MED');
});
check('endpoint miss is HIGH', () => {
    const s = scoreItem({ source: 'news', title: 'XYZ Phase 3 trial did not meet the primary endpoint' });
    assert.equal(s.level, 'HIGH');
    assert.ok(s.tags.includes('Endpoint MISS'));
});
check('trial termination from CT.gov is HIGH', () => {
    const s = scoreItem({ source: 'clinicaltrials', ctChange: { kind: 'status', newStatus: 'TERMINATED' } });
    assert.equal(s.level, 'HIGH');
});
check('routine Form 4 is LOW', () => {
    const s = scoreItem({ source: 'edgar', formType: '4', title: 'Statement of changes in beneficial ownership' });
    assert.equal(s.level, 'LOW');
});

console.log(`\n${passed} checks passed`);
