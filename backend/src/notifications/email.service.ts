import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { GraphEmailSender } from './graph-email.sender';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter?: nodemailer.Transporter;
  private readonly graph?: GraphEmailSender;
  private readonly smtpEnabled: boolean;

  constructor() {
    this.graph = GraphEmailSender.fromEnv(this.logger) ?? undefined;

    // Configure email transporter (optional fallback)
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587');
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASSWORD;

    this.smtpEnabled = Boolean(host && user && pass);

    if (!this.graph && !this.smtpEnabled) {
      this.logger.warn(
        'SMTP not fully configured in EmailService. Emails will be skipped. ' +
        `Missing: ${!host ? 'SMTP_HOST ' : ''}${!user ? 'SMTP_USER ' : ''}${!pass ? 'SMTP_PASSWORD' : ''}`
      );
    }

    if (this.smtpEnabled) {
      this.transporter = nodemailer.createTransport({
        host: host!,
        port,
        secure: false,
        auth: {
          user,
          pass,
        },
      });

      // Verify connection
      this.transporter
        .verify()
        .then(() => {
          this.logger.log('[EmailService] SMTP transporter verified successfully.');
        })
        .catch((error: unknown) => {
          this.logger.error('[EmailService] SMTP verification failed:', error);
        });
    }
  }

  private async sendEmail(to: string, subject: string, html: string): Promise<void> {
    if ((process.env.DISABLE_NOTIFICATION_EMAILS ?? '').toLowerCase() === 'true') {
      this.logger.debug(
        `[EmailService] Email skipped (DISABLE_NOTIFICATION_EMAILS=true): to=${to} | subject="${subject}"`,
      );
      return;
    }

    const from = process.env.SMTP_FROM || '"Tunect" <no-reply@tunectnow.com>';

    // 1) Prefer Graph (works with Security Defaults)
    if (this.graph) {
      try {
        await this.graph.sendHtmlEmail(to, subject, html);
        this.logger.log(`[EmailService] Graph email sent → ${to} | ${subject}`);
        return;
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        this.logger.warn(`[EmailService] Graph email failed (fallback to SMTP if available): ${msg}`);
      }
    }

    // 2) Fallback to SMTP
    if (this.smtpEnabled && this.transporter) {
      const info = await this.transporter.sendMail({
        from,
        to,
        subject,
        html,
      });
      this.logger.log(`[EmailService] SMTP email sent → ${to}: ${info.messageId}`);
      return;
    }

    this.logger.warn(`[EmailService] Email skipped (no Graph/SMTP configured): to=${to} | subject="${subject}"`);
  }

  async sendSlotAvailableEmail(
    to: string,
    tutorName: string,
    studentName: string,
  ): Promise<void> {
    try {
      await this.sendEmail(
        to,
        `🎓 New Slots Available with ${tutorName}!`,
        `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #0ea5e9;">Hi ${studentName}! 🎉</h2>
            <p style="font-size: 16px; line-height: 1.6;">
              Great news! <strong>${tutorName}</strong> has added new availability slots.
            </p>
            <p style="font-size: 16px; line-height: 1.6;">
              You have tokens available for this tutor. Schedule your class now before slots fill up!
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.APP_URL || 'http://localhost:5173'}/student/bookings" 
                 style="background-color: #0ea5e9; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: bold;">
                Schedule Now
              </a>
            </div>
            <p style="color: #64748b; font-size: 14px;">
              Best regards,<br>
              The Tunect Team
            </p>
          </div>
        `,
      );
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}:`, error);
      // Don't throw - email is not critical
    }
  }

  async sendWaitlistNotificationEmail(
    to: string,
    tutorName: string,
    studentName: string,
  ): Promise<void> {
    this.logger.log(`[EmailService] Attempting to send waitlist email to ${to}`);
    
    try {
      await this.sendEmail(
        to,
        `⏰ You've been added to ${tutorName}'s waitlist`,
        `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #0ea5e9;">Hi ${studentName}!</h2>
            <p style="font-size: 16px; line-height: 1.6;">
              You've been added to <strong>${tutorName}</strong>'s waitlist.
            </p>
            <p style="font-size: 16px; line-height: 1.6;">
              We'll notify you as soon as new slots become available!
            </p>
            <p style="color: #64748b; font-size: 14px;">
              Best regards,<br>
              The Tunect Team
            </p>
          </div>
        `,
      );

      this.logger.log(`[EmailService] ✅ Waitlist email sent to ${to}`);
    } catch (error) {
      this.logger.error(`[EmailService] ❌ Failed to send waitlist email to ${to}:`, error);
    }
  }
}
