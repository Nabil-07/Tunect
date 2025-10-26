import { registerAs } from '@nestjs/config';

export default registerAs('razorpay', () => ({
  keyId: process.env.RZP_KEY_ID ?? '',
  keySecret: process.env.RZP_KEY_SECRET ?? '',
}));
