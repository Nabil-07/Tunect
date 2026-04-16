// src/notifications/notifications.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import nodemailer, { Transporter } from 'nodemailer';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { GraphEmailSender, EmailAttachment } from './graph-email.sender';

type BookingConfirmationPayload = {
  studentEmail: string;
  tutorEmail?: string;
  studentName?: string;
  tutorName?: string;
  bookingId: string;
  startIso: string;
  endIso: string;
  isDemo?: boolean;
  subject?: string | null;
  notes?: string | null;
};

type BookingReminderPayload = {
  to: string;
  recipientName?: string;
  otherPartyName?: string;
  bookingId: string;
  startIso: string;
  endIso: string;
  minutesBefore: number;
};

type BookingCancellationPayload = {
  studentEmail: string;
  studentName?: string;
  tutorName?: string;
  bookingId: string;
  startIso?: string;
  reason: 'TUTOR_NO_SHOW' | 'STUDENT_NO_SHOW' | 'MANUAL' | string;
  tokensRefunded: number;
};

type PaymentReceiptPayload = {
  studentEmail: string;
  studentName?: string;
  tutorName?: string;
  tokensPurchased: number;
  amountPaid: number; // in smallest currency unit (paise)
  currency?: string;
  paymentId: string;
  providerOrderId?: string;
  purchasedAt?: string; // ISO
  expiryDate?: string;  // ISO — 60 days from purchase
};

type TutorTokenPurchasePayload = {
  tutorEmail: string;
  tutorName?: string;
  studentName: string;
  tokensPurchased: number;
};

type LowAvailabilityReminderPayload = {
  tutorEmail: string;
  tutorName?: string;
  upcomingSlotCount: number;
  students: { name: string; remainingTokens: number }[];
};

// ─── Email helpers ───────────────────────────────────────────────────────────

function toIcsDate(iso: string): string {
  return iso.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function generateIcs(opts: {
  bookingId: string;
  summary: string;
  description: string;
  startIso: string;
  endIso: string;
  organizerEmail: string;
  attendeeEmails: string[];
}): string {
  const stamp = toIcsDate(new Date().toISOString());
  const start = toIcsDate(opts.startIso);
  const end = toIcsDate(opts.endIso);
  const attendees = opts.attendeeEmails
    .map((e) => `ATTENDEE;RSVP=TRUE:mailto:${e}`)
    .join('\r\n');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Tunect//Tunect Learning Platform//EN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:booking-${opts.bookingId}@tunectnow.com`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${opts.summary}`,
    `DESCRIPTION:${opts.description.replace(/\n/g, '\\n')}`,
    `ORGANIZER:mailto:${opts.organizerEmail}`,
    attendees,
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Your tutoring session starts in 15 minutes',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

function googleCalLink(summary: string, startIso: string, endIso: string, details: string): string {
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: summary,
    dates: `${toIcsDate(startIso)}/${toIcsDate(endIso)}`,
    details,
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}

function outlookCalLink(summary: string, startIso: string, endIso: string, body: string): string {
  const p = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: summary,
    startdt: startIso,
    enddt: endIso,
    body,
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${p}`;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-IN', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone: 'Asia/Kolkata',
    }) + ' IST';
  } catch {
    return iso;
  }
}

function emailShell(preheader: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Tunect</title></head>
<body style="margin:0;padding:16px;background:#f1f5f9;font-family:system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">${preheader}</div>
<table cellpadding="0" cellspacing="0" width="100%" style="max-width:600px;margin:0 auto">
  <tr><td style="background:#2563eb;padding:20px 32px;border-radius:12px 12px 0 0">
    <span style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.5px">🎓 Tunect</span>
  </td></tr>
  <tr><td style="background:#fff;padding:32px;border:1px solid #e2e8f0;border-top:none">
    ${bodyHtml}
  </td></tr>
  <tr><td style="background:#f8fafc;padding:20px 32px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;text-align:center;font-size:12px;color:#94a3b8">
    <p style="margin:0">Tunect Learning Platform &nbsp;·&nbsp; <a href="https://tunectnow.com" style="color:#2563eb;text-decoration:none">tunectnow.com</a></p>
    <p style="margin:6px 0 0">© 2026 Tunect. All rights reserved.</p>
  </td></tr>
</table>
</body></html>`;
}

function calendarButtons(summary: string, startIso: string, endIso: string, details: string): string {
  const gUrl = googleCalLink(summary, startIso, endIso, details);
  const oUrl = outlookCalLink(summary, startIso, endIso, details);
  return `<p style="margin:24px 0 0">
    <strong style="display:block;margin-bottom:10px;color:#475569;font-size:13px;text-transform:uppercase;letter-spacing:.5px">Add to Calendar</strong>
    <a href="${gUrl}" target="_blank" style="display:inline-block;margin-right:8px;padding:8px 16px;background:#4285f4;color:#fff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600">📅 Google Calendar</a>
    <a href="${oUrl}" target="_blank" style="display:inline-block;padding:8px 16px;background:#0078d4;color:#fff;text-decoration:none;border-radius:6px;font-size:13px;font-weight:600">📅 Outlook / Apple</a>
  </p>`;
}

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly enabled: boolean;
  private readonly transporter?: Transporter;
  private readonly graph?: GraphEmailSender;
  private readonly smtpEnabled: boolean;
  private readonly disableNotificationEmails: boolean;

  // ✅ NEW: Twilio (optional)
  private readonly smsEnabled: boolean;
  private readonly twilioFrom?: string;
  private readonly twilioClient?: any; // keep 'any' to avoid needing @types

  private fromAddress(): string {
    return (
      process.env.SMTP_FROM ||
      process.env.MAIL_FROM ||
      'Tunect <no-reply@tunectnow.com>'
    );
  }

  constructor(private readonly prisma: PrismaService) {
    this.graph = GraphEmailSender.fromEnv(this.logger) ?? undefined;

    this.disableNotificationEmails =
      (process.env.DISABLE_NOTIFICATION_EMAILS ?? '').toLowerCase() === 'true';

    // ---------- EMAIL ----------
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT ?? 587);
    const secure =
      (process.env.SMTP_SECURE ?? '').toLowerCase() === 'true' || port === 465;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASSWORD;

    this.smtpEnabled = Boolean(host && port && user && pass);
    this.enabled = Boolean(this.graph || this.smtpEnabled);

    if (!this.enabled) {
      this.logger.warn(
        'SMTP not fully configured. Emails will be skipped (set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD).',
      );
    } else if (this.smtpEnabled) {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
      });

      // transporter.verify() runs in onModuleInit to avoid async in constructor
    }

    // ---------- SMS (Twilio) ----------
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    this.twilioFrom = process.env.TWILIO_FROM_NUMBER;
    this.smsEnabled = Boolean(sid && token && this.twilioFrom);

    if (this.smsEnabled) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const Twilio = require('twilio');
        this.twilioClient = Twilio(sid, token);
        this.logger.log('Twilio SMS is enabled.');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.smsEnabled = false as any;
        this.logger.warn(`Twilio init failed: ${msg}. SMS disabled.`);
      }
    } else {
      this.logger.warn('Twilio not fully configured. SMS will be skipped.');
    }
  }

  async onModuleInit(): Promise<void> {
    // ===== EMAIL DIAGNOSTICS =====
    this.logger.log(`=== EMAIL CONFIG DIAGNOSTICS ===`);
    this.logger.log(`Graph email enabled: ${!!this.graph}`);
    this.logger.log(`SMTP enabled: ${this.smtpEnabled}`);
    this.logger.log(`Overall email enabled: ${this.enabled}`);
    if (this.graph) {
      this.logger.log(`Graph sender UPN: ${process.env.GRAPH_SENDER_UPN}`);
      // Test Graph token acquisition at startup
      try {
        await (this.graph as any).getAccessToken();
        this.logger.log(`✅ Graph: access token acquired successfully`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.error(`❌ Graph: token acquisition FAILED — ${msg}`);
        this.logger.error(`   → Check GRAPH_CLIENT_SECRET is the secret VALUE, not the secret ID`);
      }
    }

    if (this.transporter) {
      try {
        await this.transporter.verify();
        this.logger.log('✅ SMTP transporter verified.');
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn(`❌ SMTP verify failed (continuing): ${msg}`);
      }
    }
    this.logger.log(`=== END EMAIL DIAGNOSTICS ===`);
  }

  /**
   * Low-level email sender.
   * Returns true on success, false on failure or if email is disabled.
   */
  async sendEmail(
    to: string,
    subject: string,
    html: string,
    attachments: EmailAttachment[] = [],
  ): Promise<boolean> {
    const from = this.fromAddress();

    if (!this.enabled) {
      this.logger.debug(
        `Email skipped (disabled): to=${to} | subject="${subject}"`,
      );
      return false;
    }

    // Prefer Graph (works with Security Defaults)
    if (this.graph) {
      try {
        await this.graph.sendHtmlEmailWithAttachments(to, subject, html, attachments);
        this.logger.log(`Email sent (Graph) → ${to} | ${subject}`);
        return true;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn(`Email failed (Graph, fallback to SMTP if available): ${msg}`);
      }
    }

    try {
      if (!this.transporter) {
        this.logger.debug(
          `Email skipped (SMTP not configured): to=${to} | subject="${subject}"`,
        );
        return false;
      }
      const smtpAttachments = attachments.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.contentBase64, 'base64'),
        contentType: a.contentType,
      }));
      await this.transporter.sendMail({ from, to, subject, html, attachments: smtpAttachments });
      this.logger.log(`Email sent → ${to} | ${subject}`);
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.stack || e.message : String(e);
      this.logger.error(`Email failed → ${to} | ${subject}`, msg as any);
      return false;
    }
  }

  /**
   * Notification email sender (non-critical). Can be disabled for a release.
   */
  async sendNotificationEmail(
    to: string,
    subject: string,
    html: string,
    attachments: EmailAttachment[] = [],
  ): Promise<boolean> {
    if (this.disableNotificationEmails) {
      this.logger.debug(
        `Notification email skipped (DISABLE_NOTIFICATION_EMAILS=true): to=${to} | subject="${subject}"`,
      );
      return false;
    }
    return this.sendEmail(to, subject, html, attachments);
  }

  // ✅ NEW: Low-level SMS sender (Twilio). Returns true/false.
  async sendSms(to: string, body: string): Promise<boolean> {
    if (!this.smsEnabled || !this.twilioClient || !this.twilioFrom) {
      this.logger.debug(`SMS skipped (disabled): to=${to} | body="${body}"`);
      return false;
    }
    try {
      await this.twilioClient.messages.create({
        to,
        from: this.twilioFrom,
        body,
      });
      this.logger.log(`SMS sent → ${to}`);
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.stack || e.message : String(e);
      this.logger.error(`SMS failed → ${to}`, msg as any);
      return false;
    }
  }

  // ---------- TEMPLATES ----------

  // ✅ NEW: OTP email template
  async sendOtpEmail(to: string, code: string): Promise<void> {
    const subject = 'Your Tunect OTP';
    const html = `
      <div style="font-family:system-ui,Segoe UI,Roboto,Arial">
        <h2>Use this code to reset your password</h2>
        <p style="font-size:20px;letter-spacing:3px"><strong>${code}</strong></p>
        <p>This code expires in 10 minutes.</p>
        <p>If you didn’t request this, you can safely ignore this email.</p>
      </div>
    `;
    await this.sendEmail(to, subject, html);
  }

  /**
   * Send booking confirmation to student (with ICS + calendar links) and tutor.
   */
  async bookingConfirmation(payload: BookingConfirmationPayload): Promise<void> {
    const baseUrl = process.env.APP_BASE_URL ?? 'https://tunectnow.com';
    const bookingUrl = `${baseUrl}/class/${payload.bookingId}`;
    const sessionType = payload.isDemo ? 'Demo Session' : 'Tutoring Session';
    const tutorDisplay = payload.tutorName ?? 'your tutor';
    const studentDisplay = payload.studentName ?? 'Student';
    const subjectLine = payload.subject ? ` — ${payload.subject}` : '';

    // Build separate ICS attachments per recipient to avoid exposing emails
    const studentIcsContent = generateIcs({
      bookingId: payload.bookingId,
      summary: `${sessionType} with ${tutorDisplay}${subjectLine}`,
      description: `Join your Tunect session: ${bookingUrl}${payload.notes ? `\n\nNotes: ${payload.notes}` : ''}`,
      startIso: payload.startIso,
      endIso: payload.endIso,
      organizerEmail: 'no-reply@tunectnow.com',
      attendeeEmails: [payload.studentEmail],
    });
    const studentIcsAttachment: EmailAttachment = {
      filename: 'tunect-session.ics',
      contentBase64: Buffer.from(studentIcsContent).toString('base64'),
      contentType: 'text/calendar; method=REQUEST',
    };

    const tutorIcsContent = payload.tutorEmail ? generateIcs({
      bookingId: payload.bookingId,
      summary: `Session with ${studentDisplay}${subjectLine}`,
      description: `Join your Tunect session: ${bookingUrl}${payload.notes ? `\n\nNotes: ${payload.notes}` : ''}`,
      startIso: payload.startIso,
      endIso: payload.endIso,
      organizerEmail: 'no-reply@tunectnow.com',
      attendeeEmails: [payload.tutorEmail],
    }) : null;
    const tutorIcsAttachment: EmailAttachment | null = tutorIcsContent ? {
      filename: 'tunect-session.ics',
      contentBase64: Buffer.from(tutorIcsContent).toString('base64'),
      contentType: 'text/calendar; method=REQUEST',
    } : null;

    // Student confirmation email
    const studentSubject = payload.isDemo
      ? `Demo session confirmed with ${tutorDisplay}`
      : `Session confirmed — ${fmtDate(payload.startIso)}`;

    const studentBody = emailShell(
      `Your ${sessionType.toLowerCase()} with ${tutorDisplay} is confirmed.`,
      `<h2 style="margin:0 0 4px;color:#1e293b;font-size:22px">Session Confirmed ✅</h2>
      <p style="margin:0 0 20px;color:#64748b">${payload.isDemo ? 'Your free demo session is booked!' : 'Your tutoring session is booked.'}</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
        <tr><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px 6px 0 0;font-size:13px;color:#64748b;font-weight:600;width:40%">TUTOR</td>
            <td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-left:none;border-radius:0 6px 0 0;font-size:15px;color:#1e293b;font-weight:600">${tutorDisplay}</td></tr>
        <tr><td style="padding:10px;border:1px solid #e2e8f0;border-top:none;font-size:13px;color:#64748b;font-weight:600">START</td>
            <td style="padding:10px;border:1px solid #e2e8f0;border-top:none;border-left:none;font-size:15px;color:#1e293b">${fmtDate(payload.startIso)}</td></tr>
        <tr><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;font-size:13px;color:#64748b;font-weight:600">END</td>
            <td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-left:none;font-size:15px;color:#1e293b">${fmtDate(payload.endIso)}</td></tr>
        ${payload.subject ? `<tr><td style="padding:10px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 0 6px;font-size:13px;color:#64748b;font-weight:600">SUBJECT</td><td style="padding:10px;border:1px solid #e2e8f0;border-top:none;border-left:none;border-radius:0 0 6px 0;font-size:15px;color:#1e293b">${payload.subject}</td></tr>` : ''}
        ${payload.notes ? `<tr><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 0 6px;font-size:13px;color:#64748b;font-weight:600">NOTES</td><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-left:none;border-radius:0 0 6px 0;font-size:15px;color:#1e293b">${payload.notes}</td></tr>` : ''}
      </table>
      <a href="${bookingUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">View Booking</a>
      ${calendarButtons(`${sessionType} with ${tutorDisplay}`, payload.startIso, payload.endIso, `Join on Tunect: ${bookingUrl}`)}
      <p style="margin:20px 0 0;padding:12px;background:#fefce8;border:1px solid #fde68a;border-radius:6px;font-size:13px;color:#92400e">
        📎 A calendar invite (.ics) is attached — open it to add this session directly to Google Calendar, Apple Calendar, or Outlook.
      </p>`,
    );

    await this.sendNotificationEmail(payload.studentEmail, studentSubject, studentBody, [studentIcsAttachment]);

    // Tutor notification email
    if (payload.tutorEmail) {
      const tutorSubject = payload.isDemo
        ? `New demo session booked by ${studentDisplay}`
        : `New session booked — ${fmtDate(payload.startIso)}`;

      const tutorBody = emailShell(
        `${studentDisplay} has booked a ${sessionType.toLowerCase()} with you.`,
        `<h2 style="margin:0 0 4px;color:#1e293b;font-size:22px">New Session Booked 📗</h2>
        <p style="margin:0 0 20px;color:#64748b">${studentDisplay} has scheduled a ${sessionType.toLowerCase()} with you.</p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
          <tr><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px 6px 0 0;font-size:13px;color:#64748b;font-weight:600;width:40%">STUDENT</td>
              <td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-left:none;border-radius:0 6px 0 0;font-size:15px;color:#1e293b;font-weight:600">${studentDisplay}</td></tr>
          <tr><td style="padding:10px;border:1px solid #e2e8f0;border-top:none;font-size:13px;color:#64748b;font-weight:600">START</td>
              <td style="padding:10px;border:1px solid #e2e8f0;border-top:none;border-left:none;font-size:15px;color:#1e293b">${fmtDate(payload.startIso)}</td></tr>
          <tr><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;font-size:13px;color:#64748b;font-weight:600">END</td>
              <td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-left:none;font-size:15px;color:#1e293b">${fmtDate(payload.endIso)}</td></tr>
          ${payload.subject ? `<tr><td style="padding:10px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 0 6px;font-size:13px;color:#64748b;font-weight:600">SUBJECT</td><td style="padding:10px;border:1px solid #e2e8f0;border-top:none;border-left:none;border-radius:0 0 6px 0;font-size:15px;color:#1e293b">${payload.subject}</td></tr>` : ''}
          ${payload.notes ? `<tr><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 0 6px;font-size:13px;color:#64748b;font-weight:600">NOTES</td><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-left:none;border-radius:0 0 6px 0;font-size:15px;color:#1e293b">${payload.notes}</td></tr>` : ''}
        </table>
        <a href="${bookingUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">View Session</a>
        ${calendarButtons(`Session with ${studentDisplay}`, payload.startIso, payload.endIso, `Tunect session: ${bookingUrl}`)}
        <p style="margin:20px 0 0;padding:12px;background:#fefce8;border:1px solid #fde68a;border-radius:6px;font-size:13px;color:#92400e">
          📎 A calendar invite (.ics) is attached — open it to add this session to your calendar.
        </p>`,
      );

      await this.sendNotificationEmail(payload.tutorEmail, tutorSubject, tutorBody, tutorIcsAttachment ? [tutorIcsAttachment] : []);
    }
  }

  /**
   * Send a reminder N minutes before the lesson.
   */
  async bookingReminder(payload: BookingReminderPayload): Promise<void> {
    const baseUrl = process.env.APP_BASE_URL ?? 'https://tunectnow.com';
    const bookingUrl = `${baseUrl}/class/${payload.bookingId}`;
    const subject = `⏰ Your session starts in ${payload.minutesBefore} min`;
    const recipientName = payload.recipientName ?? 'there';
    const otherParty = payload.otherPartyName ?? 'the other participant';

    const html = emailShell(
      `Your tutoring session starts in ${payload.minutesBefore} minutes.`,
      `<h2 style="margin:0 0 4px;color:#1e293b;font-size:22px">Session Starting Soon ⏰</h2>
      <p style="margin:0 0 20px;color:#64748b">Hi ${recipientName}, your session with <strong>${otherParty}</strong> begins in <strong>${payload.minutesBefore} minutes</strong>.</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <tr><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px 6px 0 0;font-size:13px;color:#64748b;font-weight:600;width:36%">STARTS</td>
            <td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-left:none;border-radius:0 6px 0 0;font-size:15px;color:#1e293b;font-weight:600">${fmtDate(payload.startIso)}</td></tr>
        <tr><td style="padding:10px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 0 6px;font-size:13px;color:#64748b;font-weight:600">ENDS</td>
            <td style="padding:10px;border:1px solid #e2e8f0;border-top:none;border-left:none;border-radius:0 0 6px 0;font-size:15px;color:#1e293b">${fmtDate(payload.endIso)}</td></tr>
      </table>
      <a href="${bookingUrl}" style="display:inline-block;padding:14px 28px;background:#16a34a;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:16px">🚀 Join Session Now</a>`,
    );

    await this.sendNotificationEmail(payload.to, subject, html);
  }

  /**
   * Send payment receipt with token validity details.
   */
  async paymentReceiptEmail(payload: PaymentReceiptPayload): Promise<void> {
    const baseUrl = process.env.APP_BASE_URL ?? 'https://tunectnow.com';
    const currency = payload.currency ?? 'INR';
    const amountFormatted = (payload.amountPaid / 100).toLocaleString('en-IN', {
      style: 'currency',
      currency,
    });
    const expiryDisplay = payload.expiryDate ? fmtDate(payload.expiryDate) : '60 days from purchase';
    const purchasedDisplay = payload.purchasedAt ? fmtDate(payload.purchasedAt) : new Date().toLocaleDateString('en-IN');
    const purchasedDateShort = payload.purchasedAt
      ? new Date(payload.purchasedAt).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })
      : new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });
    const tutorDisplay = payload.tutorName ?? 'your tutor';
    const receiptId = payload.paymentId.slice(0, 12).toUpperCase();
    const orderId = payload.providerOrderId || payload.paymentId.slice(0, 16);
    const subject = `Payment confirmed — ${payload.tokensPurchased} token${payload.tokensPurchased === 1 ? '' : 's'} purchased`;

    const html = emailShell(
      `You've purchased ${payload.tokensPurchased} tokens for ${tutorDisplay} on Tunect.`,
      `<h2 style="margin:0 0 4px;color:#1e293b;font-size:22px">Payment Confirmed 💳</h2>
      <p style="margin:0 0 24px;color:#64748b">Hi ${payload.studentName ?? 'there'}, your token purchase was successful.</p>

      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;margin-bottom:24px;text-align:center">
        <div style="font-size:40px;font-weight:800;color:#16a34a">${payload.tokensPurchased}</div>
        <div style="font-size:14px;color:#166534;font-weight:600">TOKENS ADDED</div>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <tr><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px 6px 0 0;font-size:13px;color:#64748b;font-weight:600;width:40%">TUTOR</td>
            <td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-left:none;border-radius:0 6px 0 0;font-size:15px;color:#1e293b;font-weight:600">${tutorDisplay}</td></tr>
        <tr><td style="padding:10px;border:1px solid #e2e8f0;border-top:none;font-size:13px;color:#64748b;font-weight:600">AMOUNT PAID</td>
            <td style="padding:10px;border:1px solid #e2e8f0;border-top:none;border-left:none;font-size:15px;color:#1e293b;font-weight:600">${amountFormatted}</td></tr>
        <tr><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;font-size:13px;color:#64748b;font-weight:600">PURCHASED ON</td>
            <td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-left:none;font-size:15px;color:#1e293b">${purchasedDisplay}</td></tr>
        <tr><td style="padding:10px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 0 6px;font-size:13px;color:#64748b;font-weight:600">VALID UNTIL</td>
            <td style="padding:10px;border:1px solid #e2e8f0;border-top:none;border-left:none;border-radius:0 0 6px 0;font-size:15px;color:#dc2626;font-weight:600">⚠️ ${expiryDisplay}</td></tr>
        <tr><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 0 6px;font-size:13px;color:#64748b;font-weight:600">PAYMENT ID</td>
            <td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-left:none;border-radius:0 0 6px 0;font-size:13px;color:#94a3b8;font-family:monospace">${payload.paymentId}</td></tr>
      </table>

      <p style="margin:0 0 20px;padding:12px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;font-size:13px;color:#991b1b">
        ⚠️ <strong>Tokens expire in 60 days.</strong> Use them before <strong>${expiryDisplay}</strong> to avoid losing them.
      </p>

      <a href="${baseUrl}/student/sessions" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">Book a Session Now</a>`,
    );

    // Generate receipt HTML for PDF-like attachment
    const receiptHtml = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Tunect Receipt</title></head>
<body style="margin:0;padding:40px;font-family:Arial,sans-serif;color:#1e293b;background:#fff">
<div style="max-width:500px;margin:0 auto">
  <div style="text-align:center;margin-bottom:32px">
    <div style="font-size:32px;font-weight:bold;color:#2563eb;margin-bottom:8px">TUNECT</div>
    <p style="font-size:13px;color:#475569;font-weight:600;margin:0">Tunect Private Limited</p>
    <p style="font-size:11px;color:#64748b;margin:8px 0 0">Email: support@tunectnow.com<br/>Website: www.tunectnow.com</p>
  </div>
  <div style="border-top:4px solid #cbd5e1;border-bottom:4px solid #cbd5e1;padding:16px 0;margin-bottom:32px;text-align:center">
    <p style="font-weight:bold;font-size:18px;margin:0">PAYMENT RECEIPT</p>
    <p style="font-size:12px;color:#475569;margin:8px 0 0;font-weight:600">Receipt #${receiptId}</p>
  </div>
  <table style="width:100%;border-collapse:collapse;margin-bottom:32px">
    <tr style="border-bottom:1px solid #e2e8f0"><td style="padding:12px 0;font-size:13px;color:#64748b">Date</td><td style="padding:12px 0;font-size:13px;font-weight:600;text-align:right">${purchasedDateShort}</td></tr>
    <tr style="border-bottom:1px solid #e2e8f0"><td style="padding:12px 0;font-size:13px;color:#64748b">Order ID</td><td style="padding:12px 0;font-size:13px;font-weight:600;text-align:right">${orderId}</td></tr>
    <tr style="border-bottom:1px solid #e2e8f0"><td style="padding:12px 0;font-size:13px;color:#64748b">Payment Status</td><td style="padding:12px 0;text-align:right"><span style="background:#d1fae5;color:#065f46;font-size:11px;font-weight:bold;padding:4px 12px;border-radius:4px">✓ SUCCEEDED</span></td></tr>
  </table>
  <div style="background:#f1f5f9;border:2px solid #cbd5e1;border-radius:8px;padding:20px;margin-bottom:32px">
    <div style="display:flex;justify-content:space-between;padding-bottom:16px;margin-bottom:16px;border-bottom:2px solid #cbd5e1"><span style="font-weight:bold;font-size:16px">${payload.tokensPurchased} Tokens</span><span style="font-weight:bold;font-size:16px">${amountFormatted}</span></div>
    <div style="display:flex;justify-content:space-between"><span style="font-weight:bold;font-size:14px">Total Amount Paid</span><span style="font-size:20px;font-weight:bold;color:#16a34a">${amountFormatted}</span></div>
  </div>
  <div style="background:#f8fafc;border-radius:6px;padding:16px;text-align:center;font-size:11px;color:#475569;margin-bottom:24px">
    <p style="margin:4px 0">• Tokens are valid for 60 days from the date of purchase</p>
    <p style="margin:4px 0">• Unused tokens will expire after 60 days</p>
    <p style="margin:4px 0">• No refund after expiration</p>
  </div>
  <div style="border-top:2px solid #cbd5e1;padding-top:24px;text-align:center;font-size:11px;color:#64748b">
    <p style="font-weight:600;margin:0 0 8px">Thank you for your purchase!</p>
    <p style="margin:0 0 16px">For support, contact us at support@tunectnow.com</p>
    <p style="font-style:italic;color:#94a3b8">This receipt is valid without a signature</p>
  </div>
</div></body></html>`;

    const receiptAttachment: EmailAttachment = {
      filename: `tunect-receipt-${receiptId}.html`,
      contentBase64: Buffer.from(receiptHtml, 'utf-8').toString('base64'),
      contentType: 'text/html',
    };

    await this.sendNotificationEmail(payload.studentEmail, subject, html, [receiptAttachment]);
  }

  /**
   * Notify tutor that a student purchased tokens for them.
   */
  async tutorTokenPurchaseEmail(payload: TutorTokenPurchasePayload): Promise<void> {
    const baseUrl = process.env.APP_BASE_URL ?? 'https://tunectnow.com';
    const subject = `${payload.studentName} purchased ${payload.tokensPurchased} token${payload.tokensPurchased === 1 ? '' : 's'} for your sessions`;

    const html = emailShell(
      `${payload.studentName} has purchased tokens for your tutoring sessions on Tunect.`,
      `<h2 style="margin:0 0 4px;color:#1e293b;font-size:22px">New Token Purchase 🎉</h2>
      <p style="margin:0 0 24px;color:#64748b">Hi ${payload.tutorName ?? 'there'}, great news!</p>

      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:24px;margin-bottom:24px;text-align:center">
        <div style="font-size:18px;font-weight:700;color:#1e293b;margin-bottom:8px">${payload.studentName}</div>
        <div style="font-size:14px;color:#166534">has purchased <strong style="font-size:24px">${payload.tokensPurchased}</strong> token${payload.tokensPurchased === 1 ? '' : 's'}</div>
      </div>

      <p style="margin:0 0 24px;padding:16px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;font-size:14px;color:#1e40af">
        📅 <strong>Please add your availability for the next 10 days</strong> so that ${payload.studentName} can book sessions with you.
      </p>

      <a href="${baseUrl}/tutor/availability" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">Add Availability Now</a>`,
    );

    await this.sendNotificationEmail(payload.tutorEmail, subject, html);
  }

  /**
   * Remind tutor they have low availability and students with remaining tokens.
   */
  async lowAvailabilityReminderEmail(payload: LowAvailabilityReminderPayload): Promise<void> {
    const baseUrl = process.env.APP_BASE_URL ?? 'https://tunectnow.com';
    const subject = `⚠️ Low availability — ${payload.students.length} student${payload.students.length === 1 ? '' : 's'} waiting to book`;

    const studentRows = payload.students.map((s) =>
      `<tr><td style="padding:10px;border:1px solid #e2e8f0;font-size:14px;color:#1e293b;font-weight:600">${s.name}</td>
           <td style="padding:10px;border:1px solid #e2e8f0;font-size:14px;color:#16a34a;font-weight:700;text-align:center">${s.remainingTokens}</td></tr>`
    ).join('');

    const html = emailShell(
      `You have ${payload.upcomingSlotCount} slot${payload.upcomingSlotCount === 1 ? '' : 's'} available — students are waiting to book.`,
      `<h2 style="margin:0 0 4px;color:#1e293b;font-size:22px">Low Availability Alert ⚠️</h2>
      <p style="margin:0 0 24px;color:#64748b">Hi ${payload.tutorName ?? 'there'}, you currently have <strong>${payload.upcomingSlotCount}</strong> upcoming slot${payload.upcomingSlotCount === 1 ? '' : 's'} available.</p>

      <p style="margin:0 0 16px;font-size:14px;color:#475569">The following students have remaining tokens with you:</p>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <tr><th style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;text-align:left;font-size:12px;color:#64748b;font-weight:600;text-transform:uppercase">Student</th>
            <th style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;text-align:center;font-size:12px;color:#64748b;font-weight:600;text-transform:uppercase">Remaining Tokens</th></tr>
        ${studentRows}
      </table>

      <p style="margin:0 0 24px;padding:16px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;font-size:14px;color:#991b1b">
        📅 <strong>Add availability for the next 10 days</strong> so your students can schedule their sessions and you receive your payments.
      </p>

      <a href="${baseUrl}/tutor/availability" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">Add Availability Now</a>`,
    );

    await this.sendNotificationEmail(payload.tutorEmail, subject, html);
  }

  /**
   * Send cancellation + refund email (tutor no-show, manual cancel, etc.)
   */
  async bookingCancellationEmail(payload: BookingCancellationPayload): Promise<void> {
    const reasons: Record<string, { title: string; detail: string }> = {
      TUTOR_NO_SHOW: {
        title: 'Session Cancelled — Tutor Did Not Join',
        detail: 'Your tutor did not join the session within the allowed window. Your token has been automatically refunded.',
      },
      STUDENT_NO_SHOW: {
        title: 'Session Cancelled — You Did Not Join',
        detail: 'This session was marked as cancelled because you did not join. Tokens were not refunded.',
      },
      MANUAL: {
        title: 'Session Cancelled',
        detail: 'This session was cancelled.',
      },
    };
    const r = reasons[payload.reason] ?? reasons['MANUAL'];
    const tutorDisplay = payload.tutorName ?? 'your tutor';
    const subject = r.title;

    const html = emailShell(
      r.detail,
      `<h2 style="margin:0 0 4px;color:#1e293b;font-size:22px">${r.title} ❌</h2>
      <p style="margin:0 0 20px;color:#64748b">${r.detail}</p>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <tr><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px 6px 0 0;font-size:13px;color:#64748b;font-weight:600;width:40%">TUTOR</td>
            <td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-left:none;border-radius:0 6px 0 0;font-size:15px;color:#1e293b;font-weight:600">${tutorDisplay}</td></tr>
        ${payload.startIso ? `<tr><td style="padding:10px;border:1px solid #e2e8f0;border-top:none;font-size:13px;color:#64748b;font-weight:600">SCHEDULED AT</td>
            <td style="padding:10px;border:1px solid #e2e8f0;border-top:none;border-left:none;font-size:15px;color:#1e293b">${fmtDate(payload.startIso)}</td></tr>` : ''}
        <tr><td style="padding:10px;${payload.tokensRefunded > 0 ? 'background:#f0fdf4' : 'background:#f8fafc'};border:1px solid ${payload.tokensRefunded > 0 ? '#bbf7d0' : '#e2e8f0'};border-top:none;border-radius:0 0 0 6px;font-size:13px;color:#64748b;font-weight:600">REFUND</td>
            <td style="padding:10px;${payload.tokensRefunded > 0 ? 'background:#f0fdf4' : 'background:#f8fafc'};border:1px solid ${payload.tokensRefunded > 0 ? '#bbf7d0' : '#e2e8f0'};border-top:none;border-left:none;border-radius:0 0 6px 0;font-size:15px;color:${payload.tokensRefunded > 0 ? '#16a34a' : '#94a3b8'};font-weight:600">
              ${payload.tokensRefunded > 0 ? `✅ ${payload.tokensRefunded} token${payload.tokensRefunded === 1 ? '' : 's'} refunded to your account` : 'No refund issued'}
            </td></tr>
      </table>

      ${payload.tokensRefunded > 0 ? `<p style="padding:12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;font-size:14px;color:#166534;margin:0 0 20px">
        ✅ <strong>${payload.tokensRefunded} token${payload.tokensRefunded === 1 ? ' has' : 's have'} been credited back</strong> to your Tunect wallet and are ready to use.
      </p>` : ''}`,
    );

    await this.sendNotificationEmail(payload.studentEmail, subject, html);
  }

  /* =========================
     Notification Storage API
     ========================= */

  async create(dto: CreateNotificationDto) {
    return this.prisma.notification.create({
      data: {
        userId: dto.userId,
        title: dto.title,
        message: dto.message,
        type: dto.type,
        bookingId: dto.bookingId,
        link: dto.link,
      },
    });
  }

  async getUserNotifications(userId: string, unreadOnly = false) {
    return this.prisma.notification.findMany({
      where: {
        userId,
        ...(unreadOnly ? { isRead: false } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        booking: {
          select: {
            id: true,
            startTime: true,
            endTime: true,
            tutor: { select: { id: true, user: { select: { name: true } } } },
          },
        },
      },
    });
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({
      where: { userId, isRead: false },
    });
  }

  async markAsRead(id: string, userId: string) {
    return this.prisma.notification.updateMany({
      where: { id, userId },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }

  async deleteNotification(id: string, userId: string) {
    return this.prisma.notification.deleteMany({
      where: { id, userId },
    });
  }

  async createBookingNotification(
    userId: string,
    bookingId: string,
    title: string,
    message: string,
  ) {
    return this.create({
      userId,
      title,
      message,
      type: 'BOOKING' as any,
      bookingId,
    });
  }

  async createPaymentNotification(
    userId: string,
    title: string,
    message: string,
  ) {
    return this.create({
      userId,
      title,
      message,
      type: 'PAYMENT' as any,
    });
  }

  async createSystemNotification(
    userId: string,
    title: string,
    message: string,
    link?: string,
  ) {
    return this.create({
      userId,
      title,
      message,
      type: 'SYSTEM' as any,
      link,
    });
  }

  // ─── Unread message email ────────────────────────────────────────────────

  async sendUnreadMessageEmail(opts: {
    to: string;
    recipientName: string;
    senderName: string;
    conversationId: string;
    unreadCount: number;
    role?: 'STUDENT' | 'TUTOR' | 'ADMIN';
  }): Promise<void> {
    const baseUrl = process.env.APP_BASE_URL ?? 'https://tunectnow.com';
    const messagesPath = opts.role === 'TUTOR' ? 'tutor/messages'
      : opts.role === 'ADMIN' ? 'admin/messages'
      : 'student/messages';
    const link = `${baseUrl}/${messagesPath}`;
    const subject = `💬 You have ${opts.unreadCount} unread message${opts.unreadCount === 1 ? '' : 's'} from ${opts.senderName}`;

    const html = emailShell(
      `${opts.senderName} sent you ${opts.unreadCount === 1 ? 'a message' : `${opts.unreadCount} messages`} on Tunect — check your inbox.`,
      `<h2 style="margin:0 0 4px;color:#1e293b;font-size:22px">New Message from ${opts.senderName} 💬</h2>
      <p style="margin:0 0 20px;color:#64748b">Hi ${opts.recipientName}, you have <strong>${opts.unreadCount} unread message${opts.unreadCount === 1 ? '' : 's'}</strong> waiting for you.</p>

      <div style="padding:16px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;margin-bottom:24px">
        <p style="margin:0;font-size:15px;color:#1e40af">
          📬 <strong>${opts.senderName}</strong> sent you ${opts.unreadCount === 1 ? 'a message' : `${opts.unreadCount} messages`}. Open Tunect to reply.
        </p>
      </div>

      <a href="${link}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">View Messages</a>

      <p style="margin:20px 0 0;font-size:13px;color:#94a3b8">You received this email because a message has been unread for more than 15 minutes. Once you read the message, no further reminders will be sent.</p>`,
    );

    await this.sendNotificationEmail(opts.to, subject, html);
  }

  // ─── Support ticket confirmation (sent to user on ticket creation) ───────

  async sendSupportTicketOpenedEmail(opts: {
    to: string;
    userName: string;
    ticketId: string;
    ticketNumber: number;
    subject: string | null;
    message: string;
  }): Promise<void> {
    const baseUrl = process.env.APP_BASE_URL ?? 'https://tunectnow.com';
    const link = `${baseUrl}/support/tickets/${opts.ticketId}`;
    const emailSubject = `✅ Support ticket #${opts.ticketNumber} received — We'll be in touch`;

    const html = emailShell(
      `Your support ticket #${opts.ticketNumber} has been received. Our team will respond shortly.`,
      `<h2 style="margin:0 0 4px;color:#1e293b;font-size:22px">Support Ticket Received ✅</h2>
      <p style="margin:0 0 20px;color:#64748b">Hi ${opts.userName}, we've received your support request and will respond as soon as possible.</p>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <tr>
          <td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px 6px 0 0;font-size:13px;color:#64748b;font-weight:600;width:40%">TICKET #</td>
          <td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-left:none;border-radius:0 6px 0 0;font-size:15px;color:#1e293b;font-weight:700">#${opts.ticketNumber}</td>
        </tr>
        ${opts.subject ? `<tr>
          <td style="padding:10px;border:1px solid #e2e8f0;border-top:none;font-size:13px;color:#64748b;font-weight:600">SUBJECT</td>
          <td style="padding:10px;border:1px solid #e2e8f0;border-top:none;border-left:none;font-size:14px;color:#1e293b">${opts.subject}</td>
        </tr>` : ''}
        <tr>
          <td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 0 6px;font-size:13px;color:#64748b;font-weight:600">YOUR MESSAGE</td>
          <td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-left:none;border-radius:0 0 6px 0;font-size:14px;color:#1e293b">${opts.message.slice(0, 300)}${opts.message.length > 300 ? '…' : ''}</td>
        </tr>
      </table>

      <a href="${link}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">View Ticket</a>

      <p style="margin:20px 0 0;font-size:13px;color:#94a3b8">You can track your ticket status anytime by logging into Tunect. We aim to respond within 24 hours.</p>`,
    );

    await this.sendNotificationEmail(opts.to, emailSubject, html);
  }

  // ─── Support ticket closed notification (sent to user) ───────────────────

  async sendSupportTicketClosedEmail(opts: {
    to: string;
    userName: string;
    ticketId: string;
    ticketNumber: number;
    subject: string | null;
  }): Promise<void> {
    const baseUrl = process.env.APP_BASE_URL ?? 'https://tunectnow.com';
    const link = `${baseUrl}/support/tickets/${opts.ticketId}`;
    const emailSubject = `🔒 Support ticket #${opts.ticketNumber} has been closed`;

    const html = emailShell(
      `Your support ticket #${opts.ticketNumber} has been resolved and closed.`,
      `<h2 style="margin:0 0 4px;color:#1e293b;font-size:22px">Ticket Closed 🔒</h2>
      <p style="margin:0 0 20px;color:#64748b">Hi ${opts.userName}, your support ticket has been marked as closed.</p>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <tr>
          <td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px 6px 0 0;font-size:13px;color:#64748b;font-weight:600;width:40%">TICKET #</td>
          <td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-left:none;border-radius:0 6px 0 0;font-size:15px;color:#1e293b;font-weight:700">#${opts.ticketNumber}</td>
        </tr>
        ${opts.subject ? `<tr>
          <td style="padding:10px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 0 6px;font-size:13px;color:#64748b;font-weight:600">SUBJECT</td>
          <td style="padding:10px;border:1px solid #e2e8f0;border-top:none;border-left:none;border-radius:0 0 6px 0;font-size:14px;color:#1e293b">${opts.subject}</td>
        </tr>` : ''}
        <tr>
          <td style="padding:10px;background:#f0fdf4;border:1px solid #bbf7d0;border-top:none;border-radius:0 0 0 6px;font-size:13px;color:#166534;font-weight:600">STATUS</td>
          <td style="padding:10px;background:#f0fdf4;border:1px solid #bbf7d0;border-top:none;border-left:none;border-radius:0 0 6px 0;font-size:14px;color:#166534;font-weight:700">Closed ✅</td>
        </tr>
      </table>

      <p style="margin:0 0 24px;font-size:14px;color:#475569">If your issue was not resolved, you can open a new ticket and our team will assist you.</p>

      <a href="${link}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">View Ticket</a>`,
    );

    await this.sendNotificationEmail(opts.to, emailSubject, html);
  }

  // ─── Unassigned ticket admin notification ────────────────────────────────

  async sendUnassignedTicketAdminEmail(opts: {
    to: string;
    adminName: string;
    ticketId: string;
    ticketNumber: number;
    subject: string | null;
    description: string;
    userName: string;
    userRole: string;
    createdAt: Date;
  }): Promise<void> {
    const baseUrl = process.env.APP_BASE_URL ?? 'https://tunectnow.com';
    const link = `${baseUrl}/admin/support/${opts.ticketId}`;
    const emailSubject = `⚠️ Unassigned support ticket #${opts.ticketNumber} needs your attention`;

    const html = emailShell(
      `Support ticket #${opts.ticketNumber} is unassigned — please assign it to yourself.`,
      `<h2 style="margin:0 0 4px;color:#1e293b;font-size:22px">Unassigned Support Ticket ⚠️</h2>
      <p style="margin:0 0 20px;color:#64748b">Hi ${opts.adminName}, there is an open support ticket that has not been assigned yet. Please review and assign it.</p>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <tr>
          <td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px 6px 0 0;font-size:13px;color:#64748b;font-weight:600;width:40%">TICKET #</td>
          <td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-left:none;border-radius:0 6px 0 0;font-size:15px;color:#1e293b;font-weight:700">#${opts.ticketNumber}</td>
        </tr>
        <tr>
          <td style="padding:10px;border:1px solid #e2e8f0;border-top:none;font-size:13px;color:#64748b;font-weight:600">FROM</td>
          <td style="padding:10px;border:1px solid #e2e8f0;border-top:none;border-left:none;font-size:14px;color:#1e293b">${opts.userName} <span style="background:#e2e8f0;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;color:#475569">${opts.userRole}</span></td>
        </tr>
        ${opts.subject ? `<tr>
          <td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;font-size:13px;color:#64748b;font-weight:600">SUBJECT</td>
          <td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-left:none;font-size:14px;color:#1e293b">${opts.subject}</td>
        </tr>` : ''}
        <tr>
          <td style="padding:10px;border:1px solid #e2e8f0;border-top:none;font-size:13px;color:#64748b;font-weight:600">CREATED</td>
          <td style="padding:10px;border:1px solid #e2e8f0;border-top:none;border-left:none;font-size:14px;color:#1e293b">${fmtDate(opts.createdAt.toISOString())}</td>
        </tr>
        <tr>
          <td style="padding:10px;background:#fefce8;border:1px solid #fde68a;border-top:none;border-radius:0 0 0 6px;font-size:13px;color:#92400e;font-weight:600">DESCRIPTION</td>
          <td style="padding:10px;background:#fefce8;border:1px solid #fde68a;border-top:none;border-left:none;border-radius:0 0 6px 0;font-size:14px;color:#78350f">${opts.description.slice(0, 500)}${opts.description.length > 500 ? '…' : ''}</td>
        </tr>
      </table>

      <a href="${link}" style="display:inline-block;padding:12px 24px;background:#dc2626;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">Assign to Me &amp; Respond</a>`,
    );

    await this.sendNotificationEmail(opts.to, emailSubject, html);
  }

  // ─── Admin reply follow-up (sent to ticket owner) ────────────────────────

  async sendTicketAdminReplyEmail(opts: {
    to: string;
    userName: string;
    ticketId: string;
    ticketNumber: number;
    subject: string | null;
    adminReply: string;
    adminName: string;
  }): Promise<void> {
    const baseUrl = process.env.APP_BASE_URL ?? 'https://tunectnow.com';
    const link = `${baseUrl}/support/tickets/${opts.ticketId}`;
    const emailSubject = `💬 Follow-up on your ticket #${opts.ticketNumber} — Reply from Tunect Support`;

    const html = emailShell(
      `The Tunect support team has replied to your ticket #${opts.ticketNumber}.`,
      `<h2 style="margin:0 0 4px;color:#1e293b;font-size:22px">Support Team Replied 💬</h2>
      <p style="margin:0 0 20px;color:#64748b">Hi ${opts.userName}, the Tunect support team has responded to your open support ticket.</p>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <tr>
          <td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px 6px 0 0;font-size:13px;color:#64748b;font-weight:600;width:40%">TICKET #</td>
          <td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-left:none;border-radius:0 6px 0 0;font-size:15px;color:#1e293b;font-weight:700">#${opts.ticketNumber}</td>
        </tr>
        ${opts.subject ? `<tr>
          <td style="padding:10px;border:1px solid #e2e8f0;border-top:none;font-size:13px;color:#64748b;font-weight:600">SUBJECT</td>
          <td style="padding:10px;border:1px solid #e2e8f0;border-top:none;border-left:none;font-size:14px;color:#1e293b">${opts.subject}</td>
        </tr>` : ''}
        <tr>
          <td style="padding:10px;background:#eff6ff;border:1px solid #bfdbfe;border-top:none;border-radius:0 0 0 6px;font-size:13px;color:#1e40af;font-weight:600">REPLY FROM ${opts.adminName.toUpperCase()}</td>
          <td style="padding:10px;background:#eff6ff;border:1px solid #bfdbfe;border-top:none;border-left:none;border-radius:0 0 6px 0;font-size:14px;color:#1e293b">${opts.adminReply.slice(0, 500)}${opts.adminReply.length > 500 ? '…' : ''}</td>
        </tr>
      </table>

      <a href="${link}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">View &amp; Reply</a>

      <p style="margin:20px 0 0;font-size:13px;color:#94a3b8">This is a follow-up reminder. If you've already seen this message, no action is needed — reminders stop once you view the ticket.</p>`,
    );

    await this.sendNotificationEmail(opts.to, emailSubject, html);
  }

  // ─── Welcome + Email Verification ────────────────────────────────────────

  async sendWelcomeVerificationEmail(opts: {
    to: string;
    name?: string;
    verificationToken: string;
    role: 'STUDENT' | 'TUTOR';
  }): Promise<boolean> {
    const baseUrl = process.env.APP_BASE_URL ?? 'https://tunectnow.com';
    const verifyUrl = `${baseUrl}/auth/verify-email?token=${opts.verificationToken}`;
    const displayName = opts.name ?? 'there';
    const isStudent = opts.role === 'STUDENT';

    const onboardingSteps = isStudent
      ? `<ol style="margin:16px 0;padding-left:24px;color:#475569;font-size:14px;line-height:1.8">
          <li>✅ Verify your email (you're doing this now)</li>
          <li>Complete your student profile</li>
          <li>Browse tutors and find your perfect match</li>
          <li>Purchase tokens and book your first session</li>
        </ol>`
      : `<ol style="margin:16px 0;padding-left:24px;color:#475569;font-size:14px;line-height:1.8">
          <li>✅ Verify your email (you're doing this now)</li>
          <li>Complete your tutor profile and add qualifications</li>
          <li>Set your availability schedule</li>
          <li>Wait for admin approval — we'll email you once approved</li>
          <li>Start receiving bookings and earning!</li>
        </ol>`;

    const html = emailShell(
      `Welcome to Tunect, ${displayName}! Verify your email to get started.`,
      `<h2 style="margin:0 0 4px;color:#1e293b;font-size:22px">Welcome to Tunect, ${displayName}! 🎓</h2>
      <p style="margin:0 0 20px;color:#64748b">We're excited to have you on board. Please verify your email address to activate your account.</p>

      <div style="text-align:center;margin:28px 0">
        <a href="${verifyUrl}" style="display:inline-block;padding:14px 32px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:16px">Verify My Email</a>
      </div>

      <p style="margin:0 0 4px;font-size:13px;color:#94a3b8">This link expires in <strong>24 hours</strong>. If you didn't create a Tunect account, you can safely ignore this email.</p>

      <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0">

      <p style="margin:0 0 8px;font-weight:600;color:#1e293b">Your onboarding steps:</p>
      ${onboardingSteps}

      <p style="margin:20px 0 0;padding:12px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;font-size:13px;color:#1e40af">
        🔒 Your account will be <strong>restricted</strong> until you verify your email. Resend the verification from your account settings if needed.
      </p>`,
    );

    return this.sendEmail(opts.to, 'Verify your Tunect email address', html);
  }

  async sendEmailVerifiedConfirmation(opts: { to: string; name?: string; role: 'STUDENT' | 'TUTOR' }): Promise<void> {
    const baseUrl = process.env.APP_BASE_URL ?? 'https://tunectnow.com';
    const dashboardUrl = opts.role === 'TUTOR' ? `${baseUrl}/tutor/dashboard` : `${baseUrl}/student/dashboard`;
    const html = emailShell(
      'Your email has been verified successfully.',
      `<h2 style="margin:0 0 4px;color:#1e293b;font-size:22px">Email Verified ✅</h2>
      <p style="margin:0 0 20px;color:#64748b">Hi ${opts.name ?? 'there'}, your email address has been verified successfully. Your Tunect account is now fully active.</p>
      <a href="${dashboardUrl}" style="display:inline-block;padding:12px 24px;background:#16a34a;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">Go to Dashboard</a>`,
    );
    await this.sendNotificationEmail(opts.to, '✅ Email verified — Welcome to Tunect!', html);
  }

  // ─── Session Cancellation (Tutor + Student + Admin CC) ───────────────────

  async sendSessionCancellationTutor(opts: {
    to: string;
    tutorName?: string;
    studentName?: string;
    bookingId: string;
    startIso: string;
    subject?: string;
    cancelledBy: 'STUDENT' | 'ADMIN' | 'SYSTEM';
    reason?: string;
  }): Promise<void> {
    const baseUrl = process.env.APP_BASE_URL ?? 'https://tunectnow.com';
    const bookingUrl = `${baseUrl}/tutor/bookings`;
    const cancellerLabel = opts.cancelledBy === 'STUDENT' ? opts.studentName ?? 'The student' : 'Admin/System';

    const html = emailShell(
      `A session with ${opts.studentName ?? 'your student'} has been cancelled.`,
      `<h2 style="margin:0 0 4px;color:#1e293b;font-size:22px">Session Cancelled ❌</h2>
      <p style="margin:0 0 20px;color:#64748b">Hi ${opts.tutorName ?? 'there'}, <strong>${cancellerLabel}</strong> has cancelled the following session.</p>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <tr><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px 6px 0 0;font-size:13px;color:#64748b;font-weight:600;width:40%">STUDENT</td>
            <td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-left:none;border-radius:0 6px 0 0;font-size:15px;color:#1e293b;font-weight:600">${opts.studentName ?? '—'}</td></tr>
        <tr><td style="padding:10px;border:1px solid #e2e8f0;border-top:none;font-size:13px;color:#64748b;font-weight:600">SCHEDULED AT</td>
            <td style="padding:10px;border:1px solid #e2e8f0;border-top:none;border-left:none;font-size:15px;color:#1e293b">${fmtDate(opts.startIso)}</td></tr>
        ${opts.subject ? `<tr><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;font-size:13px;color:#64748b;font-weight:600">SUBJECT</td>
            <td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-left:none;font-size:15px;color:#1e293b">${opts.subject}</td></tr>` : ''}
        ${opts.reason ? `<tr><td style="padding:10px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 0 6px;font-size:13px;color:#64748b;font-weight:600">REASON</td>
            <td style="padding:10px;border:1px solid #e2e8f0;border-top:none;border-left:none;border-radius:0 0 6px 0;font-size:14px;color:#475569">${opts.reason}</td></tr>` : ''}
      </table>

      <a href="${bookingUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">View My Bookings</a>`,
    );

    await this.sendNotificationEmail(opts.to, `Session cancelled — ${fmtDate(opts.startIso)}`, html);
  }

  async sendSessionCancellationStudent(opts: {
    to: string;
    studentName?: string;
    tutorName?: string;
    bookingId: string;
    startIso: string;
    subject?: string;
    cancelledBy: 'TUTOR' | 'ADMIN' | 'SYSTEM';
    reason?: string;
    tokensRefunded: number;
    cancellationPolicy?: string;
  }): Promise<void> {
    const baseUrl = process.env.APP_BASE_URL ?? 'https://tunectnow.com';
    const cancellerLabel = opts.cancelledBy === 'TUTOR' ? opts.tutorName ?? 'Your tutor' : 'Admin/System';
    const policy = opts.cancellationPolicy ?? 'Sessions cancelled within 2 hours of the start time may not be eligible for a full refund. Please review our cancellation policy.';

    const html = emailShell(
      `Your session on ${fmtDate(opts.startIso)} has been cancelled.`,
      `<h2 style="margin:0 0 4px;color:#1e293b;font-size:22px">Session Cancelled ❌</h2>
      <p style="margin:0 0 20px;color:#64748b">Hi ${opts.studentName ?? 'there'}, <strong>${cancellerLabel}</strong> has cancelled the following session.</p>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <tr><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px 6px 0 0;font-size:13px;color:#64748b;font-weight:600;width:40%">TUTOR</td>
            <td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-left:none;border-radius:0 6px 0 0;font-size:15px;color:#1e293b;font-weight:600">${opts.tutorName ?? '—'}</td></tr>
        <tr><td style="padding:10px;border:1px solid #e2e8f0;border-top:none;font-size:13px;color:#64748b;font-weight:600">SCHEDULED AT</td>
            <td style="padding:10px;border:1px solid #e2e8f0;border-top:none;border-left:none;font-size:15px;color:#1e293b">${fmtDate(opts.startIso)}</td></tr>
        ${opts.subject ? `<tr><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;font-size:13px;color:#64748b;font-weight:600">SUBJECT</td>
            <td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-left:none;font-size:15px;color:#1e293b">${opts.subject}</td></tr>` : ''}
        ${opts.reason ? `<tr><td style="padding:10px;border:1px solid #e2e8f0;border-top:none;font-size:13px;color:#64748b;font-weight:600">REASON</td>
            <td style="padding:10px;border:1px solid #e2e8f0;border-top:none;border-left:none;font-size:14px;color:#475569">${opts.reason}</td></tr>` : ''}
        <tr><td style="padding:10px;${opts.tokensRefunded > 0 ? 'background:#f0fdf4;border-color:#bbf7d0' : 'background:#f8fafc;border-color:#e2e8f0'};border:1px solid;border-top:none;border-radius:0 0 0 6px;font-size:13px;color:${opts.tokensRefunded > 0 ? '#166534' : '#64748b'};font-weight:600">REFUND</td>
            <td style="padding:10px;${opts.tokensRefunded > 0 ? 'background:#f0fdf4;border-color:#bbf7d0' : 'background:#f8fafc;border-color:#e2e8f0'};border:1px solid;border-top:none;border-left:none;border-radius:0 0 6px 0;font-size:15px;color:${opts.tokensRefunded > 0 ? '#16a34a' : '#94a3b8'};font-weight:600">
              ${opts.tokensRefunded > 0 ? `✅ ${opts.tokensRefunded} token${opts.tokensRefunded === 1 ? '' : 's'} refunded to your wallet` : 'No refund issued'}
            </td></tr>
      </table>

      ${opts.tokensRefunded > 0 ? `<p style="margin:0 0 20px;padding:12px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;font-size:14px;color:#166534">
        ✅ <strong>${opts.tokensRefunded} token${opts.tokensRefunded === 1 ? '' : 's'} have been credited</strong> back to your Tunect wallet and are ready to use for future sessions.
      </p>` : ''}

      <div style="padding:12px;background:#fefce8;border:1px solid #fde68a;border-radius:6px;font-size:13px;color:#92400e;margin-bottom:20px">
        📋 <strong>Cancellation Policy:</strong> ${policy}
      </div>

      <a href="${process.env.APP_BASE_URL ?? 'https://tunectnow.com'}/student/sessions" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">View Transaction History</a>`,
    );

    await this.sendNotificationEmail(opts.to, `Session cancelled — ${fmtDate(opts.startIso)}`, html);
  }

  async sendAdminCancellationCC(opts: {
    adminEmail: string;
    cancelledBy: 'TUTOR' | 'STUDENT';
    cancellerId: string;
    cancellerName?: string;
    otherPartyName?: string;
    bookingId: string;
    startIso: string;
    minutesBeforeStart: number;
    reason?: string;
  }): Promise<void> {
    const baseUrl = process.env.APP_BASE_URL ?? 'https://tunectnow.com';
    const adminBookingUrl = `${baseUrl}/admin/bookings/${opts.bookingId}`;
    const html = emailShell(
      `Late cancellation alert: ${opts.cancellerName ?? opts.cancelledBy} cancelled a session ${opts.minutesBeforeStart} min before start.`,
      `<h2 style="margin:0 0 4px;color:#1e293b;font-size:22px">Late Cancellation Alert ⚠️</h2>
      <p style="margin:0 0 20px;color:#64748b">A session was cancelled <strong>${opts.minutesBeforeStart} minutes</strong> before its start time.</p>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <tr><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px 6px 0 0;font-size:13px;color:#64748b;font-weight:600;width:40%">CANCELLED BY</td>
            <td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-left:none;border-radius:0 6px 0 0;font-size:15px;color:#1e293b;font-weight:600">${opts.cancellerName ?? opts.cancelledBy} (${opts.cancelledBy})</td></tr>
        <tr><td style="padding:10px;border:1px solid #e2e8f0;border-top:none;font-size:13px;color:#64748b;font-weight:600">OTHER PARTY</td>
            <td style="padding:10px;border:1px solid #e2e8f0;border-top:none;border-left:none;font-size:15px;color:#1e293b">${opts.otherPartyName ?? '—'}</td></tr>
        <tr><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;font-size:13px;color:#64748b;font-weight:600">SCHEDULED AT</td>
            <td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-left:none;font-size:15px;color:#1e293b">${fmtDate(opts.startIso)}</td></tr>
        <tr><td style="padding:10px;border:1px solid #e2e8f0;border-top:none;font-size:13px;color:#64748b;font-weight:600">MINS BEFORE START</td>
            <td style="padding:10px;border:1px solid #e2e8f0;border-top:none;border-left:none;font-size:15px;color:#dc2626;font-weight:700">${opts.minutesBeforeStart} minutes</td></tr>
        ${opts.reason ? `<tr><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 0 6px;font-size:13px;color:#64748b;font-weight:600">REASON</td>
            <td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-left:none;border-radius:0 0 6px 0;font-size:14px;color:#475569">${opts.reason}</td></tr>` : ''}
      </table>

      <a href="${adminBookingUrl}" style="display:inline-block;padding:12px 24px;background:#dc2626;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">Review Booking in Admin</a>`,
    );

    await this.sendEmail(opts.adminEmail, `⚠️ Late cancellation — ${opts.minutesBeforeStart} min before start`, html);
  }

  // ─── Payment Failed ───────────────────────────────────────────────────────

  async sendPaymentFailedEmail(opts: {
    to: string;
    studentName?: string;
    tutorName?: string;
    amountInMinor: number;
    currency?: string;
    reason?: string;
    paymentId?: string;
  }): Promise<void> {
    const baseUrl = process.env.APP_BASE_URL ?? 'https://tunectnow.com';
    const currency = opts.currency ?? 'INR';
    const amountFormatted = (opts.amountInMinor / 100).toLocaleString('en-IN', { style: 'currency', currency });
    const retryUrl = `${baseUrl}/student/buy-tokens`;

    const html = emailShell(
      `Your payment of ${amountFormatted} failed. Please retry.`,
      `<h2 style="margin:0 0 4px;color:#dc2626;font-size:22px">Payment Failed ❌</h2>
      <p style="margin:0 0 20px;color:#64748b">Hi ${opts.studentName ?? 'there'}, unfortunately your payment could not be processed.</p>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <tr><td style="padding:10px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px 6px 0 0;font-size:13px;color:#991b1b;font-weight:600;width:40%">AMOUNT</td>
            <td style="padding:10px;background:#fef2f2;border:1px solid #fecaca;border-left:none;border-radius:0 6px 0 0;font-size:15px;color:#dc2626;font-weight:700">${amountFormatted}</td></tr>
        ${opts.tutorName ? `<tr><td style="padding:10px;border:1px solid #e2e8f0;border-top:none;font-size:13px;color:#64748b;font-weight:600">FOR TUTOR</td>
            <td style="padding:10px;border:1px solid #e2e8f0;border-top:none;border-left:none;font-size:15px;color:#1e293b">${opts.tutorName}</td></tr>` : ''}
        ${opts.reason ? `<tr><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;font-size:13px;color:#64748b;font-weight:600">REASON</td>
            <td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-left:none;font-size:14px;color:#475569">${opts.reason}</td></tr>` : ''}
        ${opts.paymentId ? `<tr><td style="padding:10px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 0 6px;font-size:13px;color:#64748b;font-weight:600">REFERENCE</td>
            <td style="padding:10px;border:1px solid #e2e8f0;border-top:none;border-left:none;border-radius:0 0 6px 0;font-size:13px;color:#94a3b8;font-family:monospace">${opts.paymentId}</td></tr>` : ''}
      </table>

      <p style="margin:0 0 20px;font-size:14px;color:#475569">Common reasons for payment failure: insufficient funds, card declined, incorrect details, or network issues. Please check with your bank and try again.</p>

      <a href="${retryUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">Retry Payment</a>

      <p style="margin:16px 0 0;font-size:13px;color:#94a3b8">If the issue persists, contact us at support@tunectnow.com</p>`,
    );

    await this.sendNotificationEmail(opts.to, '❌ Payment failed — please retry', html);
  }

  // ─── Payout emails ────────────────────────────────────────────────────────

  async sendPayoutProcessedEmail(opts: {
    to: string;
    tutorName?: string;
    amount: number;
    currency?: string;
    paymentMethod?: string;
    referenceId?: string;
    transactionId?: string;
    receiptId?: string;
    paidAt?: string;
  }): Promise<boolean> {
    const baseUrl = process.env.APP_BASE_URL ?? 'https://tunectnow.com';
    const currency = opts.currency ?? 'INR';
    const amountFormatted = opts.amount.toLocaleString('en-IN', { style: 'currency', currency });
    const receiptId = opts.receiptId ?? `TUN-PAY-${Date.now().toString(36).toUpperCase()}`;
    const paidDateDisplay = opts.paidAt ? fmtDate(opts.paidAt) : fmtDate(new Date().toISOString());

    const html = emailShell(
      `Your payout of ${amountFormatted} has been processed.`,
      `<h2 style="margin:0 0 4px;color:#1e293b;font-size:22px">Payout Processed 💰</h2>
      <p style="margin:0 0 24px;color:#64748b">Hi ${opts.tutorName ?? 'there'}, your earnings have been transferred successfully. A receipt is attached to this email.</p>

      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:24px;margin-bottom:24px;text-align:center">
        <div style="font-size:36px;font-weight:800;color:#16a34a">${amountFormatted}</div>
        <div style="font-size:13px;color:#166534;font-weight:600;margin-top:4px">PAYOUT AMOUNT</div>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        ${opts.paymentMethod ? `<tr><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px 6px 0 0;font-size:13px;color:#64748b;font-weight:600;width:40%">PAYMENT METHOD</td>
            <td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-left:none;border-radius:0 6px 0 0;font-size:15px;color:#1e293b">${opts.paymentMethod}</td></tr>` : ''}
        <tr><td style="padding:10px;border:1px solid #e2e8f0;border-top:none;font-size:13px;color:#64748b;font-weight:600">PROCESSED ON</td>
            <td style="padding:10px;border:1px solid #e2e8f0;border-top:none;border-left:none;font-size:15px;color:#1e293b">${paidDateDisplay}</td></tr>
        ${opts.referenceId ? `<tr><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;font-size:13px;color:#64748b;font-weight:600">REFERENCE ID</td>
            <td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-left:none;font-size:13px;color:#94a3b8;font-family:monospace">${opts.referenceId}</td></tr>` : ''}
        ${opts.transactionId ? `<tr><td style="padding:10px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 0 6px;font-size:13px;color:#64748b;font-weight:600">TRANSACTION ID</td>
            <td style="padding:10px;border:1px solid #e2e8f0;border-top:none;border-left:none;border-radius:0 0 6px 0;font-size:13px;color:#94a3b8;font-family:monospace">${opts.transactionId}</td></tr>` : ''}
        <tr><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 0 6px;font-size:13px;color:#64748b;font-weight:600">RECEIPT NO.</td>
            <td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-left:none;border-radius:0 0 6px 0;font-size:13px;color:#94a3b8;font-family:monospace">${receiptId}</td></tr>
      </table>

      <a href="${baseUrl}/tutor/wallet" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">View Wallet & Earnings</a>`,
    );

    // Generate HTML receipt attachment
    const receiptHtml = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>Tunect Payout Receipt</title></head>
<body style="margin:0;padding:40px;font-family:Arial,sans-serif;color:#1e293b;background:#fff">
<div style="max-width:500px;margin:0 auto">
  <div style="text-align:center;margin-bottom:32px">
    <div style="font-size:32px;font-weight:bold;color:#2563eb;margin-bottom:8px">TUNECT</div>
    <p style="font-size:13px;color:#475569;font-weight:600;margin:0">Tunect Private Limited</p>
    <p style="font-size:11px;color:#64748b;margin:8px 0 0">Email: support@tunectnow.com<br/>Website: www.tunectnow.com</p>
  </div>
  <div style="border-top:4px solid #cbd5e1;border-bottom:4px solid #cbd5e1;padding:16px 0;margin-bottom:32px;text-align:center">
    <p style="font-weight:bold;font-size:18px;margin:0">PAYOUT RECEIPT</p>
    <p style="font-size:12px;color:#475569;margin:8px 0 0;font-weight:600">Receipt #${receiptId}</p>
  </div>
  <table style="width:100%;border-collapse:collapse;margin-bottom:32px">
    <tr style="border-bottom:1px solid #e2e8f0"><td style="padding:12px 0;font-size:13px;color:#64748b">Date</td><td style="padding:12px 0;font-size:13px;font-weight:600;text-align:right">${paidDateDisplay}</td></tr>
    <tr style="border-bottom:1px solid #e2e8f0"><td style="padding:12px 0;font-size:13px;color:#64748b">Recipient</td><td style="padding:12px 0;font-size:13px;font-weight:600;text-align:right">${opts.tutorName ?? 'Tutor'}</td></tr>
    ${opts.paymentMethod ? `<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:12px 0;font-size:13px;color:#64748b">Payment Method</td><td style="padding:12px 0;font-size:13px;font-weight:600;text-align:right">${opts.paymentMethod}</td></tr>` : ''}
    ${opts.referenceId ? `<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:12px 0;font-size:13px;color:#64748b">Reference ID</td><td style="padding:12px 0;font-size:13px;font-family:monospace;text-align:right">${opts.referenceId}</td></tr>` : ''}
    ${opts.transactionId ? `<tr style="border-bottom:1px solid #e2e8f0"><td style="padding:12px 0;font-size:13px;color:#64748b">Transaction ID</td><td style="padding:12px 0;font-size:13px;font-family:monospace;text-align:right">${opts.transactionId}</td></tr>` : ''}
    <tr style="border-bottom:1px solid #e2e8f0"><td style="padding:12px 0;font-size:13px;color:#64748b">Status</td><td style="padding:12px 0;text-align:right"><span style="background:#d1fae5;color:#065f46;font-size:11px;font-weight:bold;padding:4px 12px;border-radius:4px">✓ PAID</span></td></tr>
  </table>
  <div style="background:#f0fdf4;border:2px solid #bbf7d0;border-radius:8px;padding:20px;margin-bottom:32px">
    <div style="display:flex;justify-content:space-between"><span style="font-weight:bold;font-size:16px">Total Payout</span><span style="font-size:22px;font-weight:bold;color:#16a34a">${amountFormatted}</span></div>
  </div>
  <div style="border-top:2px solid #cbd5e1;padding-top:24px;text-align:center;font-size:11px;color:#64748b">
    <p style="font-weight:600;margin:0 0 8px">Thank you for tutoring on Tunect!</p>
    <p style="margin:0 0 16px">For support, contact us at support@tunectnow.com</p>
    <p style="font-style:italic;color:#94a3b8">This receipt is valid without a signature</p>
  </div>
</div></body></html>`;

    const receiptAttachment: EmailAttachment = {
      filename: `tunect-payout-receipt-${receiptId}.html`,
      contentBase64: Buffer.from(receiptHtml, 'utf-8').toString('base64'),
      contentType: 'text/html',
    };

    // Use critical sendEmail path — financial notification must always fire
    return this.sendEmail(opts.to, `💰 Payout of ${amountFormatted} processed`, html, [receiptAttachment]);
  }

  async sendPayoutFailedEmail(opts: {
    to: string;
    tutorName?: string;
    amount: number;
    currency?: string;
    reason?: string;
    referenceId?: string;
    adminEmails?: string[];
    failureCount?: number;
  }): Promise<void> {
    const baseUrl = process.env.APP_BASE_URL ?? 'https://tunectnow.com';
    const currency = opts.currency ?? 'INR';
    const amountFormatted = opts.amount.toLocaleString('en-IN', { style: 'currency', currency });
    const settingsUrl = `${baseUrl}/tutor/settings`;

    const tutorHtml = emailShell(
      `Your payout of ${amountFormatted} could not be completed.`,
      `<h2 style="margin:0 0 4px;color:#dc2626;font-size:22px">Payout Failed ❌</h2>
      <p style="margin:0 0 20px;color:#64748b">Hi ${opts.tutorName ?? 'there'}, unfortunately your payout could not be processed.</p>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <tr><td style="padding:10px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px 6px 0 0;font-size:13px;color:#991b1b;font-weight:600;width:40%">AMOUNT</td>
            <td style="padding:10px;background:#fef2f2;border:1px solid #fecaca;border-left:none;border-radius:0 6px 0 0;font-size:15px;color:#dc2626;font-weight:700">${amountFormatted}</td></tr>
        ${opts.reason ? `<tr><td style="padding:10px;border:1px solid #e2e8f0;border-top:none;font-size:13px;color:#64748b;font-weight:600">REASON</td>
            <td style="padding:10px;border:1px solid #e2e8f0;border-top:none;border-left:none;font-size:14px;color:#475569">${opts.reason}</td></tr>` : ''}
        ${opts.referenceId ? `<tr><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 0 6px;font-size:13px;color:#64748b;font-weight:600">REFERENCE</td>
            <td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-left:none;border-radius:0 0 6px 0;font-size:13px;color:#94a3b8;font-family:monospace">${opts.referenceId}</td></tr>` : ''}
      </table>

      <p style="margin:0 0 20px;padding:12px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;font-size:13px;color:#991b1b">
        Please review and update your banking/payment details. Contact support@tunectnow.com if you need help resolving this issue.
      </p>

      <a href="${settingsUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">Update Payment Details</a>`,
    );

    await this.sendNotificationEmail(opts.to, `❌ Payout failed — ${amountFormatted}`, tutorHtml);

    // CC admin on repeated failures (≥2)
    if (opts.adminEmails?.length && (opts.failureCount ?? 0) >= 2) {
      const adminHtml = emailShell(
        `Repeat payout failure for ${opts.tutorName ?? 'a tutor'}.`,
        `<h2 style="margin:0 0 4px;color:#dc2626;font-size:22px">Repeat Payout Failure ⚠️</h2>
        <p style="margin:0 0 20px;color:#64748b">Tutor <strong>${opts.tutorName ?? 'Unknown'}</strong> has experienced <strong>${opts.failureCount}</strong> consecutive payout failures. Manual review may be required.</p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
          <tr><td style="padding:10px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px 6px 0 0;font-size:13px;color:#991b1b;font-weight:600;width:40%">AMOUNT</td>
              <td style="padding:10px;background:#fef2f2;border:1px solid #fecaca;border-left:none;border-radius:0 6px 0 0;font-size:15px;color:#dc2626;font-weight:700">${amountFormatted}</td></tr>
          <tr><td style="padding:10px;border:1px solid #e2e8f0;border-top:none;font-size:13px;color:#64748b;font-weight:600">FAILURE COUNT</td>
              <td style="padding:10px;border:1px solid #e2e8f0;border-top:none;border-left:none;font-size:15px;color:#dc2626;font-weight:700">${opts.failureCount}</td></tr>
          ${opts.reason ? `<tr><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 0 6px;font-size:13px;color:#64748b;font-weight:600">REASON</td>
              <td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-left:none;border-radius:0 0 6px 0;font-size:14px;color:#475569">${opts.reason}</td></tr>` : ''}
        </table>
        <a href="${process.env.APP_BASE_URL ?? 'https://tunectnow.com'}/admin/tutors" style="display:inline-block;padding:12px 24px;background:#dc2626;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">Review Tutor in Admin</a>`,
      );
      for (const adminEmail of opts.adminEmails) {
        await this.sendEmail(adminEmail, `⚠️ Repeat payout failure — ${opts.tutorName ?? 'Tutor'}`, adminHtml);
      }
    }
  }

  // ─── Tutor Approval / Rejection ──────────────────────────────────────────

  async sendTutorApprovedEmail(opts: {
    to: string;
    tutorName?: string;
  }): Promise<void> {
    const baseUrl = process.env.APP_BASE_URL ?? 'https://tunectnow.com';
    const availabilityUrl = `${baseUrl}/tutor/availability`;
    const dashboardUrl = `${baseUrl}/tutor/dashboard`;

    const html = emailShell(
      `Congratulations! Your Tunect tutor profile has been approved.`,
      `<h2 style="margin:0 0 4px;color:#1e293b;font-size:22px">Your Profile is Approved! 🎉</h2>
      <p style="margin:0 0 20px;color:#64748b">Hi ${opts.tutorName ?? 'there'}, great news! The Tunect team has reviewed and approved your tutor profile. You can now receive bookings from students.</p>

      <p style="margin:0 0 16px;font-weight:600;color:#1e293b">Your next steps:</p>
      <ol style="margin:0 0 24px;padding-left:24px;color:#475569;font-size:14px;line-height:1.8">
        <li>Set your availability schedule so students can book sessions</li>
        <li>Complete your profile — add subjects, qualifications, and a bio</li>
        <li>Set your hourly rate</li>
        <li>Start receiving bookings!</li>
      </ol>

      <div style="display:flex;gap:12px;flex-wrap:wrap">
        <a href="${availabilityUrl}" style="display:inline-block;padding:12px 24px;background:#16a34a;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">Set Availability</a>
        <a href="${dashboardUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">Go to Dashboard</a>
      </div>`,
    );

    await this.sendNotificationEmail(opts.to, '🎉 Your tutor profile has been approved!', html);
  }

  async sendTutorRejectedEmail(opts: {
    to: string;
    tutorName?: string;
    reason?: string;
    reapplyUrl?: string;
  }): Promise<void> {
    const baseUrl = process.env.APP_BASE_URL ?? 'https://tunectnow.com';
    const profileUrl = opts.reapplyUrl ?? `${baseUrl}/tutor/profile`;
    const reason = opts.reason ?? 'Your profile did not meet our current requirements. Please review the guidelines and resubmit.';

    const html = emailShell(
      `Your Tunect tutor application needs some updates before approval.`,
      `<h2 style="margin:0 0 4px;color:#1e293b;font-size:22px">Profile Update Required 📋</h2>
      <p style="margin:0 0 20px;color:#64748b">Hi ${opts.tutorName ?? 'there'}, thank you for applying to teach on Tunect. After reviewing your profile, we need you to make some updates before we can approve your application.</p>

      <div style="padding:16px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;margin-bottom:24px">
        <p style="margin:0 0 8px;font-weight:600;color:#991b1b">Reason for rejection:</p>
        <p style="margin:0;font-size:14px;color:#7f1d1d">${reason}</p>
      </div>

      <p style="margin:0 0 16px;font-size:14px;color:#475569">Please update your profile accordingly and resubmit for review. Our team will review your updated application promptly.</p>

      <a href="${profileUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">Update Profile &amp; Reapply</a>

      <p style="margin:16px 0 0;font-size:13px;color:#94a3b8">Questions? Contact us at support@tunectnow.com</p>`,
    );

    await this.sendNotificationEmail(opts.to, 'Your Tunect tutor application needs updates', html);
  }

  // ─── Dispute / Report Filed ───────────────────────────────────────────────

  async sendDisputeFiledAdminEmail(opts: {
    adminEmails: string[];
    reporterName?: string;
    reporterRole?: string;
    reportedName?: string;
    bookingId: string;
    sessionDate?: string;
    reason: string;
    description?: string;
    disputeId: string;
  }): Promise<void> {
    const baseUrl = process.env.APP_BASE_URL ?? 'https://tunectnow.com';
    const disputeUrl = `${baseUrl}/admin/disputes/${opts.disputeId}`;

    const html = emailShell(
      `A dispute has been filed by ${opts.reporterName ?? 'a user'} — review required.`,
      `<h2 style="margin:0 0 4px;color:#1e293b;font-size:22px">Dispute Filed ⚠️</h2>
      <p style="margin:0 0 20px;color:#64748b">A user has submitted a dispute report. Please review and take action.</p>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <tr><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px 6px 0 0;font-size:13px;color:#64748b;font-weight:600;width:40%">REPORTED BY</td>
            <td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-left:none;border-radius:0 6px 0 0;font-size:15px;color:#1e293b;font-weight:600">${opts.reporterName ?? '—'} <span style="background:#e2e8f0;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;color:#475569">${opts.reporterRole ?? ''}</span></td></tr>
        <tr><td style="padding:10px;border:1px solid #e2e8f0;border-top:none;font-size:13px;color:#64748b;font-weight:600">REPORTED PARTY</td>
            <td style="padding:10px;border:1px solid #e2e8f0;border-top:none;border-left:none;font-size:15px;color:#1e293b">${opts.reportedName ?? '—'}</td></tr>
        ${opts.sessionDate ? `<tr><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;font-size:13px;color:#64748b;font-weight:600">SESSION DATE</td>
            <td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-left:none;font-size:15px;color:#1e293b">${fmtDate(opts.sessionDate)}</td></tr>` : ''}
        <tr><td style="padding:10px;border:1px solid #e2e8f0;border-top:none;font-size:13px;color:#64748b;font-weight:600">REASON</td>
            <td style="padding:10px;border:1px solid #e2e8f0;border-top:none;border-left:none;font-size:14px;color:#475569;font-weight:600">${opts.reason}</td></tr>
        ${opts.description ? `<tr><td style="padding:10px;background:#fefce8;border:1px solid #fde68a;border-top:none;border-radius:0 0 0 6px;font-size:13px;color:#92400e;font-weight:600">DESCRIPTION</td>
            <td style="padding:10px;background:#fefce8;border:1px solid #fde68a;border-top:none;border-left:none;border-radius:0 0 6px 0;font-size:14px;color:#78350f">${opts.description.slice(0, 500)}${opts.description.length > 500 ? '…' : ''}</td></tr>` : ''}
      </table>

      <a href="${disputeUrl}" style="display:inline-block;padding:12px 24px;background:#dc2626;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">Open Dispute Dashboard</a>`,
    );

    for (const adminEmail of opts.adminEmails) {
      await this.sendEmail(adminEmail, `⚠️ Dispute filed — action required`, html);
    }
  }

  async sendDisputeAcknowledgementEmail(opts: {
    to: string;
    reporterName?: string;
    reason: string;
    bookingId: string;
  }): Promise<void> {
    const html = emailShell(
      'Your dispute report has been received. Our team will review it.',
      `<h2 style="margin:0 0 4px;color:#1e293b;font-size:22px">Dispute Report Received ✅</h2>
      <p style="margin:0 0 20px;color:#64748b">Hi ${opts.reporterName ?? 'there'}, thank you for bringing this to our attention. We have received your dispute report and our team will review it shortly.</p>

      <div style="padding:16px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;margin-bottom:24px">
        <p style="margin:0 0 6px;font-weight:600;color:#1e40af">You reported:</p>
        <p style="margin:0;font-size:14px;color:#1e293b">${opts.reason}</p>
      </div>

      <p style="margin:0;font-size:14px;color:#475569">Our team aims to resolve disputes within <strong>3-5 business days</strong>. You will receive an update via email once a decision has been made.</p>

      <p style="margin:16px 0 0;font-size:13px;color:#94a3b8">Questions? Contact support@tunectnow.com</p>`,
    );

    await this.sendNotificationEmail(opts.to, '✅ Your dispute report has been received', html);
  }

  // ─── Review Received (Tutor) ──────────────────────────────────────────────

  async sendReviewReceivedEmail(opts: {
    to: string;
    tutorName?: string;
    studentName?: string;
    rating: number;
    comment?: string;
    sessionDate?: string;
    profileUrl?: string;
  }): Promise<void> {
    const baseUrl = process.env.APP_BASE_URL ?? 'https://tunectnow.com';
    const profileUrl = opts.profileUrl ?? `${baseUrl}/tutor/profile`;
    const stars = '⭐'.repeat(Math.min(5, Math.max(1, opts.rating)));

    const html = emailShell(
      `${opts.studentName ?? 'A student'} left you a ${opts.rating}-star review.`,
      `<h2 style="margin:0 0 4px;color:#1e293b;font-size:22px">New Review Received ⭐</h2>
      <p style="margin:0 0 20px;color:#64748b">Hi ${opts.tutorName ?? 'there'}, ${opts.studentName ?? 'a student'} has left you a review on Tunect.</p>

      <div style="background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:24px;margin-bottom:24px;text-align:center">
        <div style="font-size:32px;margin-bottom:8px">${stars}</div>
        <div style="font-size:28px;font-weight:800;color:#1e293b">${opts.rating} / 5</div>
        <div style="font-size:13px;color:#78350f;margin-top:4px">from ${opts.studentName ?? 'Student'}</div>
      </div>

      ${opts.comment ? `<div style="padding:16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:24px">
        <p style="margin:0 0 8px;font-size:12px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:.5px">Review</p>
        <p style="margin:0;font-size:15px;color:#1e293b;font-style:italic">"${opts.comment}"</p>
      </div>` : ''}

      ${opts.sessionDate ? `<p style="margin:0 0 20px;font-size:13px;color:#94a3b8">Session date: ${fmtDate(opts.sessionDate)}</p>` : ''}

      <a href="${profileUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">View My Profile</a>`,
    );

    await this.sendNotificationEmail(opts.to, `⭐ New ${opts.rating}-star review from ${opts.studentName ?? 'a student'}`, html);
  }

  // ─── Refund Processed (Student) ──────────────────────────────────────────

  async sendRefundProcessedEmail(opts: {
    to: string;
    studentName?: string;
    tokensRefunded: number;
    originalTutorName?: string;
    refundReason?: string;
    processedAt?: string;
    transactionHistoryUrl?: string;
  }): Promise<void> {
    const baseUrl = process.env.APP_BASE_URL ?? 'https://tunectnow.com';
    const historyUrl = opts.transactionHistoryUrl ?? `${baseUrl}/student/transactions`;

    const html = emailShell(
      `Your refund of ${opts.tokensRefunded} tokens has been processed.`,
      `<h2 style="margin:0 0 4px;color:#1e293b;font-size:22px">Refund Processed ✅</h2>
      <p style="margin:0 0 24px;color:#64748b">Hi ${opts.studentName ?? 'there'}, your refund has been successfully processed.</p>

      <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:24px;margin-bottom:24px;text-align:center">
        <div style="font-size:40px;font-weight:800;color:#16a34a">${opts.tokensRefunded}</div>
        <div style="font-size:14px;color:#166534;font-weight:600">TOKENS REFUNDED</div>
      </div>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        ${opts.originalTutorName ? `<tr><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px 6px 0 0;font-size:13px;color:#64748b;font-weight:600;width:40%">ORIGINAL TUTOR</td>
            <td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-left:none;border-radius:0 6px 0 0;font-size:15px;color:#1e293b">${opts.originalTutorName}</td></tr>` : ''}
        ${opts.refundReason ? `<tr><td style="padding:10px;border:1px solid #e2e8f0;border-top:none;font-size:13px;color:#64748b;font-weight:600">REASON</td>
            <td style="padding:10px;border:1px solid #e2e8f0;border-top:none;border-left:none;font-size:14px;color:#475569">${opts.refundReason}</td></tr>` : ''}
        ${opts.processedAt ? `<tr><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 0 6px;font-size:13px;color:#64748b;font-weight:600">PROCESSED ON</td>
            <td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-left:none;border-radius:0 0 6px 0;font-size:15px;color:#1e293b">${fmtDate(opts.processedAt)}</td></tr>` : ''}
      </table>

      <p style="margin:0 0 20px;font-size:14px;color:#475569">The refunded tokens have been credited to your Tunect wallet. You can use them to book sessions with any tutor.</p>

      <a href="${historyUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">View Transaction History</a>`,
    );

    await this.sendNotificationEmail(opts.to, `✅ Refund of ${opts.tokensRefunded} tokens processed`, html);
  }

  // ─── Monthly Earnings Summary (Tutor) ────────────────────────────────────

  async sendMonthlyEarningsSummaryEmail(opts: {
    to: string;
    tutorName?: string;
    month: string;           // e.g. 'March 2026'
    totalEarnings: number;
    sessionsCompleted: number;
    avgRating?: number;
    topSubjects?: string[];
    prevMonthEarnings?: number;
    currency?: string;
  }): Promise<void> {
    const baseUrl = process.env.APP_BASE_URL ?? 'https://tunectnow.com';
    const currency = opts.currency ?? 'INR';
    const earningsFormatted = opts.totalEarnings.toLocaleString('en-IN', { style: 'currency', currency });

    let changeHtml = '';
    if (opts.prevMonthEarnings !== undefined && opts.prevMonthEarnings > 0) {
      const change = ((opts.totalEarnings - opts.prevMonthEarnings) / opts.prevMonthEarnings * 100);
      const positive = change >= 0;
      changeHtml = `<p style="margin:4px 0 0;font-size:14px;color:${positive ? '#16a34a' : '#dc2626'}">${positive ? '▲' : '▼'} ${Math.abs(change).toFixed(1)}% vs last month</p>`;
    }

    const topSubjectsHtml = opts.topSubjects?.length
      ? `<p style="margin:0 0 8px;font-weight:600;color:#1e293b">Top subjects this month:</p>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:24px">${opts.topSubjects.map(s => `<span style="background:#eff6ff;padding:4px 12px;border-radius:20px;font-size:13px;color:#2563eb;font-weight:600">${s}</span>`).join('')}</div>`
      : '';

    const html = emailShell(
      `Your Tunect earnings summary for ${opts.month}.`,
      `<h2 style="margin:0 0 4px;color:#1e293b;font-size:22px">Monthly Earnings Summary 📊</h2>
      <p style="margin:0 0 24px;color:#64748b">Hi ${opts.tutorName ?? 'there'}, here's your earnings summary for <strong>${opts.month}</strong>.</p>

      <div style="display:flex;gap:16px;margin-bottom:24px;flex-wrap:wrap">
        <div style="flex:1;min-width:140px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;text-align:center">
          <div style="font-size:28px;font-weight:800;color:#16a34a">${earningsFormatted}</div>
          <div style="font-size:12px;color:#166534;font-weight:600;margin-top:4px">TOTAL EARNINGS</div>
          ${changeHtml}
        </div>
        <div style="flex:1;min-width:140px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:20px;text-align:center">
          <div style="font-size:28px;font-weight:800;color:#2563eb">${opts.sessionsCompleted}</div>
          <div style="font-size:12px;color:#1e40af;font-weight:600;margin-top:4px">SESSIONS COMPLETED</div>
        </div>
        ${opts.avgRating !== undefined ? `<div style="flex:1;min-width:140px;background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:20px;text-align:center">
          <div style="font-size:28px;font-weight:800;color:#92400e">${opts.avgRating.toFixed(1)} ⭐</div>
          <div style="font-size:12px;color:#78350f;font-weight:600;margin-top:4px">AVG RATING</div>
        </div>` : ''}
      </div>

      ${topSubjectsHtml}

      <a href="${baseUrl}/tutor/wallet" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">View Full Earnings Report</a>

      <p style="margin:16px 0 0;font-size:13px;color:#94a3b8">To opt out of monthly summary emails, update your notification preferences in your account settings.</p>`,
    );

    await this.sendNotificationEmail(opts.to, `📊 Your ${opts.month} earnings summary`, html);
  }

  // ─── No-Show Alert ────────────────────────────────────────────────────────

  async sendNoShowEmail(opts: {
    to: string;
    recipientName?: string;
    noShowRole: 'STUDENT' | 'TUTOR';   // who didn't show up
    noShowName?: string;
    bookingId: string;
    startIso: string;
    subject?: string;
    adminEmails?: string[];
    isRepeatNoShow?: boolean;
    userId?: string;
  }): Promise<void> {
    const baseUrl = process.env.APP_BASE_URL ?? 'https://tunectnow.com';
    const supportUrl = `${baseUrl}/support`;
    const isRecipientAffected = true; // recipient is the one emailing

    const noShowLabel = opts.noShowRole === 'TUTOR' ? (opts.noShowName ?? 'Your tutor') : (opts.noShowName ?? 'The student');
    const affectedPartyLabel = opts.noShowRole === 'TUTOR' ? 'student' : 'tutor';

    const html = emailShell(
      `${noShowLabel} did not join your session. Here's what to do next.`,
      `<h2 style="margin:0 0 4px;color:#1e293b;font-size:22px">Session No-Show Detected ⚠️</h2>
      <p style="margin:0 0 20px;color:#64748b">Hi ${opts.recipientName ?? 'there'}, <strong>${noShowLabel}</strong> did not join the session within 10 minutes of the start time.</p>

      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <tr><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px 6px 0 0;font-size:13px;color:#64748b;font-weight:600;width:40%">WHO DIDN'T SHOW</td>
            <td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-left:none;border-radius:0 6px 0 0;font-size:15px;color:#dc2626;font-weight:600">${noShowLabel} (${opts.noShowRole})</td></tr>
        <tr><td style="padding:10px;border:1px solid #e2e8f0;border-top:none;font-size:13px;color:#64748b;font-weight:600">SESSION STARTED AT</td>
            <td style="padding:10px;border:1px solid #e2e8f0;border-top:none;border-left:none;font-size:15px;color:#1e293b">${fmtDate(opts.startIso)}</td></tr>
        ${opts.subject ? `<tr><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 0 6px;font-size:13px;color:#64748b;font-weight:600">SUBJECT</td>
            <td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-top:none;border-left:none;border-radius:0 0 6px 0;font-size:15px;color:#1e293b">${opts.subject}</td></tr>` : ''}
      </table>

      <p style="margin:0 0 16px;font-size:14px;color:#475569">If you were affected by this no-show, you can:</p>
      <ul style="margin:0 0 24px;padding-left:24px;color:#475569;font-size:14px;line-height:1.8">
        <li>Report the incident to our support team</li>
        ${opts.noShowRole === 'TUTOR' ? '<li>Request a token refund via support</li>' : ''}
        <li>Contact the other party directly through Tunect messaging</li>
      </ul>

      <a href="${supportUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">Report This No-Show</a>`,
    );

    await this.sendNotificationEmail(opts.to, `⚠️ No-show detected — ${noShowLabel} didn't join`, html);

    // Notify admin of repeated no-shows
    if (opts.adminEmails?.length && opts.isRepeatNoShow) {
      const adminHtml = emailShell(
        `Repeat no-show alert for ${noShowLabel}.`,
        `<h2 style="margin:0 0 4px;color:#dc2626;font-size:22px">Repeat No-Show Alert ⚠️</h2>
        <p style="margin:0 0 20px;color:#64748b"><strong>${noShowLabel}</strong> (${opts.noShowRole}) has repeated no-show incidents. Consider reviewing their account.</p>
        <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
          <tr><td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px 6px 0 0;font-size:13px;color:#64748b;font-weight:600;width:40%">USER</td>
              <td style="padding:10px;background:#f8fafc;border:1px solid #e2e8f0;border-left:none;border-radius:0 6px 0 0;font-size:15px;color:#dc2626;font-weight:600">${noShowLabel}</td></tr>
          <tr><td style="padding:10px;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 0 6px;font-size:13px;color:#64748b;font-weight:600">ROLE</td>
              <td style="padding:10px;border:1px solid #e2e8f0;border-top:none;border-left:none;border-radius:0 0 6px 0;font-size:15px;color:#1e293b">${opts.noShowRole}</td></tr>
        </table>
        <a href="${process.env.APP_BASE_URL ?? 'https://tunectnow.com'}/admin" style="display:inline-block;padding:12px 24px;background:#dc2626;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">Review in Admin</a>`,
      );
      for (const adminEmail of opts.adminEmails) {
        await this.sendEmail(adminEmail, `⚠️ Repeat no-show — ${noShowLabel}`, adminHtml);
      }
    }
  }

  // ─── Promotional Email (opt-in only) ─────────────────────────────────────

  async sendPromoEmail(opts: {
    to: string;
    recipientName?: string;
    subject: string;
    headline: string;
    body: string;
    ctaLabel?: string;
    ctaUrl?: string;
    unsubscribeToken: string;
  }): Promise<void> {
    const baseUrl = process.env.APP_BASE_URL ?? 'https://tunectnow.com';
    const unsubscribeUrl = `${baseUrl}/unsubscribe?token=${opts.unsubscribeToken}`;

    const html = emailShell(
      opts.headline,
      `<h2 style="margin:0 0 4px;color:#1e293b;font-size:22px">${opts.headline}</h2>
      <p style="margin:0 0 20px;color:#64748b">Hi ${opts.recipientName ?? 'there'},</p>
      <div style="font-size:15px;color:#475569;line-height:1.7;margin-bottom:24px">${opts.body}</div>
      ${opts.ctaUrl && opts.ctaLabel ? `<a href="${opts.ctaUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">${opts.ctaLabel}</a>` : ''}
      <p style="margin:24px 0 0;font-size:12px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:16px">
        You're receiving this because you opted in to promotional emails from Tunect.<br>
        <a href="${unsubscribeUrl}" style="color:#94a3b8">Unsubscribe</a> at any time.
      </p>`,
    );

    await this.sendNotificationEmail(opts.to, opts.subject, html);
  }

  // ─── Tutor Availability Alert (Favourite Tutor) ──────────────────────────

  async sendTutorFavoriteAvailabilityAlertEmail(opts: {
    to: string;
    studentName?: string;
    tutorName?: string;
    tutorId: string;
    newSlotDates: string[];
  }): Promise<void> {
    const baseUrl = process.env.APP_BASE_URL ?? 'https://tunectnow.com';
    const bookingUrl = `${baseUrl}/tutor/${opts.tutorId}`;

    const slotList = opts.newSlotDates.slice(0, 5).map(d =>
      `<li style="padding:4px 0;font-size:14px;color:#1e293b">${fmtDate(d)}</li>`
    ).join('');

    const html = emailShell(
      `${opts.tutorName ?? 'A tutor you follow'} has new availability — book now!`,
      `<h2 style="margin:0 0 4px;color:#1e293b;font-size:22px">New Availability from ${opts.tutorName ?? 'Your Favourite Tutor'} 📅</h2>
      <p style="margin:0 0 20px;color:#64748b">Hi ${opts.studentName ?? 'there'}, <strong>${opts.tutorName ?? 'a tutor you have favourited'}</strong> has just opened new availability slots.</p>

      ${slotList ? `<p style="margin:0 0 8px;font-weight:600;color:#1e293b">Available dates:</p>
      <ul style="margin:0 0 24px;padding-left:24px">${slotList}${opts.newSlotDates.length > 5 ? `<li style="padding:4px 0;font-size:14px;color:#94a3b8">+${opts.newSlotDates.length - 5} more…</li>` : ''}</ul>` : ''}

      <a href="${bookingUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">Book a Session Now</a>

      <p style="margin:16px 0 0;font-size:13px;color:#94a3b8">You received this because you marked ${opts.tutorName ?? 'this tutor'} as a favourite. Manage your alert preferences in your account settings.</p>`,
    );

    await this.sendNotificationEmail(opts.to, `📅 ${opts.tutorName ?? 'Your favourite tutor'} has new availability!`, html);
  }

  // ─── Platform Revenue Summary (Admin) ────────────────────────────────────

  async sendAdminRevenueReportEmail(opts: {
    adminEmails: string[];
    periodLabel: string;       // e.g. 'Week of 14 Apr 2026' or 'March 2026'
    totalRevenueInMinor: number;
    totalSessions: number;
    newUsers: number;
    activeTutors: number;
    prevPeriodRevenueInMinor?: number;
    currency?: string;
  }): Promise<void> {
    const currency = opts.currency ?? 'INR';
    const revenueFormatted = (opts.totalRevenueInMinor / 100).toLocaleString('en-IN', { style: 'currency', currency });
    const baseUrl = process.env.APP_BASE_URL ?? 'https://tunectnow.com';

    let changeHtml = '';
    if (opts.prevPeriodRevenueInMinor !== undefined && opts.prevPeriodRevenueInMinor > 0) {
      const change = ((opts.totalRevenueInMinor - opts.prevPeriodRevenueInMinor) / opts.prevPeriodRevenueInMinor * 100);
      const positive = change >= 0;
      changeHtml = `<p style="margin:4px 0 0;font-size:14px;color:${positive ? '#16a34a' : '#dc2626'}">${positive ? '▲' : '▼'} ${Math.abs(change).toFixed(1)}% vs previous period</p>`;
    }

    const html = emailShell(
      `Platform revenue report: ${opts.periodLabel}`,
      `<h2 style="margin:0 0 4px;color:#1e293b;font-size:22px">Platform Revenue Report 📈</h2>
      <p style="margin:0 0 24px;color:#64748b">Summary for <strong>${opts.periodLabel}</strong></p>

      <div style="display:flex;gap:16px;margin-bottom:24px;flex-wrap:wrap">
        <div style="flex:1;min-width:120px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:20px;text-align:center">
          <div style="font-size:22px;font-weight:800;color:#16a34a">${revenueFormatted}</div>
          <div style="font-size:11px;color:#166534;font-weight:600;margin-top:4px">TOTAL REVENUE</div>
          ${changeHtml}
        </div>
        <div style="flex:1;min-width:100px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:20px;text-align:center">
          <div style="font-size:22px;font-weight:800;color:#2563eb">${opts.totalSessions}</div>
          <div style="font-size:11px;color:#1e40af;font-weight:600;margin-top:4px">SESSIONS</div>
        </div>
        <div style="flex:1;min-width:100px;background:#fefce8;border:1px solid #fde68a;border-radius:8px;padding:20px;text-align:center">
          <div style="font-size:22px;font-weight:800;color:#92400e">${opts.newUsers}</div>
          <div style="font-size:11px;color:#78350f;font-weight:600;margin-top:4px">NEW USERS</div>
        </div>
        <div style="flex:1;min-width:100px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:8px;padding:20px;text-align:center">
          <div style="font-size:22px;font-weight:800;color:#0369a1">${opts.activeTutors}</div>
          <div style="font-size:11px;color:#075985;font-weight:600;margin-top:4px">ACTIVE TUTORS</div>
        </div>
      </div>

      <a href="${baseUrl}/admin/finance" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">Open Finance Dashboard</a>`,
    );

    for (const adminEmail of opts.adminEmails) {
      await this.sendEmail(adminEmail, `📈 Revenue report — ${opts.periodLabel}`, html);
    }
  }

  // ─── Profile Incomplete Nudge (Student) ──────────────────────────────────

  async sendProfileIncompleteNudgeEmail(opts: {
    to: string;
    studentName?: string;
    completionPercentage: number;
    missingFields: string[];
  }): Promise<void> {
    const baseUrl = process.env.APP_BASE_URL ?? 'https://tunectnow.com';
    const profileUrl = `${baseUrl}/student/profile`;

    const missingFieldsList = opts.missingFields.slice(0, 6).map(f =>
      `<li style="padding:4px 0;font-size:14px;color:#475569">${f}</li>`
    ).join('');

    const html = emailShell(
      `Your Tunect profile is ${opts.completionPercentage}% complete. Finish it to find better tutors!`,
      `<h2 style="margin:0 0 4px;color:#1e293b;font-size:22px">Your Profile Needs Your Attention 📋</h2>
      <p style="margin:0 0 20px;color:#64748b">Hi ${opts.studentName ?? 'there'}, your Tunect profile is only <strong>${opts.completionPercentage}% complete</strong>. A complete profile helps you get better tutor matches!</p>

      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:16px;margin-bottom:24px">
        <div style="display:flex;align-items:center;gap:12px">
          <div style="flex:1;background:#e2e8f0;height:12px;border-radius:6px;overflow:hidden">
            <div style="width:${opts.completionPercentage}%;background:#2563eb;height:100%;border-radius:6px"></div>
          </div>
          <span style="font-size:16px;font-weight:800;color:#2563eb;white-space:nowrap">${opts.completionPercentage}%</span>
        </div>
      </div>

      ${opts.missingFields.length > 0 ? `<p style="margin:0 0 8px;font-weight:600;color:#1e293b">Missing information:</p>
      <ul style="margin:0 0 24px;padding-left:24px">${missingFieldsList}</ul>` : ''}

      <a href="${profileUrl}" style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:15px">Complete My Profile</a>

      <p style="margin:16px 0 0;font-size:13px;color:#94a3b8">This is a one-time reminder. We won't send this again once you've completed your profile or booked a session.</p>`,
    );

    await this.sendNotificationEmail(opts.to, `📋 Complete your Tunect profile (${opts.completionPercentage}% done)`, html);
  }
}
