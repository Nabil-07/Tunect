import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { 
  S3Client, 
  PutObjectCommand, 
  DeleteObjectCommand,
  GetObjectCommand 
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly s3Client!: S3Client | null;
  private readonly bucketName: string;
  private readonly region: string;
  private readonly isEnabled: boolean;

  constructor(private configService: ConfigService) {
    this.bucketName = this.configService.get<string>('AWS_S3_BUCKET_NAME') || '';
    this.region = this.configService.get<string>('AWS_REGION') || 'us-east-1';
    this.isEnabled = this.configService.get<string>('ENABLE_S3') === 'true';

    if (this.isEnabled) {
      this.s3Client = new S3Client({
        region: this.region,
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
   * @param folder - Folder path in S3 (e.g., 'assignments', 'study-materials')
   * @returns S3 URL or mock URL if S3 is disabled
   */
  async uploadFile(
    file: Buffer,
    originalName: string,
    folder: string,
  ): Promise<string> {
    if (!this.isEnabled) {
      // Mock URL for testing without S3
      const mockUrl = `https://mock-s3.tunect.local/${folder}/${uuidv4()}-${originalName}`;
      this.logger.warn(`S3 disabled. Returning mock URL: ${mockUrl}`);
      return mockUrl;
    }

    const fileExtension = originalName.split('.').pop();
    const fileName = `${folder}/${uuidv4()}.${fileExtension}`;

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
      await this.s3Client.send(command);
      const fileUrl = `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${fileName}`;
      this.logger.log(`File uploaded successfully: ${fileUrl}`);
      return fileUrl;
    } catch (error) {
      this.logger.error('S3 upload error:', error);
      throw new Error('Failed to upload file to S3');
    }
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
      const key = this.extractKeyFromUrl(fileUrl);
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
      const key = this.extractKeyFromUrl(fileUrl);
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
   * Extract S3 key from full URL
   */
  private extractKeyFromUrl(fileUrl: string): string {
    const url = new URL(fileUrl);
    return url.pathname.substring(1); // Remove leading slash
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
}
