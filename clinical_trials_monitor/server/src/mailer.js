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

module.exports = { sendUpdateEmail, sendSummaryEmail, sendResetEmail, sendFeedbackEmail };
