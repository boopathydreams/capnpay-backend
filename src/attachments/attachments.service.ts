import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs/promises';

export interface UploadUrlResponse {
  url: string;
  fields?: Record<string, string>;
  objectKey: string;
}

export interface DownloadUrlResponse {
  url: string;
  expiresIn: number;
}

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);
  private readonly isProduction: boolean;
  private readonly uploadDir: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.isProduction = this.config.get('NODE_ENV') === 'production';
    this.uploadDir = this.config.get('LOCAL_UPLOAD_DIR') || './uploads';

    // Ensure upload directory exists
    this.ensureUploadDir();
  }

  private async ensureUploadDir() {
    try {
      await fs.mkdir(this.uploadDir, { recursive: true });
      this.logger.log(`Upload directory ensured: ${this.uploadDir}`);
    } catch (error) {
      this.logger.error(`Failed to create upload directory: ${error.message}`);
    }
  }

  /**
   * Generate presigned upload URL for attachments
   */
  async generateUploadUrl(
    userId: string,
    mediaType: string,
    sizeBytes: number,
    checksum: string,
  ): Promise<UploadUrlResponse> {
    // Generate unique object key
    const timestamp = Date.now();
    const randomId = crypto.randomBytes(8).toString('hex');
    const extension = this.getExtensionFromMimeType(mediaType);
    const objectKey = `voice-memos/${userId}/${timestamp}-${randomId}${extension}`;

    if (this.isProduction && this.config.get('S3_ENABLED')) {
      // TODO: Implement S3 presigned URL generation
      return this.generateS3UploadUrl(objectKey, mediaType, sizeBytes);
    } else {
      // Local file system - return local upload URL
      return this.generateLocalUploadUrl(objectKey, mediaType, sizeBytes);
    }
  }

  /**
   * Generate presigned download URL for attachments
   */
  async generateDownloadUrl(
    userId: string,
    objectKey: string,
  ): Promise<DownloadUrlResponse> {
    // Verify user has access to this attachment
    const attachment = await this.prisma.attachment.findFirst({
      where: {
        objectKey,
        memo: {
          paymentIntent: {
            userId,
          },
        },
      },
    });

    if (!attachment) {
      throw new NotFoundException('Attachment not found or access denied');
    }

    if (this.isProduction && this.config.get('S3_ENABLED')) {
      // TODO: Implement S3 presigned download URL
      return this.generateS3DownloadUrl(objectKey);
    } else {
      // Local file system - return local download URL
      return this.generateLocalDownloadUrl(objectKey);
    }
  }

  /**
   * Mark attachment as uploaded
   */
  async markAsUploaded(objectKey: string, actualSizeBytes?: number) {
    const attachment = await this.prisma.attachment.findFirst({
      where: { objectKey },
    });

    if (!attachment) {
      throw new NotFoundException('Attachment not found');
    }

    return await this.prisma.attachment.update({
      where: { id: attachment.id },
      data: {
        isUploaded: true,
        ...(actualSizeBytes && { sizeBytes: actualSizeBytes }),
      },
    });
  }

  /**
   * Generate S3 presigned upload URL (placeholder for production)
   */
  private async generateS3UploadUrl(
    objectKey: string,
    mediaType: string,
    sizeBytes: number,
  ): Promise<UploadUrlResponse> {
    // TODO: Implement actual S3 presigned URL generation
    // For now, return a mock response
    this.logger.warn('S3 upload URL generation not implemented yet');

    return {
      url: `https://s3.amazonaws.com/capnpay-attachments/${objectKey}`,
      fields: {
        key: objectKey,
        'Content-Type': mediaType,
        'Content-Length': sizeBytes.toString(),
      },
      objectKey,
    };
  }

  /**
   * Generate S3 presigned download URL (placeholder for production)
   */
  private async generateS3DownloadUrl(
    objectKey: string,
  ): Promise<DownloadUrlResponse> {
    // TODO: Implement actual S3 presigned download URL generation
    this.logger.warn('S3 download URL generation not implemented yet');

    return {
      url: `https://s3.amazonaws.com/capnpay-attachments/${objectKey}?expires=3600`,
      expiresIn: 3600,
    };
  }

  /**
   * Generate local upload URL for development
   */
  private async generateLocalUploadUrl(
    objectKey: string,
    mediaType: string,
    sizeBytes: number,
  ): Promise<UploadUrlResponse> {
    const uploadPath = path.join(this.uploadDir, objectKey);
    const uploadDir = path.dirname(uploadPath);

    // Ensure directory exists
    await fs.mkdir(uploadDir, { recursive: true });

    // For local development, we'll use the backend URL as the upload endpoint
    const baseUrl = this.config.get('APP_URL') || 'http://localhost:3000';
    const uploadUrl = `${baseUrl}/attachments/local-upload/${encodeURIComponent(objectKey)}`;

    return {
      url: uploadUrl,
      objectKey,
    };
  }

  /**
   * Generate local download URL for development
   */
  private async generateLocalDownloadUrl(
    objectKey: string,
  ): Promise<DownloadUrlResponse> {
    const baseUrl = this.config.get('APP_URL') || 'http://localhost:3000';
    const downloadUrl = `${baseUrl}/attachments/local-download/${encodeURIComponent(objectKey)}`;

    return {
      url: downloadUrl,
      expiresIn: 3600, // 1 hour
    };
  }

  /**
   * Get file extension from MIME type
   */
  private getExtensionFromMimeType(mimeType: string): string {
    const mimeToExt: Record<string, string> = {
      'audio/mp4': '.m4a',
      'audio/mpeg': '.mp3',
      'audio/wav': '.wav',
      'audio/webm': '.webm',
      'audio/ogg': '.ogg',
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'application/pdf': '.pdf',
    };

    return mimeToExt[mimeType] || '';
  }

  /**
   * Handle local file upload (for development)
   */
  async handleLocalUpload(
    objectKey: string,
    fileBuffer: Buffer,
  ): Promise<void> {
    const uploadPath = path.join(this.uploadDir, objectKey);
    const uploadDir = path.dirname(uploadPath);

    // Ensure directory exists
    await fs.mkdir(uploadDir, { recursive: true });

    // Write file
    await fs.writeFile(uploadPath, fileBuffer);

    this.logger.log(`File uploaded locally: ${uploadPath}`);
  }

  /**
   * Get local file (for development downloads)
   */
  async getLocalFile(objectKey: string): Promise<Buffer> {
    const filePath = path.join(this.uploadDir, objectKey);

    try {
      return await fs.readFile(filePath);
    } catch (error) {
      throw new NotFoundException('File not found');
    }
  }
}
