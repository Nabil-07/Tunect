import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class NotifierService {
  private readonly logger = new Logger(NotifierService.name);

  // TODO: replace with real email/SMS/WhatsApp integrations
  async sendBookingReminder(opts: {
    to: string; // email or phone
    role: 'STUDENT' | 'TUTOR';
    bookingId: string;
    startLocalISO: string;
  }) {
    this.logger.log(`(stub) Reminder -> ${opts.role} ${opts.to} | booking=${opts.bookingId} | start=${opts.startLocalISO}`);
  }
}
