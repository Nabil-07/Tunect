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
  private readonly encryptableFields = [
    'email',
    'phone',
    'address',
    'user.email',
    'user.phone',
    'user.name', // Optional: encrypt names too
    'tutor.user.email',
    'tutor.user.phone',
    'student.user.email',
    'student.user.phone',
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

    // Only encrypt for non-admin users (admins see plain data)
    // Also check if encryption is enabled via environment variable
    // You can customize this logic based on your needs
    const shouldEncrypt = 
      this.encryptionService.isEncryptionEnabled() && 
      (!user || user.role !== 'ADMIN');
    
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
