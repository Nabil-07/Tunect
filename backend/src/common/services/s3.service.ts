import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { 
  S3Client, 
  PutObjectCommand, 
  DeleteObjectCommand,
  GetObjectCommand 
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createId } from '@paralleldrive/cuid2';

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly s3Client!: S3Client | null;
  private readonly bucketName: string;
  private readonly region: string;
  private readonly isEnabled: boolean;
  private readonly allowedTopLevelPrefixes = new Set(['avatars', 'kyc', 'certificates', 'study-materials', 'payouts', 'expenses', 'test']);
  /** Per-request timeout in ms for S3 operations */
  private readonly requestTimeoutMs = 30_000;

  constructor(private readonly configService: ConfigService) {
    this.bucketName = this.configService.get<string>('AWS_S3_BUCKET_NAME') || '';
    this.region = this.configService.get<string>('AWS_REGION') || 'us-east-1';
    this.isEnabled = this.configService.get<string>('ENABLE_S3') === 'true';

    if (this.isEnabled) {
      this.s3Client = new S3Client({
        region: this.region,
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
        requestHandler: {
          requestTimeout: this.requestTimeoutMs,
          connectionTimeout: 10_000,
        } as any,
        credentials: {
          accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID') || '',
          secretAccessKey: this.configService.get<string>('AWS_SECRET_ACCESS_KEY') || '',
        },
      });
      this.logger.log(`S3 Service initialized for bucket: ${this.bucketName}`);
    } else {
      this.logger.warn('S3 Service is disabled. Set ENABLE_S3=true to enable.');
    }
  }

  /**
   * Upload a file to S3
   * @param file - File buffer
   * @param originalName - Original filename
   * @param folder - Folder path in S3 (canonical top-level prefixes: avatars/, kyc/, certificates/, test/)
   * @returns S3 URL or mock URL if S3 is disabled
   */
  async uploadFile(
    file: Buffer,
    originalName: string,
    folder: string,
  ): Promise<string> {
    const normalizedFolder = this.normalizeFolder(folder);
    const fileExtension = originalName.includes('.')
      ? originalName.split('.').pop()?.toLowerCase()
      : undefined;
    const cuid = createId();
    const keySuffix = fileExtension ? `${cuid}.${fileExtension}` : cuid;
    const fileName = `${normalizedFolder}/${keySuffix}`;

    if (!this.isEnabled) {
      // Mock URL for testing without S3
      const mockUrl = `https://mock-s3.tunect.local/${fileName}`;
      this.logger.warn(`S3 disabled. Returning mock URL: ${mockUrl}`);
      return mockUrl;
    }

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: fileName,
      Body: file,
      ContentType: this.getContentType(fileExtension),
    });

    try {
      if (!this.s3Client) {
        throw new Error('S3 client not initialized');
      }
      const abortController = new AbortController();
      const timer = setTimeout(() => abortController.abort(), this.requestTimeoutMs);
      try {
        await this.s3Client.send(command, { abortSignal: abortController.signal });
      } finally {
        clearTimeout(timer);
      }
      const fileUrl = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${fileName}`;
      this.logger.log(`File uploaded successfully: ${fileUrl}`);
      return fileUrl;
    } catch (error: any) {
      if (error?.name === 'AbortError' || error?.code === 'ECONNABORTED') {
        this.logger.error(`S3 upload timed out after ${this.requestTimeoutMs}ms for ${fileName}`);
        throw new Error(`S3 upload timed out after ${this.requestTimeoutMs / 1000}s`);
      }
      this.logger.error('S3 upload error:', error);
      throw new Error('Failed to upload file to S3');
    }
  }

  async createPresignedPutUrl(key: string, contentType: string, expiresIn = 900): Promise<string> {
    if (!this.isEnabled) {
      return `https://mock-s3.tunect.local/${key}`;
    }

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: contentType,
    });

    if (!this.s3Client) {
      throw new Error('S3 client not initialized');
    }

    return getSignedUrl(this.s3Client, command, { expiresIn });
  }

  async createPresignedGetUrlForKey(key: string, expiresIn = 600): Promise<string> {
    if (!this.isEnabled) {
      return `https://mock-s3.tunect.local/${key}`;
    }

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    if (!this.s3Client) {
      throw new Error('S3 client not initialized');
    }

    return getSignedUrl(this.s3Client, command, { expiresIn });
  }

  async getObjectByKey(key: string) {
    if (!this.isEnabled) {
      throw new Error('S3 is disabled');
    }

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    if (!this.s3Client) {
      throw new Error('S3 client not initialized');
    }

    return this.s3Client.send(command);
  }

  toObjectUrl(key: string): string {
    return `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${key}`;
  }

  /**
   * Delete a file from S3
   * @param fileUrl - Full S3 URL
   */
  async deleteFile(fileUrl: string): Promise<void> {
    if (!this.isEnabled) {
      this.logger.warn(`S3 disabled. Skipping delete for: ${fileUrl}`);
      return;
    }

    try {
      const key = this.extractKeyFromReference(fileUrl);
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      if (!this.s3Client) {
        throw new Error('S3 client not initialized');
      }
      await this.s3Client.send(command);
      this.logger.log(`File deleted successfully: ${key}`);
    } catch (error) {
      this.logger.error('S3 delete error:', error);
      throw new Error('Failed to delete file from S3');
    }
  }

  /**
   * Generate a presigned URL for temporary file access
   * @param fileUrl - Full S3 URL
   * @param expiresIn - Expiration time in seconds (default: 3600 = 1 hour)
   */
  async getPresignedUrl(fileUrl: string, expiresIn = 3600): Promise<string> {
    if (!this.isEnabled) {
      return fileUrl; // Return original URL if S3 is disabled
    }

    try {
      const key = this.extractKeyFromReference(fileUrl);
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      if (!this.s3Client) {
        throw new Error('S3 client not initialized');
      }
      const signedUrl = await getSignedUrl(this.s3Client, command, { expiresIn });
      return signedUrl;
    } catch (error) {
      this.logger.error('S3 presigned URL error:', error);
      return fileUrl; // Fallback to original URL
    }
  }

  /**
   * Extract S3 key from full URL or return key as-is
   */
  extractKeyFromReference(reference: string): string {
    const value = String(reference || '').trim();
    if (!value) {
      throw new Error('Invalid S3 reference');
    }

    if (value.startsWith('http://') || value.startsWith('https://')) {
      const url = new URL(value);
      return url.pathname.substring(1);
    }

    return value.replace(/^\/+/, '');
  }

  isLikelyObjectKey(reference: string): boolean {
    const value = String(reference || '').trim();
    return !!value && !value.startsWith('http://') && !value.startsWith('https://');
  }

  /**
   * Get content type based on file extension
   */
  private getContentType(extension: string | undefined): string {
    const contentTypes: Record<string, string> = {
      pdf: 'application/pdf',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      txt: 'text/plain',
      mp4: 'video/mp4',
      mp3: 'audio/mpeg',
    };

    return contentTypes[extension?.toLowerCase() || ''] || 'application/octet-stream';
  }

  private normalizeFolder(folder: string): string {
    const cleaned = String(folder || '')
      .trim()
      .replaceAll(/(?:^\/+|\/+?$)/g, '')
      .replaceAll(/\/{2,}/g, '/');

    const [topLevel] = cleaned.split('/');
    if (topLevel && this.allowedTopLevelPrefixes.has(topLevel)) {
      return cleaned;
    }

    return cleaned ? `test/${cleaned}` : 'test';
  }
}
