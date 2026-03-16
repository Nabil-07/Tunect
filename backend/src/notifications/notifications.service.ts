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

    // Build ICS calendar attachment
    const icsContent = generateIcs({
      bookingId: payload.bookingId,
      summary: `${sessionType} with ${tutorDisplay}${subjectLine}`,
      description: `Join your Tunect session: ${bookingUrl}${payload.notes ? `\n\nNotes: ${payload.notes}` : ''}`,
      startIso: payload.startIso,
      endIso: payload.endIso,
      organizerEmail: 'no-reply@tunectnow.com',
      attendeeEmails: [payload.studentEmail, ...(payload.tutorEmail ? [payload.tutorEmail] : [])],
    });
    const icsAttachment: EmailAttachment = {
      filename: 'tunect-session.ics',
      contentBase64: Buffer.from(icsContent).toString('base64'),
      contentType: 'text/calendar; method=REQUEST',
    };

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

    await this.sendNotificationEmail(payload.studentEmail, studentSubject, studentBody, [icsAttachment]);

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

      await this.sendNotificationEmail(payload.tutorEmail, tutorSubject, tutorBody, [icsAttachment]);
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
    const baseUrl = process.env.FRONTEND_URL || process.env.APP_BASE_URL || 'https://tunectnow.com';
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
    const baseUrl = process.env.FRONTEND_URL || process.env.APP_BASE_URL || 'https://tunectnow.com';
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
    const baseUrl = process.env.FRONTEND_URL || process.env.APP_BASE_URL || 'https://tunectnow.com';
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
}
