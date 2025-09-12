import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  UseGuards,
  Logger,
  Res,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
} from '@nestjs/swagger';
import { AttachmentsService } from './attachments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

export interface UploadUrlRequest {
  mediaType: string;
  sizeBytes: number;
  checksum: string;
}

export interface UploadUrlResponse {
  url: string;
  fields?: Record<string, string>;
  objectKey: string;
}

@ApiTags('Attachments')
@Controller('attachments')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class AttachmentsController {
  private readonly logger = new Logger(AttachmentsController.name);

  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Post('upload-url')
  @ApiOperation({
    summary: 'Get presigned upload URL for attachment',
    description:
      'Generate a presigned URL for uploading voice memos or other attachments',
  })
  @ApiResponse({
    status: 200,
    description: 'Upload URL generated successfully',
    schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Presigned upload URL' },
        fields: {
          type: 'object',
          description: 'Additional form fields for S3 upload (if using S3)',
        },
        objectKey: {
          type: 'string',
          description: 'Object key for the uploaded file',
        },
      },
    },
  })
  async getUploadUrl(
    @CurrentUser() user: any,
    @Body() request: UploadUrlRequest,
  ): Promise<UploadUrlResponse> {
    this.logger.log(
      `Generating upload URL for user ${user.id}: ${request.mediaType}`,
    );

    return await this.attachmentsService.generateUploadUrl(
      user.id,
      request.mediaType,
      request.sizeBytes,
      request.checksum,
    );
  }

  @Get(':objectKey/download-url')
  @ApiOperation({
    summary: 'Get presigned download URL for attachment',
    description: 'Generate a presigned URL for downloading attachments',
  })
  @ApiResponse({
    status: 200,
    description: 'Download URL generated successfully',
    schema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Presigned download URL' },
        expiresIn: {
          type: 'number',
          description: 'URL expiration time in seconds',
        },
      },
    },
  })
  async getDownloadUrl(
    @CurrentUser() user: any,
    @Param('objectKey') objectKey: string,
  ) {
    this.logger.log(
      `Generating download URL for user ${user.id}: ${objectKey}`,
    );

    return await this.attachmentsService.generateDownloadUrl(
      user.id,
      objectKey,
    );
  }

  @Post(':objectKey/uploaded')
  @ApiOperation({
    summary: 'Mark attachment as uploaded',
    description: 'Confirm that an attachment has been successfully uploaded',
  })
  @ApiResponse({
    status: 200,
    description: 'Attachment marked as uploaded',
  })
  async markAsUploaded(
    @CurrentUser() user: any,
    @Param('objectKey') objectKey: string,
    @Body() data: { actualSizeBytes?: number },
  ) {
    this.logger.log(`Marking attachment as uploaded: ${objectKey}`);

    return await this.attachmentsService.markAsUploaded(
      objectKey,
      data.actualSizeBytes,
    );
  }

  @Post('local-upload/:objectKey')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload file locally (development)',
    description: 'Upload file to local storage for development',
  })
  async uploadFileLocally(
    @Param('objectKey') objectKey: string,
    @UploadedFile() file: any,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    await this.attachmentsService.handleLocalUpload(
      decodeURIComponent(objectKey),
      file.buffer,
    );

    return { success: true, message: 'File uploaded successfully' };
  }

  @Get('local-download/:objectKey')
  @ApiOperation({
    summary: 'Download file locally (development)',
    description: 'Download file from local storage for development',
  })
  async downloadFileLocally(
    @Param('objectKey') objectKey: string,
    @Res() res: Response,
  ) {
    try {
      const fileBuffer = await this.attachmentsService.getLocalFile(
        decodeURIComponent(objectKey),
      );

      // Set appropriate headers
      res.setHeader('Content-Type', 'audio/m4a');
      res.setHeader('Content-Length', fileBuffer.length);
      res.send(fileBuffer);
    } catch (error) {
      res.status(404).json({ error: 'File not found' });
    }
  }
}
