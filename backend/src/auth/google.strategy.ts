import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Strategy, Profile, VerifyCallback } from 'passport-google-oauth20';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private readonly config: ConfigService) {
    super({
      clientID: config.get<string>('GOOGLE_CLIENT_ID')!,
      clientSecret: config.get<string>('GOOGLE_CLIENT_SECRET')!,
      callbackURL: new URL(
        config.get('AUTH_GOOGLE_CALLBACK_PATH') || '/auth/google/callback',
        config.get('APP_URL') || 'http://localhost:3000',
      ).toString(),
      scope: ['profile', 'email'],
      passReqToCallback: false,
      // ❌ state removed to avoid session requirement
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ) {
    const { id, displayName, name, emails, photos } = profile;
    const payload = {
      provider: 'google' as const,
      providerUserId: id,
      email: emails?.[0]?.value,
      name: displayName || `${name?.givenName ?? ''} ${name?.familyName ?? ''}`.trim(),
      avatarUrl: photos?.[0]?.value,
      emailVerified: true,
    };
    return done(null, payload);
  }
}
