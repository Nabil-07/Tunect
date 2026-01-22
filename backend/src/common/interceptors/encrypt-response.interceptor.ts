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
    'user.email',
    'user.phone',
    'tutor.user.email',
    'tutor.user.phone',
    'tutor.email', // Flattened structure (e.g., booking details)
    'student.user.email',
    'student.user.phone',
    'student.email', // Flattened structure (e.g., booking details)
  ];

  constructor(
    private readonly encryptionService: EncryptionService,
    private readonly config: ConfigService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    
    // Check if encryption is enabled
    if (!this.encryptionService.isEncryptionEnabled()) {
      return next.handle();
    }

    // Check if user is an internal tester
    // 1. Check INTERNAL_TESTER_EMAILS environment variable (comma-separated list)
    // 2. Fallback to PREPROD_ALLOWED_EMAILS (if configured)
    // Internal testers see plain data (no encryption) for easier testing
    let isInternalTester = false;
    if (user?.email) {
      const internalTesterEmails = this.config.get<string>('INTERNAL_TESTER_EMAILS', '');
      if (internalTesterEmails) {
        const emailList = internalTesterEmails.split(',').map(e => e.trim().toLowerCase());
        isInternalTester = emailList.includes(user.email.toLowerCase());
      } else {
        // Fallback: use preprod allowlist if INTERNAL_TESTER_EMAILS is not set
        isInternalTester = isPreprodAllowedEmail(this.config, user.email);
      }
    }

    // Only encrypt for non-admin users and non-internal testers
    // Admins and internal testers see plain data (no encryption)
    const shouldEncrypt = 
      this.encryptionService.isEncryptionEnabled() && 
      (!user || (user.role !== 'ADMIN' && !isInternalTester));
    
    if (!shouldEncrypt) {
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
}
