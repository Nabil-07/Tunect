// src/common/interceptors/encrypt-response.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { EncryptionService } from '../services/encryption.service';
import { ConfigService } from '@nestjs/config';
import { isPreprodAllowedEmail } from '../../auth/preprod-allowlist';

/**
 * Response Interceptor to encrypt sensitive PII fields
 * 
 * Automatically encrypts sensitive fields in API responses based on:
 * 1. User role (only encrypts for non-admin users)
 * 2. Field configuration (encryptableFields list)
 * 3. Encryption enabled flag
 * 
 * Fields encrypted:
 * - email
 * - phone
 * - address (if exists)
 * - user.email
 * - user.phone
 * - tutor.user.email
 * - student.user.email
 * - etc.
 */
@Injectable()
export class EncryptResponseInterceptor implements NestInterceptor {
  private readonly logger = new Logger(EncryptResponseInterceptor.name);
  
  // Fields that should be encrypted (supports nested paths)
  // Note: Names are NOT encrypted - only email and phone are encrypted
  private readonly encryptableFields = [
    'email',
    'phone',
    'address',
    'avatarUrl',
    'avatar',
    // Never encrypt JWTs — clients must send them verbatim in Authorization / refresh body.
    'user.email',
    'user.phone',
    'user.avatarUrl',
    'user.avatar',
    'tutor.user.email',
    'tutor.user.phone',
    'tutor.user.avatarUrl',
    'tutor.email', // Flattened structure (e.g., booking details)
    'tutor.avatarUrl',
    'student.user.email',
    'student.user.phone',
    'student.user.avatarUrl',
    'student.email', // Flattened structure (e.g., booking details)
    'student.avatarUrl',
  ];

  // Public endpoints that return PII about other users - always encrypt
  // These endpoints don't require authentication but may have optional auth
  private readonly publicPiiEndpoints = [
    '/tutors',
    '/tutors/search',
    '/tutors/trending',
    '/tutors/filters',
  ];

  // Self-profile endpoints: the user is viewing their OWN data,
  // so PII should NOT be encrypted (they need to see their own phone/email)
  private readonly selfProfileEndpoints = [
    '/students/me',
    '/tutors/me',
  ];

  // Auth endpoints return JWTs; encrypting them breaks login when the client cannot decrypt.
  private readonly authEndpoints = [
    '/auth/login',
    '/auth/refresh',
    '/auth/register',
    '/auth/google',
    '/auth/google/callback',
  ];

  constructor(
    private readonly encryptionService: EncryptionService,
    private readonly config: ConfigService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    
    // Check if encryption is enabled
    const encryptionEnabled = this.encryptionService.isEncryptionEnabled();
    if (!encryptionEnabled) {
      this.logger.debug(`[EncryptResponse] Encryption disabled - skipping for ${request.url}`);
      return next.handle();
    }

    // Skip encryption for binary/stream endpoints (e.g. file downloads)
    const url: string = request.url || '';
    if (url.startsWith('/uploads/open/') || url.startsWith('/uploads/direct')) {
      return next.handle();
    }

    if (this.isAuthRoute(url)) {
      return next.handle();
    }

    // Check if this is a public endpoint that exposes PII about other users
    // Public endpoints (like /tutors) should ALWAYS encrypt PII, even if a user is authenticated
    // This protects PII in public listings where authentication is optional
    // Internal tester exemption only applies to protected endpoints, not public ones
    const isPublicEndpoint = this.isPublicRoute(request.url);

    // Self-profile endpoints: skip encryption so the user can see their own PII
    const isSelfProfile = this.isSelfProfileRoute(request.url);
    if (isSelfProfile && user) {
      this.logger.log(
        `[EncryptResponse] Self-profile endpoint - skipping encryption for ${user.email} on ${request.url}`
      );
      return next.handle();
    }

    // For public endpoints, ALWAYS encrypt PII regardless of user authentication status
    // This ensures PII is protected in public listings (e.g., /tutors, /tutors/:id)
    // Internal tester exemption only applies to protected endpoints that require authentication
    if (isPublicEndpoint) {
      this.logger.log(
        `[EncryptResponse] Public endpoint detected - encrypting PII for ${request.url} (user: ${user?.email || 'none'})`
      );
      return next.handle().pipe(
        map((data) => {
          try {
            return this.encryptResponse(data);
          } catch (error) {
            this.logger.error(`Failed to encrypt response: ${error instanceof Error ? error.message : String(error)}`);
            return data;
          }
        }),
      );
    }

    // For protected endpoints, check if user is an internal tester
    // 1. Check INTERNAL_TESTER_EMAILS environment variable (comma-separated list)
    // 2. Fallback to PREPROD_ALLOWED_EMAILS (if configured)
    // Internal testers see plain data (no encryption) for easier testing
    let isInternalTester = false;
    if (user?.email) {
      const internalTesterEmails = this.config.get<string>('INTERNAL_TESTER_EMAILS', '');
      if (internalTesterEmails) {
        const emailList = internalTesterEmails.split(',').map(e => e.trim().toLowerCase());
        isInternalTester = emailList.includes(user.email.toLowerCase());
        if (isInternalTester) {
          this.logger.debug(`[EncryptResponse] User ${user.email} is internal tester (INTERNAL_TESTER_EMAILS)`);
        }
      } else {
        // Fallback: use preprod allowlist if INTERNAL_TESTER_EMAILS is not set
        isInternalTester = isPreprodAllowedEmail(this.config, user.email);
        if (isInternalTester) {
          this.logger.debug(`[EncryptResponse] User ${user.email} is internal tester (PREPROD_ALLOWED_EMAILS)`);
        }
      }
    }

    // Only encrypt for non-admin users and non-internal testers
    // Admins and internal testers see plain data (no encryption) on protected endpoints
    const shouldEncrypt = 
      encryptionEnabled && 
      (!user || (user.role !== 'ADMIN' && !isInternalTester));
    
    // Debug logging - log at INFO level for visibility
    if (user) {
      this.logger.log(
        `[EncryptResponse] User: ${user.email}, Role: ${user.role}, ` +
        `IsInternalTester: ${isInternalTester}, ShouldEncrypt: ${shouldEncrypt}, ` +
        `URL: ${request.url}`
      );
    } else {
      this.logger.log(`[EncryptResponse] No user (public endpoint) - ShouldEncrypt: ${shouldEncrypt}, EncryptionEnabled: ${encryptionEnabled}, URL: ${request.url}`);
    }
    
    if (!shouldEncrypt) {
      if (user) {
        this.logger.log(`[EncryptResponse] Skipping encryption for ${user.email} (ADMIN: ${user.role === 'ADMIN'}, InternalTester: ${isInternalTester})`);
      }
      return next.handle();
    }

    return next.handle().pipe(
      map((data) => {
        try {
          return this.encryptResponse(data);
        } catch (error) {
          this.logger.error(`Failed to encrypt response: ${error instanceof Error ? error.message : String(error)}`);
          return data; // Return original data if encryption fails
        }
      }),
    );
  }

  private encryptResponse(data: any): any {
    if (!data) {
      return data;
    }

    // Handle arrays
    if (Array.isArray(data)) {
      return data.map(item => this.encryptResponse(item));
    }

    // Handle objects
    if (typeof data === 'object') {
      // Check if it's a paginated response
      if (data.items && Array.isArray(data.items)) {
        return {
          ...data,
          items: data.items.map((item: any) => 
            this.encryptionService.encryptObject(item, this.encryptableFields)
          ),
        };
      }

      // Encrypt the object itself
      return this.encryptionService.encryptObject(data, this.encryptableFields);
    }

    return data;
  }

  /**
   * Check if a route is a self-profile endpoint where the user views their own PII
   * These endpoints should NOT encrypt PII since the data belongs to the requesting user
   */
  private isSelfProfileRoute(url: string): boolean {
    const path = url.split('?')[0];
    return this.selfProfileEndpoints.some(route => path === route || path === `${route}/`);
  }

  private isAuthRoute(url: string): boolean {
    const path = url.split('?')[0];
    return this.authEndpoints.some(
      (route) => path === route || path.startsWith(`${route}/`),
    );
  }

  /**
   * Check if a route is a public endpoint that should always encrypt PII
   * Public endpoints are those that don't require authentication and expose PII about other users
   */
  private isPublicRoute(url: string): boolean {
    // Normalize URL (remove query params for matching)
    const path = url.split('?')[0];

    // Check if URL matches any public route pattern
    return this.publicPiiEndpoints.some(route => {
      // Exact match or starts with route followed by / (for dynamic routes like /tutors/:id)
      return path === route || path.startsWith(route + '/');
    });
  }
}
