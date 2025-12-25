import { Injectable, Logger } from '@nestjs/common';
import { google } from 'googleapis';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GoogleMeetService {
  private readonly logger = new Logger(GoogleMeetService.name);
  private calendar;

  constructor(private prisma: PrismaService) {
    // Initialize Google Calendar API
    const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

    if (serviceAccountKey) {
      try {
        const credentials = JSON.parse(serviceAccountKey);
        const auth = new google.auth.GoogleAuth({
          credentials,
          scopes: ['https://www.googleapis.com/auth/calendar'],
        });

        this.calendar = google.calendar({ version: 'v3', auth });
        this.logger.log('Google Calendar API initialized successfully');
      } catch (error) {
        this.logger.error('Failed to initialize Google Calendar API:', error);
      }
    } else {
      this.logger.warn('GOOGLE_SERVICE_ACCOUNT_KEY not set - Google Meet integration disabled');
    }
  }

  /**
   * Create a Google Meet link for a booking
   */
  async createMeetingForBooking(
    bookingId: string,
    tutorEmail: string,
    studentEmail: string,
    startTime: Date,
    endTime: Date,
    subject: string,
  ): Promise<string | null> {
    if (!this.calendar) {
      this.logger.warn('Google Calendar not initialized - returning placeholder link');
      return this.generatePlaceholderLink(bookingId);
    }

    try {
      const event = {
        summary: `Tunect Session: ${subject}`,
        description: `Tutoring session between tutor (${tutorEmail}) and student (${studentEmail})`,
        start: {
          dateTime: startTime.toISOString(),
          timeZone: 'UTC',
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone: 'UTC',
        },
        attendees: [{ email: tutorEmail }, { email: studentEmail }],
        conferenceData: {
          createRequest: {
            requestId: bookingId,
            conferenceSolutionKey: {
              type: 'hangoutsMeet',
            },
          },
        },
      };

      const response = await this.calendar.events.insert({
        calendarId: 'primary',
        conferenceDataVersion: 1,
        requestBody: event,
      });

      const meetLink = response.data.conferenceData?.entryPoints?.find(
        (ep) => ep.entryPointType === 'video',
      )?.uri;

      if (meetLink) {
        this.logger.log(`Created Google Meet link for booking ${bookingId}: ${meetLink}`);
        return meetLink;
      }

      this.logger.warn(`No Meet link in response for booking ${bookingId}`);
      return this.generatePlaceholderLink(bookingId);
    } catch (error) {
      this.logger.error(`Failed to create Google Meet for booking ${bookingId}:`, error);
      return this.generatePlaceholderLink(bookingId);
    }
  }

  /**
   * Generate a placeholder meeting link (for development or when Google Meet is unavailable)
   */
  private generatePlaceholderLink(bookingId: string): string {
    // You could integrate with Zoom, Jitsi, or another provider here
    return `https://meet.google.com/placeholder-${bookingId.substring(0, 10)}`;
  }

  /**
   * Update booking with meeting link
   */
  async updateBookingWithMeetingLink(bookingId: string, meetingUrl: string) {
    return this.prisma.booking.update({
      where: { id: bookingId },
      data: {
        meetingUrl,
        meetingProvider: 'google_meet',
      },
    });
  }

  /**
   * Create meeting link and update booking in one operation
   */
  async createAndAttachMeeting(
    bookingId: string,
    tutorEmail: string,
    studentEmail: string,
    startTime: Date,
    endTime: Date,
    subject: string,
  ) {
    const meetingUrl = await this.createMeetingForBooking(
      bookingId,
      tutorEmail,
      studentEmail,
      startTime,
      endTime,
      subject,
    );

    if (meetingUrl) {
      await this.updateBookingWithMeetingLink(bookingId, meetingUrl);
      return meetingUrl;
    }

    return null;
  }

  /**
   * Delete/cancel a Google Meet (optional - for when bookings are canceled)
   */
  async deleteMeeting(eventId: string) {
    if (!this.calendar) {
      return;
    }

    try {
      await this.calendar.events.delete({
        calendarId: 'primary',
        eventId,
      });
      this.logger.log(`Deleted Google Meet event ${eventId}`);
    } catch (error) {
      this.logger.error(`Failed to delete Google Meet event ${eventId}:`, error);
    }
  }
}
