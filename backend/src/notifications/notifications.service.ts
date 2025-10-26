// src/notifications/notifications.service.ts
import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';

type BookingConfirmationPayload = {
  studentEmail: string;
  tutorEmail?: string;
  bookingId: string;
  startIso: string;
  endIso: string;
  notes?: string | null;
};

type BookingReminderPayload = {
  to: string;
  bookingId: string;
  startIso: string;
  endIso: string;
  minutesBefore: number;
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly enabled: boolean;
  private readonly transporter?: Transporter;

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

  constructor() {
    // ---------- EMAIL ----------
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT ?? 587);
    const secure =
      (process.env.SMTP_SECURE ?? '').toLowerCase() === 'true' || port === 465;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    this.enabled = Boolean(host && port && user && pass);

    if (!this.enabled) {
      this.logger.warn(
        'SMTP not fully configured. Emails will be skipped (set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS).',
      );
    } else {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
      });

      this.transporter
        .verify()
        .then(() => this.logger.log('SMTP transporter verified.'))
        .catch((e: unknown) => {
          const msg = e instanceof Error ? e.message : String(e);
          this.logger.warn(`SMTP verify failed (continuing): ${msg}`);
        });
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
      } catch (e) {
        this.smsEnabled = false as any;
        this.logger.warn('Twilio module not installed; SMS disabled.');
      }
    } else {
      this.logger.warn('Twilio not fully configured. SMS will be skipped.');
    }
  }

  /**
   * Low-level email sender.
   * Returns true on success, false on failure or if email is disabled.
   */
  async sendEmail(to: string, subject: string, html: string): Promise<boolean> {
    if (!this.enabled || !this.transporter) {
      this.logger.debug(
        `Email skipped (disabled): to=${to} | subject="${subject}"`,
      );
      return false;
    }

    const from = this.fromAddress();

    try {
      await this.transporter.sendMail({ from, to, subject, html });
      this.logger.log(`Email sent → ${to} | ${subject}`);
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.stack || e.message : String(e);
      this.logger.error(`Email failed → ${to} | ${subject}`, msg as any);
      return false;
    }
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
   * Send booking confirmation to student (and tutor if provided).
   */
  async bookingConfirmation(payload: BookingConfirmationPayload): Promise<void> {
    const subject = `Your lesson is confirmed (Booking #${payload.bookingId.slice(
      0,
      8,
    )})`;
    const bookingUrl = `${process.env.APP_BASE_URL ?? ''}/bookings/${
      payload.bookingId
    }`;

    const html = `
      <div style="font-family:system-ui,Segoe UI,Roboto,Arial">
        <h2>Booking Confirmed</h2>
        <p><strong>Start:</strong> ${payload.startIso}</p>
        <p><strong>End:</strong> ${payload.endIso}</p>
        ${payload.notes ? `<p><strong>Notes:</strong> ${payload.notes}</p>` : ''}
        <p><a href="${bookingUrl}">View booking</a></p>
      </div>
    `;

    await this.sendEmail(payload.studentEmail, subject, html);

    if (payload.tutorEmail) {
      const tSub = `New lesson booked (Booking #${payload.bookingId.slice(
        0,
        8,
      )})`;
      const tutorHtml = html.replace(
        '<h2>Booking Confirmed</h2>',
        '<h2>New Booking</h2>',
      );
      await this.sendEmail(payload.tutorEmail, tSub, tutorHtml);
    }
  }

  /**
   * Send a reminder N minutes before the lesson.
   */
  async bookingReminder(payload: BookingReminderPayload): Promise<void> {
    const subject = `Reminder: your lesson starts in ${payload.minutesBefore} min`;
    const bookingUrl = `${process.env.APP_BASE_URL ?? ''}/bookings/${
      payload.bookingId
    }`;

    const html = `
      <div style="font-family:system-ui,Segoe UI,Roboto,Arial">
        <h2>Upcoming Lesson</h2>
        <p>Starts in <strong>${payload.minutesBefore} minutes</strong>.</p>
        <p><strong>Start:</strong> ${payload.startIso}</p>
        <p><strong>End:</strong> ${payload.endIso}</p>
        <p><a href="${bookingUrl}">Open booking</a></p>
      </div>
    `;

    await this.sendEmail(payload.to, subject, html);
  }
}
