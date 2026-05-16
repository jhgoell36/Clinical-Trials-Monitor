// Integration test for the dossier DB layer + scoring, against a
// throwaway SQLite file (no network). Run: node test/dossier.test.js
const os = require('os');
const path = require('path');
const fs = require('fs');
const assert = require('assert');

process.env.SQLITE_PATH = path.join(os.tmpdir(), `dossier-test-${Date.now()}.sqlite`);

const db = require('../src/db');
const { scoreItem } = require('../src/scoring');

let passed = 0;
const check = (name, fn) => fn().then(() => { console.log(`  ok  ${name}`); passed++; })
    .catch(e => { console.log(`FAIL  ${name}\n      ${e.stack}`); process.exitCode = 1; });

(async () => {
    await db.initDb();
    const { id: userId } = await db.createUser('analyst@example.com', 'x');

    await check('add + list watched companies with notes', async () => {
        await db.upsertCompany('SRPT', '873303', 'Sarepta Therapeutics, Inc.');
        await db.upsertCompany('VRDN', '1590750', 'Viridian Therapeutics, Inc.');
        await db.linkUserCompany(userId, 'SRPT', 'core long, PDUFA Q3');
        await db.linkUserCompany(userId, 'VRDN', null);
        const list = await db.getUserCompanies(userId);
        assert.equal(list.length, 2);
        assert.equal(list.find(c => c.ticker === 'SRPT').note, 'core long, PDUFA Q3');
    });

    await check('note is updated on re-link, not duplicated', async () => {
        await db.linkUserCompany(userId, 'SRPT', 'trimmed to half');
        const list = await db.getUserCompanies(userId);
        assert.equal(list.length, 2);
        assert.equal(list.find(c => c.ticker === 'SRPT').note, 'trimmed to half');
    });

    await check('dossier returns scored items ranked, grouped by level', async () => {
        const crl = { id: 'edgar:a1', ticker: 'SRPT', source: 'edgar', formType: '8-K',
            type: '8-K', title: 'Sarepta Receives Complete Response Letter', url: 'u1',
            summary: '', published: new Date().toISOString() };
        const routine = { id: 'edgar:a2', ticker: 'VRDN', source: 'edgar', formType: '4',
            type: '4', title: 'Form 4 insider', url: 'u2', summary: '',
            published: new Date().toISOString() };
        for (const it of [crl, routine]) {
            const s = scoreItem(it);
            await db.upsertNewsItem({ ...it, score: s.score, level: s.level, tags: s.tags });
        }
        const since = new Date(Date.now() - 86400000).toISOString();
        const items = await db.getDossier(userId, since);
        assert.equal(items.length, 2);
        assert.equal(items[0].ticker, 'SRPT');           // highest score first
        assert.equal(items[0].level, 'HIGH');
        assert.ok(items[0].tags.includes('CRL'));        // tags round-trip from JSON
        assert.equal(items[1].level, 'LOW');
    });

    await check('upsert dedupes by id and refreshes score', async () => {
        await db.upsertNewsItem({ id: 'edgar:a2', ticker: 'VRDN', source: 'edgar',
            type: '8-K', title: 'Now an 8-K with topline data', url: 'u2',
            summary: 'topline', published: new Date().toISOString(),
            score: 88, level: 'HIGH', tags: ['Topline data'] });
        const since = new Date(Date.now() - 86400000).toISOString();
        const items = await db.getDossier(userId, since);
        assert.equal(items.length, 2); // still 2, not 3
        assert.equal(items.find(i => i.id === 'edgar:a2').level, 'HIGH');
    });

    await check('unwatch removes company from dossier', async () => {
        await db.unlinkUserCompany(userId, 'SRPT');
        const since = new Date(Date.now() - 86400000).toISOString();
        const items = await db.getDossier(userId, since);
        assert.ok(!items.some(i => i.ticker === 'SRPT'));
    });

    setTimeout(() => {
        try { fs.unlinkSync(process.env.SQLITE_PATH); } catch {}
        console.log(`\n${passed} checks passed`);
    }, 100);
})();
