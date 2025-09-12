import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class MemosService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a text memo for a payment
   */
  async createTextMemo(paymentIntentId: string, text: string, lang = 'en') {
    // Encrypt the text for security
    const encryptedText = this.encryptText(text);

    const memo = await this.prisma.memo.create({
      data: {
        paymentIntentId,
        type: 'TEXT',
        textEncrypted: encryptedText,
        lang,
        isProcessed: true,
      },
    });

    return memo;
  }

  /**
   * Create a voice memo with optional transcript
   */
  async createVoiceMemo(
    paymentIntentId: string,
    objectKey: string,
    durationMs: number,
    transcript?: string,
    transcriptConfidence?: number,
    lang = 'en',
  ) {
    const memo = await this.prisma.memo.create({
      data: {
        paymentIntentId,
        type: 'VOICE',
        transcript,
        transcriptConfidence,
        durationMs,
        lang,
        isProcessed: transcript ? true : false,
      },
    });

    // Create attachment record for the voice file
    await this.prisma.attachment.create({
      data: {
        memoId: memo.id,
        mediaType: 'audio/mp4',
        objectKey,
        fileName: `voice_memo_${Date.now()}.m4a`,
        durationMs,
        sizeBytes: 0, // Will be updated when uploaded
        checksum: crypto.randomBytes(32).toString('hex'),
        isUploaded: false,
      },
    });

    return memo;
  }

  /**
   * Link a standalone memo to a payment intent
   */
  async linkMemoToPayment(memoId: string, paymentIntentId: string) {
    return await this.prisma.memo.update({
      where: { id: memoId },
      data: {
        paymentIntentId,
      },
    });
  }

  /**
   * Update voice memo with transcript
   */
  async updateVoiceMemoTranscript(
    memoId: string,
    transcript: string,
    confidence: number,
  ) {
    return await this.prisma.memo.update({
      where: { id: memoId },
      data: {
        transcript,
        transcriptConfidence: confidence,
        isProcessed: true,
      },
    });
  }

  /**
   * Get all memos for a payment
   */
  async getPaymentMemos(paymentIntentId: string) {
    const memos = await this.prisma.memo.findMany({
      where: { paymentIntentId },
      include: {
        attachments: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return memos.map((memo) => ({
      id: memo.id,
      type: memo.type,
      text: memo.type === 'TEXT' ? this.decryptText(memo.textEncrypted) : null,
      transcript: memo.transcript,
      transcriptConfidence: memo.transcriptConfidence,
      durationMs: memo.durationMs,
      language: memo.lang,
      isProcessed: memo.isProcessed,
      createdAt: memo.createdAt,
      attachments: memo.attachments.map((att) => ({
        id: att.id,
        mediaType: att.mediaType,
        fileName: att.fileName,
        durationMs: att.durationMs,
        sizeBytes: att.sizeBytes,
        isUploaded: att.isUploaded,
      })),
    }));
  }

  /**
   * Get user's recent memos across all payments
   */
  async getUserRecentMemos(userId: string, limit = 20) {
    const memos = await this.prisma.memo.findMany({
      where: {
        paymentIntent: {
          userId,
        },
      },
      include: {
        paymentIntent: {
          select: {
            id: true,
            payeeName: true,
            amount: true,
            completedAt: true,
          },
        },
        attachments: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return memos.map((memo) => ({
      id: memo.id,
      type: memo.type,
      text: memo.type === 'TEXT' ? this.decryptText(memo.textEncrypted) : null,
      transcript: memo.transcript,
      durationMs: memo.durationMs,
      language: memo.lang,
      createdAt: memo.createdAt,
      payment: {
        id: memo.paymentIntent.id,
        payeeName: memo.paymentIntent.payeeName,
        amount: Number(memo.paymentIntent.amount),
        date: memo.paymentIntent.completedAt,
      },
      hasAttachments: memo.attachments.length > 0,
    }));
  }

  /**
   * Delete a memo
   */
  async deleteMemo(memoId: string) {
    // Delete attachments first
    await this.prisma.attachment.deleteMany({
      where: { memoId },
    });

    // Delete memo
    return await this.prisma.memo.delete({
      where: { id: memoId },
    });
  }

  /**
   * Search memos by text content
   */
  async searchMemos(userId: string, query: string, limit = 10) {
    const memos = await this.prisma.memo.findMany({
      where: {
        paymentIntent: {
          userId,
        },
        OR: [
          {
            transcript: {
              contains: query,
              mode: 'insensitive',
            },
          },
          // Note: Can't search encrypted text directly
        ],
      },
      include: {
        paymentIntent: {
          select: {
            id: true,
            payeeName: true,
            amount: true,
            completedAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return memos.map((memo) => ({
      id: memo.id,
      type: memo.type,
      transcript: memo.transcript,
      durationMs: memo.durationMs,
      createdAt: memo.createdAt,
      payment: {
        id: memo.paymentIntent.id,
        payeeName: memo.paymentIntent.payeeName,
        amount: Number(memo.paymentIntent.amount),
        date: memo.paymentIntent.completedAt,
      },
    }));
  }

  /**
   * Simple text encryption for demo purposes
   * In production, use proper encryption libraries
   */
  private encryptText(text: string): string {
    if (!text) return '';
    const key = process.env.MEMO_ENCRYPTION_KEY || 'default-key-change-me';
    const cipher = crypto.createCipher('aes192', key);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  }

  /**
   * Simple text decryption
   */
  private decryptText(encryptedText: string | null): string | null {
    if (!encryptedText) return null;
    try {
      const key = process.env.MEMO_ENCRYPTION_KEY || 'default-key-change-me';
      const decipher = crypto.createDecipher('aes192', key);
      let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch (error) {
      console.error('Error decrypting memo text:', error);
      return '[Decryption Error]';
    }
  }
}
