const nodemailer = require('nodemailer');
require('dotenv').config();

// Create reusable transporter object using the default SMTP transport
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.ethereal.email',
    port: process.env.SMTP_PORT || 587,
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER || 'ethereal_user',
        pass: process.env.SMTP_PASS || 'ethereal_pass',
    },
});

async function sendUpdateEmail(toEmail, trial) {
    if (!toEmail) {
        console.log('No email configured. Skipping notification for:', trial.nctId);
        return;
    }

    try {
        const info = await transporter.sendMail({
            from: '"Clinical Trials Monitor" <monitor@example.com>',
            to: toEmail,
            subject: `Trial Updated: ${trial.nctId}`,
            text: `The clinical trial ${trial.nctId} "${trial.title}" has been updated.\n\nNew Update Date: ${trial.lastUpdated}\n\nLink: https://clinicaltrials.gov/study/${trial.nctId}`,
            html: `<p>The clinical trial <b>${trial.nctId}</b> "${trial.title}" has been updated.</p><p>New Update Date: ${trial.lastUpdated}</p><p><a href="https://clinicaltrials.gov/study/${trial.nctId}">View Trial</a></p>`,
        });
        console.log('Message sent: %s', info.messageId);
    } catch (error) {
        console.error('Error sending email:', error.message);
        // Do not throw, just log. This prevents the loop from breaking.
    }
}

async function sendSummaryEmail(toEmail, newTrials, updatedTrials) {
    if (!toEmail) {
        console.log('No email configured, skipping summary email.');
        return;
    }

    if (newTrials.length === 0 && updatedTrials.length === 0) {
        console.log('No changes to report, skipping summary email.');
        return;
    }

    let html = '<h2>Clinical Trials Update</h2>';

    if (newTrials.length > 0) {
        html += '<h3>New Trials Found</h3><ul>';
        newTrials.forEach(trial => {
            html += `<li>
                <strong>${trial.nctId}</strong>: ${trial.title}<br>
                Sponsor: ${trial.sponsor}<br>
                Status: ${trial.status}<br>
                <a href="https://clinicaltrials.gov/study/${trial.nctId}">View on ClinicalTrials.gov</a>
            </li>`;
        });
        html += '</ul>';
    }

    if (updatedTrials.length > 0) {
        html += '<h3>Updated Trials</h3><ul>';
        updatedTrials.forEach(trial => {
            html += `<li>
                <strong>${trial.nctId}</strong>: ${trial.title}<br>
                Change: ${trial.changeType}<br>
                Status: ${trial.oldStatus} -> ${trial.status}<br>
                Updated: ${trial.oldLastUpdated} -> ${trial.lastUpdated}<br>
                <a href="https://clinicaltrials.gov/study/${trial.nctId}">View on ClinicalTrials.gov</a>
            </li>`;
        });
        html += '</ul>';
    }

    try {
        const info = await transporter.sendMail({
            from: '"Clinical Trials Monitor" <monitor@example.com>',
            to: toEmail,
            subject: `Clinical Trials Update: ${newTrials.length} New, ${updatedTrials.length} Updated`,
            html: html,
        });
        console.log('Summary email sent: %s', info.messageId);
    } catch (error) {
        console.error('Error sending summary email:', error.message);
    }
}

async function sendResetEmail(toEmail, token) {
    if (!toEmail) return;

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const resetLink = `${clientUrl}/reset-password/${token}`;

    try {
        const info = await transporter.sendMail({
            from: '"Clinical Trials Monitor" <monitor@example.com>',
            to: toEmail,
            subject: 'Password Reset Request',
            text: `You requested a password reset. Click the link below to reset your password:\n\n${resetLink}\n\nIf you did not request this, please ignore this email.`,
            html: `<p>You requested a password reset.</p><p><a href="${resetLink}">Click here to reset your password</a></p><p>If you did not request this, please ignore this email.</p>`,
        });
        console.log('Reset email sent: %s', info.messageId);
    } catch (error) {
        console.error('Error sending reset email:', error.message);
    }
}

async function sendFeedbackEmail(userEmail, content) {
    try {
        const info = await transporter.sendMail({
            from: '"Clinical Trials Monitor" <monitor@example.com>',
            to: process.env.FEEDBACK_EMAIL || 'jhgoell@gmail.com',
            replyTo: userEmail,
            subject: `Feedback from ${userEmail}`,
            text: content,
            html: `<p><strong>Feedback from:</strong> ${userEmail}</p><p>${content.replace(/\n/g, '<br>')}</p>`,
        });
        console.log('Feedback email sent: %s', info.messageId);
    } catch (error) {
        console.error('Error sending feedback email:', error.message);
        throw error; // Re-throw to handle in the route
    }
}

function esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

const LEVEL_COLOR = { HIGH: '#c0392b', MED: '#b9770e', LOW: '#7f8c8d' };

// Pre-market biotech brief. Leads with HIGH then MED items, grouped by
// company (companies ordered by their hottest item) so an analyst can
// scan their book top-down. LOW/routine noise is intentionally excluded
// from the email — it stays in the dashboard.
async function sendDossierEmail(toEmail, dossier) {
    if (!toEmail) {
        console.log('No email configured, skipping dossier email.');
        return;
    }

    const items = [...(dossier.groups?.HIGH || []), ...(dossier.groups?.MED || [])];
    if (items.length === 0) {
        console.log(`No HIGH/MED dossier items for ${toEmail}, skipping email.`);
        return;
    }

    const byTicker = new Map();
    for (const it of items) {
        if (!byTicker.has(it.ticker)) {
            byTicker.set(it.ticker, {
                ticker: it.ticker,
                name: it.company_name,
                note: it.user_note,
                max: 0,
                items: []
            });
        }
        const g = byTicker.get(it.ticker);
        g.items.push(it);
        g.max = Math.max(g.max, it.score);
    }
    const companies = [...byTicker.values()].sort((a, b) => b.max - a.max);

    const dateStr = new Date().toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/New_York'
    });

    let html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:680px">`;
    html += `<h2 style="margin-bottom:2px">Biotech Morning Dossier</h2>`;
    html += `<div style="color:#7f8c8d;font-size:13px;margin-bottom:16px">${esc(dateStr)} · ${dossier.counts.HIGH} high / ${dossier.counts.MED} medium signals</div>`;

    for (const c of companies) {
        html += `<div style="margin:18px 0 6px;padding-bottom:4px;border-bottom:1px solid #eee">
            <strong style="font-size:15px">${esc(c.ticker)}</strong>
            <span style="color:#555">— ${esc(c.name)}</span>
            ${c.note ? `<div style="color:#8e44ad;font-size:12px;margin-top:2px">${esc(c.note)}</div>` : ''}
        </div>`;
        for (const it of c.items.sort((a, b) => b.score - a.score)) {
            const color = LEVEL_COLOR[it.level] || LEVEL_COLOR.LOW;
            const tags = (it.tags || []).map(t =>
                `<span style="background:#f1f1f1;border-radius:3px;padding:1px 6px;font-size:11px;margin-right:4px">${esc(t)}</span>`
            ).join('');
            html += `<div style="margin:8px 0 8px 4px">
                <span style="display:inline-block;min-width:46px;color:#fff;background:${color};font-size:11px;font-weight:bold;text-align:center;border-radius:3px;padding:2px 0;margin-right:8px">${esc(it.level)}</span>
                <a href="${esc(it.url)}" style="color:#1a5276;text-decoration:none;font-weight:600">${esc(it.title)}</a>
                <div style="margin:4px 0 0 54px;font-size:12px;color:#666">${esc(it.source)} · ${esc((it.published || '').slice(0, 10))} ${tags}</div>
            </div>`;
        }
    }
    html += `<div style="color:#aaa;font-size:11px;margin-top:24px">Materiality is rules-scored; verify before trading. Lower-signal items are in the dashboard.</div></div>`;

    try {
        const info = await transporter.sendMail({
            from: '"Biotech Dossier" <monitor@example.com>',
            to: toEmail,
            subject: `Biotech Morning Dossier — ${dossier.counts.HIGH} high, ${dossier.counts.MED} medium`,
            html
        });
        console.log('Dossier email sent: %s', info.messageId);
    } catch (error) {
        console.error('Error sending dossier email:', error.message);
    }
}

module.exports = { sendUpdateEmail, sendSummaryEmail, sendResetEmail, sendFeedbackEmail, sendDossierEmail };
