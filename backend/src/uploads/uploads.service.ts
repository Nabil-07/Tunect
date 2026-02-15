import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createId } from '@paralleldrive/cuid2';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../common/services/s3.service';
import { PresignUploadDto, UploadUseCase } from './dto/presign-upload.dto';

type UploadRule = {
  maxBytes: number;
  allowedMimeTypes: Set<string>;
};

@Injectable()
export class UploadsService {
  private readonly readUrlDefaultTtlSec = 3600;

  private readonly blockedMimeTypes = new Set([
    'application/x-msdownload',
    'application/x-sh',
    'application/x-bat',
    'application/x-csh',
    'application/java-archive',
    'application/x-httpd-php',
    'text/x-python',
    'text/x-shellscript',
    'application/vnd.microsoft.portable-executable',
  ]);

  private readonly extensionByMimeType: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'text/plain': 'txt',
  };

  private readonly rulesByUseCase: Record<UploadUseCase, UploadRule> = {
    avatars: {
      maxBytes: 5 * 1024 * 1024,
      allowedMimeTypes: new Set(['image/jpeg', 'image/png', 'image/webp']),
    },
    kyc: {
      maxBytes: 8 * 1024 * 1024,
      allowedMimeTypes: new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
    },
    certificates: {
      maxBytes: 8 * 1024 * 1024,
      allowedMimeTypes: new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']),
    },
    'study-materials': {
      maxBytes: 5 * 1024 * 1024,
      allowedMimeTypes: new Set([
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain',
      ]),
    },
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
    private readonly configService: ConfigService,
  ) {}

  async createPresignedUpload(userId: string, dto: PresignUploadDto, expiresIn = 900) {
    this.validateUploadRequest(dto);

    const key = await this.buildObjectKey(userId, dto);
    const uploadUrl = await this.s3Service.createPresignedPutUrl(key, dto.mimeType, expiresIn);

    return {
      key,
      uploadUrl,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    };
  }

  async createPresignedGet(userId: string, keyOrUrl: string, userRole?: string, expiresIn = 600) {
    const key = this.s3Service.extractKeyFromReference(keyOrUrl);
    await this.assertReadAccess(userId, key, userRole);

    const ttl = Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : this.readUrlDefaultTtlSec;
    const downloadUrl = this.buildSignedReadUrl(key, ttl);
    return {
      key,
      downloadUrl,
      expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
    };
  }

  async assertKeyAllowedForUseCase(params: {
    userId: string;
    useCase: UploadUseCase;
    keyOrUrl: string;
    userRole?: string;
    docType?: string;
  }): Promise<string> {
    const key = this.s3Service.extractKeyFromReference(params.keyOrUrl);

    if (!this.isCuidNamedKey(key)) {
      throw new BadRequestException('Invalid object key format');
    }

    if (params.userRole === 'ADMIN') {
      this.assertPrefixByUseCase(params.useCase, key);
      return key;
    }

    const tutor = await this.prisma.tutor.findUnique({
      where: { userId: params.userId },
      select: { id: true },
    });

    if (params.useCase === 'avatars') {
      const expectedPrefix = `avatars/${params.userId}/`;
      if (!key.startsWith(expectedPrefix)) {
        throw new ForbiddenException('Avatar key does not belong to user');
      }
      return key;
    }

    if (!tutor) {
      throw new ForbiddenException('Tutor profile not found');
    }

    if (params.useCase === 'kyc') {
      const safeDocType = this.sanitizeDocType(params.docType || 'document');
      const expectedPrefix = `kyc/${tutor.id}/${safeDocType}/`;
      if (!key.startsWith(expectedPrefix)) {
        throw new ForbiddenException('KYC key does not belong to tutor');
      }
      return key;
    }

    const expectedPrefix = `${params.useCase}/${tutor.id}/`;
    if (!key.startsWith(expectedPrefix)) {
      throw new ForbiddenException('Upload key does not belong to tutor');
    }

    return key;
  }

  toStoredReference(key: string): string {
    return key;
  }

  async toReadableReference(storedReference: string, userId?: string, userRole?: string) {
    const value = String(storedReference || '').trim();
    if (!value) {
      return storedReference;
    }

    const key = this.resolveManagedKeyFromReference(value);
    if (!key) {
      return storedReference;
    }

    if (userId) {
      await this.assertReadAccess(userId, key, userRole);
    }

    if (key.startsWith('avatars/')) {
      try {
        return await this.s3Service.createPresignedGetUrlForKey(key, this.readUrlDefaultTtlSec);
      } catch {
        return this.buildSignedReadUrl(key, this.readUrlDefaultTtlSec);
      }
    }

    return this.buildSignedReadUrl(key, this.readUrlDefaultTtlSec);
  }

  private resolveManagedKeyFromReference(reference: string): string | null {
    let key = String(reference || '').trim();
    if (!key) {
      return null;
    }

    const keyFromPathToken = this.tryResolveOpenTokenPath(key);
    if (keyFromPathToken) {
      key = keyFromPathToken;
    }

    if (!this.s3Service.isLikelyObjectKey(reference)) {
      const keyFromUrl = this.tryResolveKeyFromUrl(reference);
      if (!keyFromUrl) {
        return null;
      }
      key = keyFromUrl;
    }

    const keyFromToken = this.tryResolveOpenTokenPath(key);
    if (keyFromToken) {
      key = keyFromToken;
    }

    key = key.replace(/^\/+/, '');
    if (!key || !this.isManagedObjectKey(key)) {
      return null;
    }

    return key;
  }

  private tryResolveKeyFromUrl(reference: string): string | null {
    try {
      const parsed = new URL(reference);
      const marker = '/uploads/open/';
      const markerIndex = parsed.pathname.indexOf(marker);
      if (markerIndex >= 0) {
        const token = parsed.pathname.slice(markerIndex + marker.length);
        return this.resolveStoredTokenKey(token);
      }

      return this.s3Service.extractKeyFromReference(reference);
    } catch {
      try {
        return this.s3Service.extractKeyFromReference(reference);
      } catch {
        return null;
      }
    }
  }

  private tryResolveOpenTokenPath(reference: string): string | null {
    const value = String(reference || '').trim();
    if (!value.startsWith('/uploads/open/') && !value.startsWith('uploads/open/')) {
      return null;
    }

    const token = value.replace(/^\/?uploads\/open\//, '');
    if (!token) {
      return null;
    }

    return this.resolveStoredTokenKey(token);
  }

  private resolveStoredTokenKey(token: string): string | null {
    try {
      return this.resolveSignedReadToken(token).key;
    } catch {
      const [payloadEncoded, signatureEncoded] = String(token || '').split('.');
      if (!payloadEncoded || !signatureEncoded) {
        return null;
      }

      const expectedSignature = this.signPayload(payloadEncoded);
      const signatureBuffer = Buffer.from(signatureEncoded);
      const expectedBuffer = Buffer.from(expectedSignature);
      if (
        signatureBuffer.length !== expectedBuffer.length ||
        !timingSafeEqual(signatureBuffer, expectedBuffer)
      ) {
        return null;
      }

      try {
        const payload = JSON.parse(Buffer.from(payloadEncoded, 'base64url').toString('utf8')) as {
          key?: string;
        };
        const key = String(payload?.key || '').trim();
        return key || null;
      } catch {
        return null;
      }
    }
  }

  resolveSignedReadToken(token: string): { key: string; expiresAtMs: number } {
    const [payloadEncoded, signatureEncoded] = String(token || '').split('.');
    if (!payloadEncoded || !signatureEncoded) {
      throw new BadRequestException('Invalid file token');
    }

    const expectedSignature = this.signPayload(payloadEncoded);
    const signatureBuffer = Buffer.from(signatureEncoded);
    const expectedBuffer = Buffer.from(expectedSignature);
    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
      throw new ForbiddenException('Invalid file token signature');
    }

    let payload: { key?: string; exp?: number };
    try {
      payload = JSON.parse(Buffer.from(payloadEncoded, 'base64url').toString('utf8'));
    } catch {
      throw new BadRequestException('Malformed file token');
    }

    const key = String(payload?.key || '').trim();
    const expiresAtMs = Number(payload?.exp || 0);

    if (!key || !Number.isFinite(expiresAtMs)) {
      throw new BadRequestException('Invalid file token payload');
    }

    if (Date.now() > expiresAtMs) {
      throw new ForbiddenException('File link has expired');
    }

    return { key, expiresAtMs };
  }

  private buildSignedReadUrl(key: string, expiresInSec: number): string {
    const expiresAtMs = Date.now() + expiresInSec * 1000;
    const payloadEncoded = Buffer.from(
      JSON.stringify({ key, exp: expiresAtMs }),
      'utf8',
    ).toString('base64url');
    const signature = this.signPayload(payloadEncoded);
    const token = `${payloadEncoded}.${signature}`;

    const appUrl = String(this.configService.get<string>('APP_URL') || '').replace(/\/+$/, '');
    if (appUrl) {
      return `${appUrl}/uploads/open/${token}`;
    }

    return `/uploads/open/${token}`;
  }

  private signPayload(payloadEncoded: string): string {
    const secret =
      this.configService.get<string>('UPLOAD_URL_SIGNING_SECRET') ||
      this.configService.get<string>('JWT_SECRET') ||
      'tunect-upload-url-secret';

    return createHmac('sha256', secret)
      .update(payloadEncoded)
      .digest('base64url');
  }

  private async assertReadAccess(userId: string, key: string, userRole?: string) {
    if (userRole === 'ADMIN') {
      return;
    }

    if (key.startsWith(`avatars/${userId}/`)) {
      return;
    }

    const tutor = await this.prisma.tutor.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!tutor) {
      throw new ForbiddenException('Tutor profile not found');
    }

    const tutorPrefixes = [
      `kyc/${tutor.id}/`,
      `certificates/${tutor.id}/`,
      `study-materials/${tutor.id}/`,
    ];

    if (!tutorPrefixes.some((prefix) => key.startsWith(prefix))) {
      throw new ForbiddenException('Not authorized to access this object key');
    }
  }

  private validateUploadRequest(dto: PresignUploadDto) {
    const mimeType = String(dto.mimeType || '').trim().toLowerCase();
    const size = Number(dto.size);

    const rule = this.rulesByUseCase[dto.useCase];
    if (!rule) {
      throw new BadRequestException('Unsupported upload use case');
    }

    if (!mimeType || this.blockedMimeTypes.has(mimeType)) {
      throw new BadRequestException('Blocked or invalid MIME type');
    }

    if (!rule.allowedMimeTypes.has(mimeType)) {
      throw new BadRequestException(`MIME type not allowed for ${dto.useCase}`);
    }

    if (!Number.isFinite(size) || size <= 0 || size > rule.maxBytes) {
      throw new BadRequestException(`File exceeds max size for ${dto.useCase}`);
    }

    if (!this.extensionByMimeType[mimeType]) {
      throw new BadRequestException('Unsupported MIME type extension mapping');
    }

    if (dto.useCase === 'kyc' && !String(dto.docType || '').trim()) {
      throw new BadRequestException('docType is required for kyc uploads');
    }
  }

  private async buildObjectKey(userId: string, dto: PresignUploadDto) {
    const mimeType = dto.mimeType.toLowerCase();
    const ext = this.extensionByMimeType[mimeType];
    const id = createId();

    if (dto.useCase === 'avatars') {
      return `avatars/${userId}/${id}.${ext}`;
    }

    const tutor = await this.prisma.tutor.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!tutor) {
      throw new ForbiddenException('Tutor profile not found');
    }

    if (dto.useCase === 'kyc') {
      const safeDocType = this.sanitizeDocType(dto.docType || 'document');
      return `kyc/${tutor.id}/${safeDocType}/${id}.${ext}`;
    }

    return `${dto.useCase}/${tutor.id}/${id}.${ext}`;
  }

  private sanitizeDocType(value: string): string {
    return String(value || 'document')
      .trim()
      .toLowerCase()
      .replaceAll(/[^a-z0-9_-]/g, '-')
      .replaceAll(/-+/g, '-')
      .replaceAll(/(^-|-$)/g, '') || 'document';
  }

  private isCuidNamedKey(key: string): boolean {
    const segments = String(key || '').split('/').filter(Boolean);
    if (!segments.length) {
      return false;
    }

    const fileName = segments.at(-1);
    if (!fileName) {
      return false;
    }
    const dotIndex = fileName.lastIndexOf('.');
    if (dotIndex <= 0) {
      return false;
    }

    const stem = fileName.substring(0, dotIndex);
    return /^[a-z][a-z0-9]{10,40}$/i.test(stem);
  }

  private assertPrefixByUseCase(useCase: UploadUseCase, key: string) {
    const expectedPrefix = `${useCase}/`;
    if (!key.startsWith(expectedPrefix)) {
      throw new ForbiddenException(`Key does not match ${useCase} prefix`);
    }
  }

  private isManagedObjectKey(key: string): boolean {
    return (
      key.startsWith('avatars/') ||
      key.startsWith('kyc/') ||
      key.startsWith('certificates/') ||
      key.startsWith('study-materials/')
    );
  }
}
