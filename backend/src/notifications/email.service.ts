import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor() {
    // Configure email transporter
    const host = process.env.SMTP_HOST;
    const port = parseInt(process.env.SMTP_PORT || '587');
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASSWORD;

    if (!host || !user || !pass) {
      this.logger.warn(
        'SMTP not fully configured in EmailService. Emails will be skipped. ' +
        `Missing: ${!host ? 'SMTP_HOST ' : ''}${!user ? 'SMTP_USER ' : ''}${!pass ? 'SMTP_PASSWORD' : ''}`
      );
    }

    this.transporter = nodemailer.createTransport({
      host: host || 'smtp.gmail.com',
      port,
      secure: false, // true for 465, false for other ports
      auth: {
        user,
        pass,
      },
    });

    // Verify connection
    if (host && user && pass) {
      this.transporter.verify()
        .then(() => {
          this.logger.log('[EmailService] SMTP transporter verified successfully.');
        })
        .catch((error) => {
          this.logger.error('[EmailService] SMTP verification failed:', error);
        });
    }
  }

  async sendSlotAvailableEmail(
    to: string,
    tutorName: string,
    studentName: string,
  ): Promise<void> {
    try {
      const info = await this.transporter.sendMail({
        from: process.env.SMTP_FROM || '"Tunect" <no-reply@tunectnow.com>',
        to,
        subject: `🎓 New Slots Available with ${tutorName}!`,
        html: `
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
      });

      this.logger.log(`Email sent to ${to}: ${info.messageId}`);
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
      const info = await this.transporter.sendMail({
        from: process.env.SMTP_FROM || '"Tunect" <no-reply@tunectnow.com>',
        to,
        subject: `⏰ You've been added to ${tutorName}'s waitlist`,
        html: `
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
      });

      this.logger.log(`[EmailService] ✅ Waitlist email sent to ${to}: ${info.messageId}`);
    } catch (error) {
      this.logger.error(`[EmailService] ❌ Failed to send waitlist email to ${to}:`, error);
    }
  }
}
