// Spawns the Python `dossier` package as a child process and tracks jobs
// in memory. Progress is streamed from the child via `@@PROGRESS@@` /
// `@@RESULT@@` stdout lines (see dossier/util.py).

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// clinical_trials_monitor/  (parent of server/) holds the `dossier` package
// and the `dossiers/` output folder.
const PROJECT_ROOT = path.join(__dirname, '..', '..');
const DOSSIERS_DIR = path.join(PROJECT_ROOT, 'dossiers');
const PYTHON = process.env.DOSSIER_PYTHON || 'python3';

const TICKER_RE = /^[A-Za-z0-9.\-]{1,12}$/;

// jobId -> { ticker, status, progress[], result, error, startedAt, finishedAt }
const jobs = new Map();

function validateTicker(ticker) {
    return typeof ticker === 'string' && TICKER_RE.test(ticker.trim());
}

function getDossierDir(ticker) {
    // Defence in depth: ticker is already regex-validated, but resolve and
    // confirm containment so a held-file path can never escape the folder.
    const safe = path.normalize(ticker.toUpperCase());
    const dir = path.join(DOSSIERS_DIR, safe);
    if (!dir.startsWith(DOSSIERS_DIR + path.sep)) {
        throw new Error('Invalid ticker path');
    }
    return dir;
}

// Resolve a requested held-file path, guaranteeing it stays inside the
// ticker's dossier directory (blocks ../ traversal).
function resolveHeldFile(ticker, relPath) {
    const dir = getDossierDir(ticker);
    const abs = path.resolve(dir, relPath || '');
    if (abs !== dir && !abs.startsWith(dir + path.sep)) {
        throw new Error('Path traversal blocked');
    }
    return abs;
}

function startJob({ ticker, cik, name, irUrl }) {
    if (!validateTicker(ticker)) {
        throw new Error('Invalid ticker (expected 1-12 of A-Z, 0-9, . or -)');
    }
    ticker = ticker.trim().toUpperCase();

    const jobId = crypto.randomBytes(8).toString('hex');
    const job = {
        jobId,
        ticker,
        status: 'running',
        progress: [],
        result: null,
        error: null,
        startedAt: new Date().toISOString(),
        finishedAt: null,
    };
    jobs.set(jobId, job);

    const args = ['-m', 'dossier', ticker, '--out', DOSSIERS_DIR];
    if (cik) args.push('--cik', String(parseInt(cik, 10)));
    if (name) args.push('--name', String(name));
    if (irUrl) args.push('--ir', String(irUrl));

    const child = spawn(PYTHON, args, {
        cwd: PROJECT_ROOT,
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
    });

    let stdoutBuf = '';
    child.stdout.on('data', (chunk) => {
        stdoutBuf += chunk.toString();
        let nl;
        while ((nl = stdoutBuf.indexOf('\n')) !== -1) {
            const line = stdoutBuf.slice(0, nl).trim();
            stdoutBuf = stdoutBuf.slice(nl + 1);
            if (line.startsWith('@@PROGRESS@@ ')) {
                try {
                    const ev = JSON.parse(line.slice('@@PROGRESS@@ '.length));
                    job.progress.push({ ...ev, at: new Date().toISOString() });
                    if (job.progress.length > 200) job.progress.shift();
                } catch (_) { /* ignore malformed line */ }
            } else if (line.startsWith('@@RESULT@@ ')) {
                try {
                    job.result = JSON.parse(line.slice('@@RESULT@@ '.length));
                } catch (_) { /* ignore */ }
            }
        }
    });

    let stderrTail = '';
    child.stderr.on('data', (chunk) => {
        stderrTail = (stderrTail + chunk.toString()).slice(-4000);
    });

    child.on('error', (err) => {
        job.status = 'error';
        job.error = `Failed to start Python (${PYTHON}): ${err.message}`;
        job.finishedAt = new Date().toISOString();
    });

    child.on('close', (code) => {
        job.finishedAt = new Date().toISOString();
        if (code === 0 && job.result && !job.result.error) {
            job.status = 'done';
        } else {
            job.status = 'error';
            job.error =
                (job.result && job.result.error) ||
                `Dossier process exited with code ${code}. ${stderrTail}`.trim();
        }
    });

    return job;
}

function getJob(jobId) {
    return jobs.get(jobId) || null;
}

function readDossier(ticker) {
    if (!validateTicker(ticker)) throw new Error('Invalid ticker');
    const dir = getDossierDir(ticker);
    const mdPath = path.join(dir, 'DOSSIER.md');
    const manifestPath = path.join(dir, 'manifest.json');
    if (!fs.existsSync(mdPath)) return null;

    const markdown = fs.readFileSync(mdPath, 'utf-8');
    let manifest = null;
    if (fs.existsSync(manifestPath)) {
        try {
            manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        } catch (_) { /* manifest optional */ }
    }

    const files = [];
    for (const sub of ['filings', 'presentations', 'literature']) {
        const subDir = path.join(dir, sub);
        if (fs.existsSync(subDir)) {
            for (const f of fs.readdirSync(subDir)) {
                if (f.startsWith('.')) continue; // skip .gitkeep / hidden
                const st = fs.statSync(path.join(subDir, f));
                if (st.isFile()) {
                    files.push({
                        category: sub,
                        name: f,
                        path: `${sub}/${f}`,
                        bytes: st.size,
                    });
                }
            }
        }
    }
    return { ticker: ticker.toUpperCase(), markdown, manifest, files };
}

module.exports = {
    startJob,
    getJob,
    readDossier,
    resolveHeldFile,
    validateTicker,
    DOSSIERS_DIR,
};
