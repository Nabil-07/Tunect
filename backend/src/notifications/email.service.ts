import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter;

  constructor() {
    // Configure email transporter
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: false, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
    });
  }

  async sendSlotAvailableEmail(
    to: string,
    tutorName: string,
    studentName: string,
  ): Promise<void> {
    try {
      const info = await this.transporter.sendMail({
        from: process.env.SMTP_FROM || '"Tunect" <noreply@tunect.com>',
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
    try {
      const info = await this.transporter.sendMail({
        from: process.env.SMTP_FROM || '"Tunect" <noreply@tunect.com>',
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

      this.logger.log(`Waitlist email sent to ${to}: ${info.messageId}`);
    } catch (error) {
      this.logger.error(`Failed to send waitlist email to ${to}:`, error);
    }
  }
}
