/// <reference types="jest" />

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { io, Socket } from 'socket.io-client';
import { AppModule } from '../src/app.module';
import { WebrtcModule } from '../src/webrtc/webrtc.module';

// NOTE: This is a lightweight happy-path mediasoup signaling test. It assumes the
// server is configured with MEDIASOUP_ENABLED=true and listens on localhost.
// It does not spin real RTP; it verifies signaling flow: join, transport create,
// connect, produce/consume messages.
const shouldRun =
  process.env.MEDIASOUP_ENABLED === 'true' &&
  !!process.env.TEST_TUTOR_JWT &&
  !!process.env.TEST_STUDENT_JWT &&
  !!process.env.TEST_BOOKING_ID;

const describeMaybe = shouldRun ? describe : describe.skip;

jest.setTimeout(60_000);

describeMaybe('WebRTC/Mediasoup happy path', () => {
  let app: INestApplication;
  let serverUrl: string;

  const connectSocket = (token: string): Socket =>
    io(`${serverUrl}/webrtc`, {
      auth: { token },
      transports: ['websocket'],
      forceNew: true,
    });

  const onceWithTimeout = <T = any>(s: Socket, event: string, timeoutMs = 10_000) =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), timeoutMs);
      s.once(event, (d: T) => {
        clearTimeout(timer);
        resolve(d);
      });
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, WebrtcModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    const server = await app.listen(0);
    const address = (server as any).address();
    const port = typeof address === 'string' ? 80 : address.port;
    serverUrl = `http://localhost:${port}`;
  }, 60_000);

  afterAll(async () => {
    try {
      await app?.close();
    } catch {
      // ignore
    }
  });

  const disconnectSocket = (s: Socket) =>
    new Promise<void>((resolve) => {
      if (!s.connected) return resolve();
      s.once('disconnect', () => resolve());
      s.disconnect();
    });

  it(
    'connects, joins, and negotiates mediasoup transports',
    async () => {
      const tutorToken = process.env.TEST_TUTOR_JWT as string;
      const studentToken = process.env.TEST_STUDENT_JWT as string;
      const bookingId = process.env.TEST_BOOKING_ID as string;

      const tutor = connectSocket(tutorToken);
      const student = connectSocket(studentToken);

      try {
        tutor.emit('join-booking', { bookingId });
        student.emit('join-booking', { bookingId });

        await onceWithTimeout(tutor, 'joined');
        await onceWithTimeout(student, 'joined');

        tutor.emit('mediasoup/create-transport', { bookingId, direction: 'send' });
        const { transport: tutorSend } = await onceWithTimeout<any>(tutor, 'mediasoup/transport-created');

        tutor.emit('mediasoup/connect-transport', {
          bookingId,
          transportId: tutorSend.id,
          dtlsParameters: { role: 'server' },
        });
        await onceWithTimeout(tutor, 'mediasoup/transport-connected');

        tutor.emit('mediasoup/produce', {
          bookingId,
          transportId: tutorSend.id,
          kind: 'audio',
          rtpParameters: { codecs: [], encodings: [] },
        });
        const { producerId } = await onceWithTimeout<any>(tutor, 'mediasoup/produced');

        student.emit('mediasoup/create-transport', { bookingId, direction: 'recv' });
        const { transport: studentRecv } = await onceWithTimeout<any>(student, 'mediasoup/transport-created');
        student.emit('mediasoup/consume', {
          bookingId,
          transportId: studentRecv.id,
          producerId,
          rtpCapabilities: { codecs: [], headerExtensions: [] },
        });
        await onceWithTimeout(student, 'mediasoup/consumed');
      } finally {
        await Promise.all([disconnectSocket(tutor), disconnectSocket(student)]);
      }
    },
    60_000,
  );
});
