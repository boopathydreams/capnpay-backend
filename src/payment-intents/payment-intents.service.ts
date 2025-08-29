import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpiService } from '../upi/upi.service';
import { TaggingService } from '../tagging/tagging.service';
import { CapsService } from '../caps/caps.service';
import { CreatePaymentIntentDto, CompletePaymentIntentDto } from './dto';
import {
  CreatePaymentIntentResponseDto,
  CompletePaymentIntentResponseDto,
} from './dto/payment-intent-response.dto';
import { PaymentStatus } from '@prisma/client';

@Injectable()
export class PaymentIntentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly upiService: UpiService,
    private readonly taggingService: TaggingService,
    private readonly capsService: CapsService,
  ) {}

  /**
   * Create a new payment intent
   */
  async create(
    userId: string,
    dto: CreatePaymentIntentDto,
  ): Promise<CreatePaymentIntentResponseDto> {
    // Validate VPA format
    if (!this.upiService.validateVpa(dto.vpa)) {
      throw new BadRequestException('Invalid VPA format');
    }

    // Generate transaction reference
    const trRef = this.upiService.generateTransactionRef();

    // Get AI suggested tag
    const now = new Date();
    const tagSuggestion = await this.taggingService.suggestTag({
      userId,
      vpa: dto.vpa,
      payeeName: dto.payeeName,
      amount: dto.amount,
      timeOfDay: now.getHours(),
      dayOfWeek: now.getDay(),
    });

    // Analyze caps state
    const capsAnalysis = await this.capsService.analyzeCaps(
      userId,
      tagSuggestion.categoryId,
      dto.amount,
    );

    // Create payment intent
    await this.prisma.paymentIntent.create({
      data: {
        userId,
        trRef,
        vpa: dto.vpa,
        payeeName: dto.payeeName,
        amount: dto.amount,
        platform: dto.platform,
        entrypoint: dto.entrypoint,
        noteLong: dto.noteLong,
        status: PaymentStatus.CREATED,
      },
    });

    // Build UPI deep link
    const upiDeepLink = this.upiService.buildUpiDeepLink({
      vpa: dto.vpa,
      payeeName: dto.payeeName,
      amount: dto.amount,
      transactionNote: tagSuggestion.tagText,
      transactionRef: trRef,
    });

    return {
      tr: trRef,
      upiDeepLink,
      suggestedTag: tagSuggestion,
      categoryId: tagSuggestion.categoryId,
      capsState: capsAnalysis.capsState,
      requiresOverride: capsAnalysis.requiresOverride,
    };
  }

  /**
   * Complete a payment intent
   */
  async complete(
    trRef: string,
    dto: CompletePaymentIntentDto,
  ): Promise<CompletePaymentIntentResponseDto> {
    // Find payment intent
    const paymentIntent = await this.prisma.paymentIntent.findUnique({
      where: { trRef },
    });

    if (!paymentIntent) {
      throw new NotFoundException('Payment intent not found');
    }

    // Update payment status
    const completedAt = new Date();
    await this.prisma.paymentIntent.update({
      where: { id: paymentIntent.id },
      data: {
        status: dto.status,
        upiTxnRef: dto.upiTxnRef,
        completedAt,
      },
    });

    return { ok: true };
  }

  /**
   * Create tag for payment intent
   */
  async createTag(
    trRef: string,
    categoryId: string,
    tagText: string,
    source: 'auto' | 'manual' = 'manual',
  ): Promise<void> {
    const paymentIntent = await this.prisma.paymentIntent.findUnique({
      where: { trRef },
    });

    if (!paymentIntent) {
      throw new NotFoundException('Payment intent not found');
    }

    // Create or update tag
    const existingTag = await this.prisma.tag.findFirst({
      where: {
        paymentIntentId: paymentIntent.id,
      },
    });

    if (existingTag) {
      await this.prisma.tag.update({
        where: {
          id: existingTag.id,
        },
        data: {
          categoryId,
          tagText,
          source: source === 'auto' ? 'AUTO' : 'MANUAL',
        },
      });
    } else {
      await this.prisma.tag.create({
        data: {
          paymentIntentId: paymentIntent.id,
          categoryId,
          tagText,
          source: source === 'auto' ? 'AUTO' : 'MANUAL',
        },
      });
    }
  }

  /**
   * Get payment intent by transaction reference
   */
  async findByTrRef(trRef: string) {
    return this.prisma.paymentIntent.findUnique({
      where: { trRef },
      include: {
        tags: {
          include: {
            category: true,
          },
        },
        memos: true,
      },
    });
  }

  /**
   * Get user's payment history
   */
  async getUserPaymentHistory(
    userId: string,
    options: {
      limit?: number;
      offset?: number;
      categoryId?: string;
      status?: PaymentStatus;
    } = {},
  ) {
    const { limit = 20, offset = 0, categoryId, status } = options;

    const where: any = {
      userId,
      status: status || 'SUCCESS',
    };

    if (categoryId) {
      where.tags = {
        some: {
          categoryId,
        },
      };
    }

    const payments = await this.prisma.paymentIntent.findMany({
      where,
      include: {
        tags: {
          include: {
            category: true,
          },
        },
        memos: true,
      },
      orderBy: {
        completedAt: 'desc',
      },
      take: limit,
      skip: offset,
    });

    const total = await this.prisma.paymentIntent.count({ where });

    return {
      items: payments,
      total,
      hasMore: offset + limit < total,
    };
  }

  /**
   * Analyze payment in real-time with AI insights
   */
  async analyzePayment(
    userId: string,
    amount: number,
    vpa?: string,
    payeeName?: string,
  ) {
    // Get caps information
    const capsInfo = await this.capsService.checkCaps(userId, amount);

    // Get AI analysis from tagging service
    const analysis = await this.taggingService.analyzePayment(
      userId,
      amount,
      vpa,
      payeeName,
    );

    // Get UPI app options
    const upiApps = vpa ? await this.upiService.getUpiApps(vpa) : [];

    return {
      ...analysis,
      caps: {
        status: capsInfo.status,
        percentUsed: Math.round(
          (capsInfo.totalSpent / capsInfo.totalLimit) * 100,
        ),
        remainingAmount: capsInfo.totalLimit - capsInfo.totalSpent,
        details: capsInfo,
      },
      upiOptions: {
        availableApps: upiApps,
        recommendedApp:
          upiApps[0]?.packageName || 'com.google.android.apps.nbu.paisa.user',
      },
    };
  }
}
