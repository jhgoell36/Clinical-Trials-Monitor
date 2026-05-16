const express = require('express');
const cors = require('cors');
const { initDb, query, getOne, run, createUser, upsertTrial, upsertSponsor, linkUserTrial, linkUserSponsor,
    upsertCompany, linkUserCompany, unlinkUserCompany, getUserCompanies, getDossier } = require('./db');
const { fetchTrial } = require('./api_client');
const { checkUpdates } = require('./checker');
const { startScheduler } = require('./scheduler');
const { checkSponsorUpdates } = require('./sponsor_monitor');
const { parseUniverseInput } = require('./universe');
const { refreshCompany, defaultSinceIso } = require('./dossier');
const { sendUpdateEmail, sendResetEmail, sendFeedbackEmail } = require('./mailer');
const { generateToken, hashPassword, comparePassword, authenticateToken } = require('./auth');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? clientUrl : '*',
    credentials: true
}));
app.use(express.json());

// Initialize DB and Scheduler
initDb().then(() => {
    startScheduler();
});

process.on('uncaughtException', (err) => {
    console.error('UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('UNHANDLED REJECTION:', reason);
});

// Auth Routes
// Auth Routes

app.post('/api/auth/register', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    try {
        // const db = await initDb(); // Removed
        const hashedPassword = await hashPassword(password);
        const result = await createUser(email, hashedPassword);
        // const result = await db.run(
        //     'INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)',
        //     email,
        //     hashedPassword,
        //     new Date().toISOString()
        // );
        const user = { id: result.id, email };
        const token = generateToken(user);
        res.json({ token, user: { id: user.id, email: user.email } });
    } catch (error) {
        if (error.message.includes('UNIQUE constraint failed')) {
            return res.status(400).json({ error: 'Email already exists' });
        }
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/feedback', authenticateToken, async (req, res) => {
    const { content } = req.body;
    if (!content) {
        return res.status(400).json({ error: 'Feedback content is required' });
    }

    try {
        // Get user email from DB to be sure (req.user has email from token, but let's trust token for now)
        // Actually, token payload has email.
        await sendFeedbackEmail(req.user.email, content);
        res.json({ success: true, message: 'Feedback sent successfully' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to send feedback' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    try {
        // const db = await initDb();
        const user = await getOne('SELECT * FROM users WHERE email = ?', [email]);

        if (!user || !(await comparePassword(password, user.password_hash))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = generateToken(user);
        res.json({ token, user: { id: user.id, email: user.email } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/auth/forgot-password', async (req, res) => {
    const { email } = req.body;
    try {
        // const db = await initDb();
        const user = await getOne('SELECT * FROM users WHERE email = ?', [email]);

        if (!user) {
            // Don't reveal if user exists
            return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expiry = Date.now() + 3600000; // 1 hour

        await run('UPDATE users SET reset_token = ?, reset_token_expiry = ? WHERE id = ?', [token, expiry, user.id]);
        await sendResetEmail(email, token);

        res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/auth/reset-password', async (req, res) => {
    const { token, newPassword } = req.body;
    try {
        // const db = await initDb();
        const user = await getOne('SELECT * FROM users WHERE reset_token = ? AND reset_token_expiry > ?', [token, Date.now()]);

        if (!user) {
            return res.status(400).json({ error: 'Invalid or expired token' });
        }

        const passwordHash = await hashPassword(newPassword);
        await run('UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expiry = NULL WHERE id = ?', [passwordHash, user.id]);

        res.json({ success: true, message: 'Password reset successfully' });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Routes

// Routes

// Get all trials (Scoped to user)
app.get('/api/trials', authenticateToken, async (req, res) => {
    // const db = await initDb();
    // Join with user_trials to get only this user's trials
    const trials = await query(`
        SELECT t.*
    FROM trials t
        JOIN user_trials ut ON t.nctId = ut.nctId
        WHERE ut.user_id = ?
    `, [req.user.id]);
    res.json(trials);
});

// Add a trial (Scoped to user)
app.post('/api/trials', authenticateToken, async (req, res) => {
    const { nctId } = req.body;
    if (!nctId) return res.status(400).json({ error: 'NCT ID required' });

    try {
        const trialData = await fetchTrial(nctId);
        // const db = await initDb();

        // 1. Insert/Update into main trials table (Global cache)
        await upsertTrial(trialData);
        // await db.run(
        //     'INSERT OR REPLACE INTO trials (nctId, lastUpdated, title, status, lastChecked) VALUES (?, ?, ?, ?, ?)',
        //     trialData.nctId,
        //     trialData.lastUpdated,
        //     trialData.title,
        //     trialData.status,
        //     new Date().toISOString()
        // );

        // 2. Link to user
        await linkUserTrial(req.user.id, trialData.nctId);
        // await db.run(
        //     'INSERT OR IGNORE INTO user_trials (user_id, nctId) VALUES (?, ?)',
        //     req.user.id,
        //     trialData.nctId
        // );

        res.json(trialData);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Batch delete trials (Scoped to user)
app.delete('/api/trials/batch', authenticateToken, async (req, res) => {
    const { nctIds } = req.body;
    if (!nctIds || !Array.isArray(nctIds)) {
        return res.status(400).json({ error: 'nctIds array required' });
    }

    // const db = await initDb();
    const placeholders = nctIds.map(() => '?').join(',');

    // Only delete from user_trials mapping
    await run(`DELETE FROM user_trials WHERE user_id = ? AND nctId IN(${placeholders})`, [req.user.id, ...nctIds]);

    // We do NOT delete from main trials table or add to ignored_trials globally
    // unless we want to support "ignore for me". 
    // For now, just unlinking is sufficient.

    res.json({ success: true });
});

// Delete a trial (Scoped to user)
app.delete('/api/trials/:id', authenticateToken, async (req, res) => {
    const { id } = req.params;
    // const db = await initDb();
    // Only delete from user_trials mapping
    await run('DELETE FROM user_trials WHERE user_id = ? AND nctId = ?', [req.user.id, id]);
    res.json({ success: true });
});

// Get settings (Scoped to user - using email from users table for now)
app.get('/api/settings', authenticateToken, async (req, res) => {
    // For MVP, we just return the user's email as the notification email
    // In future, we can add a separate settings table or column
    res.json({ notify_email: req.user.email });
});

// Update settings (Scoped to user)
app.post('/api/settings', authenticateToken, async (req, res) => {
    const { notify_email } = req.body;
    // For MVP, we update the user's email if they change it here? 
    // Or maybe we just ignore it if we assume login email = notify email.
    // Let's assume login email IS the notify email for now.
    // If they want to change it, they should update their profile (not implemented yet).
    // But to keep existing UI working, let's just say "success" but do nothing, 
    // OR actually update the email in users table.

    // const db = await initDb();
    await run('UPDATE users SET email = ? WHERE id = ?', [notify_email, req.user.id]);
    res.json({ success: true });
});

// Batch add trials (Scoped to user)
app.post('/api/trials/batch', authenticateToken, async (req, res) => {
    const { nctIds } = req.body;
    if (!nctIds || !Array.isArray(nctIds)) {
        return res.status(400).json({ error: 'nctIds array required' });
    }

    const results = [];
    // const db = await initDb();

    for (const nctId of nctIds) {
        try {
            // Check if already linked to user
            const existing = await getOne('SELECT nctId FROM user_trials WHERE user_id = ? AND nctId = ?', [req.user.id, nctId]);
            if (existing) {
                results.push({ nctId, status: 'skipped', message: 'Already monitored' });
                continue;
            }

            const trialData = await fetchTrial(nctId);

            // 1. Insert/Update global cache
            await upsertTrial(trialData);
            // await db.run(
            //     'INSERT OR REPLACE INTO trials (nctId, lastUpdated, title, status, lastChecked) VALUES (?, ?, ?, ?, ?)',
            //     trialData.nctId,
            //     trialData.lastUpdated,
            //     trialData.title,
            //     trialData.status,
            //     new Date().toISOString()
            // );

            // 2. Link to user
            await linkUserTrial(req.user.id, trialData.nctId);
            // await db.run(
            //     'INSERT OR IGNORE INTO user_trials (user_id, nctId) VALUES (?, ?)',
            //     req.user.id,
            //     trialData.nctId
            // );

            results.push({ nctId, status: 'success', title: trialData.title });
        } catch (error) {
            results.push({ nctId, status: 'error', message: error.message });
        }
    }

    res.json({ results });
});

// Helper function to resolve sponsor name
async function resolveSponsor(query) {
    if (!query) return null;

    try {
        const response = await axios.get('https://clinicaltrials.gov/api/v2/studies', {
            params: {
                'query.term': query,
                'pageSize': 1, // Only need one to get a potential match
                // 'fields': 'ProtocolSection.SponsorCollaboratorsModule.LeadSponsor.Name'
            }
        });

        if (response.data.studies && response.data.studies.length > 0) {
            const name = response.data.studies[0].protocolSection?.sponsorCollaboratorsModule?.leadSponsor?.name;
            if (name) return name;
        }
        return query; // Fallback to original query if no match found
    } catch (error) {
        console.error('Error resolving sponsor:', query, error.message);
        return query; // Fallback to original query on error
    }
}

// Batch add sponsors (Scoped to user)
app.post('/api/sponsors/batch', authenticateToken, async (req, res) => {
    const { sponsors } = req.body;
    if (!sponsors || !Array.isArray(sponsors)) {
        return res.status(400).json({ error: 'Sponsors array required' });
    }

    const results = [];
    // const db = await initDb();

    for (const sponsorInput of sponsors) {
        try {
            // 1. Resolve Sponsor Name
            const resolvedName = await resolveSponsor(sponsorInput);
            if (!resolvedName) {
                results.push({ input: sponsorInput, status: 'error', message: 'Could not resolve sponsor name' });
                continue;
            }

            // 2. Check if already linked to user
            const existing = await getOne('SELECT sponsor_name FROM user_sponsors WHERE user_id = ? AND sponsor_name = ?', [req.user.id, resolvedName]);
            if (existing) {
                results.push({ input: sponsorInput, name: resolvedName, status: 'skipped', message: 'Already monitored' });
                continue;
            }

            // 3. Insert/Update global sponsor cache
            await upsertSponsor(resolvedName);
            // await db.run(
            //     'INSERT OR REPLACE INTO sponsors (name, lastChecked) VALUES (?, ?)',
            //     resolvedName,
            //     new Date().toISOString()
            // );

            // 4. Link to user
            await linkUserSponsor(req.user.id, resolvedName);
            // await db.run(
            //     'INSERT OR IGNORE INTO user_sponsors (user_id, sponsor_name) VALUES (?, ?)',
            //     req.user.id,
            //     resolvedName
            // );

            // 5. Trigger check and link trials
            const { checkSponsorUpdates } = require('./sponsor_monitor');
            const newTrials = await checkSponsorUpdates(resolvedName);

            let linkedCount = 0;
            for (const trial of newTrials) {
                await linkUserTrial(req.user.id, trial.nctId);
                // await db.run(
                //     'INSERT OR IGNORE INTO user_trials (user_id, nctId) VALUES (?, ?)',
                //     req.user.id,
                //     trial.nctId
                // );
                linkedCount++;
            }

            results.push({ input: sponsorInput, name: resolvedName, status: 'success', trialsFound: linkedCount });
        } catch (error) {
            results.push({ input: sponsorInput, status: 'error', message: error.message });
        }
    }

    res.json({ results });
});

// Sponsor Routes

// Get all sponsors (Scoped to user)
app.get('/api/sponsors', authenticateToken, async (req, res) => {
    // const db = await initDb();
    // Join with user_sponsors
    const sponsors = await query(`
        SELECT s.*
    FROM sponsors s
        JOIN user_sponsors us ON s.name = us.sponsor_name
        WHERE us.user_id = ?
    `, [req.user.id]);
    res.json(sponsors);
});

// Add a sponsor (Scoped to user)
app.post('/api/sponsors', authenticateToken, async (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Sponsor name required' });

    try {
        // const db = await initDb();

        // 1. Insert/Update global sponsor cache
        await upsertSponsor(name);
        // await db.run(
        //     'INSERT OR REPLACE INTO sponsors (name, lastChecked) VALUES (?, ?)',
        //     name,
        //     new Date().toISOString()
        // );

        // 2. Link to user
        await linkUserSponsor(req.user.id, name);
        // await db.run(
        //     'INSERT OR IGNORE INTO user_sponsors (user_id, sponsor_name) VALUES (?, ?)',
        //     req.user.id,
        //     name
        // );

        // Trigger an immediate check for this sponsor
        const { checkSponsorUpdates } = require('./sponsor_monitor');

        // Await the check to ensure trials are found immediately
        const newTrials = await checkSponsorUpdates(name);

        // Link found trials to this user
        let linkedCount = 0;
        for (const trial of newTrials) {
            await linkUserTrial(req.user.id, trial.nctId);
            // await db.run(
            //     'INSERT OR IGNORE INTO user_trials (user_id, nctId) VALUES (?, ?)',
            //     req.user.id,
            //     trial.nctId
            // );
            linkedCount++;
        }

        res.json({ success: true, name, trialsFound: linkedCount });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete a sponsor (Scoped to user)
app.delete('/api/sponsors/:name', authenticateToken, async (req, res) => {
    const { name } = req.params;
    const { cascade } = req.query;
    // const db = await initDb();

    // Unlink sponsor from user
    await run('DELETE FROM user_sponsors WHERE user_id = ? AND sponsor_name = ?', [req.user.id, name]);

    if (cascade === 'true') {
        // Also unlink all trials from this sponsor for this user
        // First find trials by this sponsor
        // Then delete from user_trials
        // This is a bit complex in SQLite without subqueries in DELETE (which are supported but tricky)
        // Let's do: DELETE FROM user_trials WHERE user_id = ? AND nctId IN (SELECT nctId FROM trials WHERE sponsor = ?)
        await run(`
            DELETE FROM user_trials 
            WHERE user_id = ?
    AND nctId IN(SELECT nctId FROM trials WHERE sponsor = ?)
        `, [req.user.id, name]);
    }

    res.json({ success: true });
});

// Search sponsors (Autocomplete) - Public or Protected? 
// Protected is safer.
app.get('/api/sponsors/search', authenticateToken, async (req, res) => {
    const { q } = req.query;
    if (!q) return res.json([]);

    try {
        // We use the studies endpoint to find sponsors matching the term
        // We can't easily get just a list of sponsors from the API, so we search studies
        // and aggregate the lead sponsors.
        const axios = require('axios');
        const response = await axios.get('https://clinicaltrials.gov/api/v2/studies', {
            params: {
                'query.term': q,
                'pageSize': 20,
                // 'fields': 'ProtocolSection.SponsorCollaboratorsModule.LeadSponsor.Name'
            }
        });

        const sponsors = new Set();
        if (response.data.studies) {
            response.data.studies.forEach(study => {
                const name = study.protocolSection?.sponsorCollaboratorsModule?.leadSponsor?.name;
                if (name) sponsors.add(name);
            });
        }

        res.json(Array.from(sponsors));
    } catch (error) {
        console.error('Sponsor search failed:', error.message);
        // If fields param fails (as seen in research), fallback to full fetch
        try {
            const axios = require('axios');
            const response = await axios.get('https://clinicaltrials.gov/api/v2/studies', {
                params: {
                    'query.term': q,
                    'pageSize': 20
                }
            });
            const sponsors = new Set();
            if (response.data.studies) {
                response.data.studies.forEach(study => {
                    const name = study.protocolSection?.sponsorCollaboratorsModule?.leadSponsor?.name;
                    if (name) sponsors.add(name);
                });
            }
            res.json(Array.from(sponsors));
        } catch (retryError) {
            res.status(500).json({ error: retryError.message });
        }
    }
});

// --- Biotech Morning Dossier ---

// List the companies this user watches (with analyst notes).
app.get('/api/companies', authenticateToken, async (req, res) => {
    try {
        const companies = await getUserCompanies(req.user.id);
        res.json(companies);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add companies from a free-form paste ("SRPT | core long\nVRTX, BBIO")
// or a single { ticker, note }. Unresolvable symbols are reported back
// rather than silently dropped.
app.post('/api/companies', authenticateToken, async (req, res) => {
    const { text, ticker, note } = req.body;
    const input = text || (ticker ? `${ticker}${note ? ' | ' + note : ''}` : '');
    if (!input) return res.status(400).json({ error: 'Provide tickers (text) or a ticker' });

    const { resolved, unresolved } = parseUniverseInput(input);
    const added = [];
    try {
        for (const c of resolved) {
            await upsertCompany(c.ticker, c.cik, c.name);
            await linkUserCompany(req.user.id, c.ticker, c.note);
            added.push({ ticker: c.ticker, name: c.name, note: c.note || null });
        }
        res.json({ added, unresolved });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Stop watching a company.
app.delete('/api/companies/:ticker', authenticateToken, async (req, res) => {
    try {
        await unlinkUserCompany(req.user.id, String(req.params.ticker).toUpperCase());
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// The dossier: this user's watched-company events since `?since=ISO`
// (default: a 4-day lookback), grouped HIGH / MED / LOW.
app.get('/api/dossier', authenticateToken, async (req, res) => {
    try {
        const since = req.query.since || defaultSinceIso();
        const items = await getDossier(req.user.id, since);
        const groups = { HIGH: [], MED: [], LOW: [] };
        for (const it of items) (groups[it.level] || groups.LOW).push(it);
        res.json({ since, counts: { HIGH: groups.HIGH.length, MED: groups.MED.length, LOW: groups.LOW.length }, groups });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Pull fresh source data for this user's companies, then return the
// rebuilt dossier. Synchronous so the UI can show "as of now".
app.post('/api/dossier/refresh', authenticateToken, async (req, res) => {
    try {
        const companies = await getUserCompanies(req.user.id);
        for (const c of companies) {
            await refreshCompany(c);
        }
        const since = defaultSinceIso();
        const items = await getDossier(req.user.id, since);
        const groups = { HIGH: [], MED: [], LOW: [] };
        for (const it of items) (groups[it.level] || groups.LOW).push(it);
        res.json({ refreshed: companies.length, since, counts: { HIGH: groups.HIGH.length, MED: groups.MED.length, LOW: groups.LOW.length }, groups });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Force check (for testing)
app.post('/api/check-now', async (req, res) => {
    const { runMonitoringCycle } = require('./scheduler');
    runMonitoringCycle(); // Run in background
    res.json({ message: 'Check started' });
});

// Send test email
app.post('/api/test-email', async (req, res) => {
    // const db = await initDb();
    const emailSetting = await getOne('SELECT value FROM settings WHERE key = ?', ['notify_email']);
    const notifyEmail = emailSetting ? emailSetting.value : null;

    if (!notifyEmail) {
        return res.status(400).json({ error: 'No notification email configured.' });
    }

    const { sendSummaryEmail } = require('./mailer');

    // Mock data for test email
    const newTrials = [{
        nctId: 'TEST-NCT00000000',
        title: 'Test Clinical Trial for Email Verification',
        sponsor: 'Test Sponsor',
        status: 'RECRUITING'
    }];
    const updatedTrials = [{
        nctId: 'TEST-NCT11111111',
        title: 'Another Test Trial',
        changeType: 'Status Change',
        oldStatus: 'NOT_YET_RECRUITING',
        status: 'RECRUITING',
        oldLastUpdated: '2025-01-01',
        lastUpdated: new Date().toISOString().split('T')[0]
    }];

    try {
        await sendSummaryEmail(notifyEmail, newTrials, updatedTrials);
        res.json({ message: 'Test email sent' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
    const path = require('path');
    app.use(express.static(path.join(__dirname, '../../client/dist')));

    app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, '../../client/dist', 'index.html'));
    });
}

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} `);
});
