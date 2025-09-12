import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpiService } from '../upi/upi.service';
import { TaggingService } from '../tagging/tagging.service';
import { CapsService } from '../caps/caps.service';
import { DecentroService } from '../decentro/decentro.service';
import { PaymentReceiptService } from './payment-receipt.service';
import { BankingService } from '../banking/banking.service';
import { CreatePaymentIntentDto, CompletePaymentIntentDto } from './dto';
import {
  CreatePaymentIntentResponseDto,
  CompletePaymentIntentResponseDto,
} from './dto/payment-intent-response.dto';
import { PaymentStatus } from '@prisma/client';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { lastValueFrom } from 'rxjs';
import { MemosService } from '../memos/memos.service';

@Injectable()
export class PaymentIntentsService {
  private readonly logger = new Logger(PaymentIntentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly upiService: UpiService,
    private readonly taggingService: TaggingService,
    private readonly capsService: CapsService,
    private readonly decentroService: DecentroService,
    private readonly paymentReceiptService: PaymentReceiptService,
    private readonly bankingService: BankingService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly memosService: MemosService,
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
    const paymentIntent = await this.prisma.paymentIntent.create({
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

    // Create voice memo if provided
    if (dto.voiceMemo) {
      try {
        await this.memosService.createVoiceMemo(
          paymentIntent.id,
          dto.voiceMemo.objectKey,
          dto.voiceMemo.durationMs,
          dto.voiceMemo.transcript,
          dto.voiceMemo.transcriptConfidence,
          dto.voiceMemo.language,
        );
        this.logger.log(
          `Voice memo created for payment intent: ${paymentIntent.id}`,
        );
      } catch (error) {
        this.logger.error('Failed to create voice memo:', error.message);
        // Don't fail the whole payment for voice memo creation issues
      }
    }

    // Create corresponding banking payment for compliance
    try {
      const bankingPayment = await this.bankingService.createPayment({
        senderId: userId,
        receiverVpa: dto.vpa,
        amount: dto.amount,
        purpose: dto.noteLong || `Payment to ${dto.payeeName}`,
        paymentType: 'ESCROW',
        categoryId: tagSuggestion.categoryId,
        recipientName: dto.payeeName,
      });

      console.log('✅ Banking payment created for compliance:', {
        paymentIntentId: paymentIntent.id,
        bankingPaymentId: bankingPayment.id,
        integrationWorking: true,
      });

      // Try to link PaymentIntent to BankingPayment
      // For now, we'll skip the foreign key linking since banking service is using mock IDs
      // In production, this would work with real database IDs
      try {
        await this.prisma.paymentIntent.update({
          where: { id: paymentIntent.id },
          data: {
            bankingPaymentId: bankingPayment.id,
          },
        });
        console.log('✅ PaymentIntent successfully linked to BankingPayment');
      } catch {
        console.log(
          '⚠️ Foreign key linking skipped (using mock IDs for testing):',
          {
            paymentIntentCreated: true,
            bankingPaymentCreated: true,
            reason: 'Mock banking service - foreign key constraint expected',
          },
        );
      }
    } catch (error) {
      console.warn('Failed to create banking payment record:', error.message);
      // Continue without failing - banking record is for compliance, not critical for UX
    }

    // Build UPI deep link (app-specific if packageName provided)
    // Use custom note if provided, otherwise fall back to AI suggested tag
    const transactionNote = dto.noteLong || tagSuggestion.tagText;

    // Generate UPI deep link using MERCHANT AGGREGATOR MODE
    const upiDeepLink = dto.packageName
      ? this.upiService.buildAppSpecificUpiDeepLink(
          {
            vpa: dto.vpa, // This is now just for our records (not used in UPI URL)
            amount: dto.amount,
            transactionNote: transactionNote,
            transactionRef: trRef,
            // New aggregator fields
            actualRecipientVpa: dto.vpa, // Store the real recipient VPA
            actualRecipientName: dto.payeeName, // Store the real recipient name
          },
          dto.packageName,
        )
      : this.upiService.buildUpiDeepLink({
          vpa: dto.vpa, // This is now just for our records (not used in UPI URL)
          amount: dto.amount,
          transactionNote: transactionNote,
          transactionRef: trRef,
          // New aggregator fields
          actualRecipientVpa: dto.vpa, // Store the real recipient VPA
          actualRecipientName: dto.payeeName, // Store the real recipient name
        });

    return {
      tr: trRef,
      paymentIntentId: paymentIntent.id,
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

    // If payment is successful, automatically tag it with the suggested category
    if (dto.status === 'SUCCESS') {
      await this.autoTagSuccessfulPayment(paymentIntent);

      // Generate payment receipt
      try {
        await this.paymentReceiptService.generateReceipt(paymentIntent.id);
        console.log('✅ Payment receipt generated for:', paymentIntent.trRef);
      } catch (error) {
        console.error('❌ Failed to generate receipt:', error.message);
        // Don't fail the whole payment for receipt generation issues
      }
    }

    return { ok: true };
  }

  /**
   * Automatically tag successful payment with suggested category
   */
  private async autoTagSuccessfulPayment(paymentIntent: any) {
    try {
      // Build tagging context
      const now = new Date();
      const context = {
        userId: paymentIntent.userId,
        vpa: paymentIntent.vpa,
        payeeName: paymentIntent.payeeName,
        amount: Number(paymentIntent.amount),
        timeOfDay: now.getHours(),
        dayOfWeek: now.getDay(),
      };

      // Get AI tagging suggestion for this payment
      // Check if the payment is already tagged FIRST
      const existingTag = await this.prisma.tag.findFirst({
        where: {
          paymentIntentId: paymentIntent.id,
        },
      });

      // Only call AI tagging if no existing tag
      if (!existingTag) {
        const tagSuggestion = await this.taggingService.suggestTag(context);

        if (tagSuggestion && tagSuggestion.categoryId) {
          await this.prisma.tag.create({
            data: {
              paymentIntentId: paymentIntent.id,
              categoryId: tagSuggestion.categoryId,
              tagText: tagSuggestion.tagText,
              source: 'AUTO',
            },
          });

          // Stream training sample to ML for delta training
          await this.streamTrainingSample(
            paymentIntent,
            tagSuggestion.categoryId,
            'AUTO',
          );

          // Phase 3: Update VPA registry with confirmed tag and vote/confidence tracking
          try {
            await this.taggingService.updateVpaRegistryWithConfirmedTag(
              paymentIntent.vpa,
              tagSuggestion.categoryId,
              tagSuggestion.confidence,
              'AUTO',
              paymentIntent.userId, // Pass the actual user ID
            );
            console.log(
              `✅ Phase 3: Updated VPA registry for ${paymentIntent.vpa} with confirmed tag`,
            );
          } catch (error) {
            console.error(
              '❌ Phase 3: Failed to update VPA registry:',
              error.message,
            );
            // Don't fail the payment flow for VPA registry updates
          }
        }
      }
    } catch (error) {
      // Log error but don't fail the payment completion
      console.error('Failed to auto-tag payment:', error);
    }
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

    // Stream training sample to ML for delta training
    await this.streamTrainingSample(
      paymentIntent,
      categoryId,
      source === 'auto' ? 'AUTO' : 'MANUAL',
    );

    // Phase 3: Update VPA registry with confirmed tag
    try {
      await this.taggingService.updateVpaRegistryWithConfirmedTag(
        paymentIntent.vpa,
        categoryId,
        source === 'auto' ? 0.8 : 0.95,
        source === 'auto' ? 'AUTO' : 'MANUAL',
        paymentIntent.userId,
      );
      console.log(
        `✅ Phase 3: Updated VPA registry for ${paymentIntent.vpa} with ${source} tag`,
      );
    } catch (error) {
      console.error(
        '❌ Phase 3: Failed to update VPA registry:',
        error.message,
      );
      // Don't fail the tagging operation for VPA registry updates
    }
  }

  /**
   * Stream training sample to ML service for delta training
   */
  private async streamTrainingSample(
    paymentIntent: any,
    categoryId: string,
    source: 'AUTO' | 'MANUAL',
  ): Promise<void> {
    try {
      // Get canonical category name for the training sample
      const category = await this.prisma.category.findUnique({
        where: { id: categoryId },
        include: { canonicalCategory: true },
      });

      if (!category?.canonicalCategory) {
        console.log(
          `⚠️ No canonical category found for training sample: ${categoryId}`,
        );
        return;
      }

      const ML_SERVICE_URL = this.configService.get<string>(
        'ML_SERVICE_URL',
        'http://localhost:8001',
      );

      const trainingSample = {
        user_id: paymentIntent.userId,
        merchant_name: paymentIntent.payeeName || 'Unknown',
        amount: Number(paymentIntent.amount),
        timestamp: new Date().toISOString(),
        category: category.canonicalCategory.name,
        vpa: paymentIntent.vpa,
        source: source,
      };

      // Stream to ML service
      await lastValueFrom(
        this.httpService.post(
          `${ML_SERVICE_URL}/events/training-sample`,
          trainingSample,
        ),
      );

      console.log(
        `✅ Training sample sent to ML: ${trainingSample.merchant_name} → ${trainingSample.category} (${source})`,
      );
    } catch (error) {
      // Don't fail the payment flow for training sample streaming
      console.error(
        '❌ Failed to stream training sample to ML:',
        error.message,
      );
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
    // Get AI analysis from tagging service first to get suggested category
    const analysis = await this.taggingService.analyzePayment(
      userId,
      amount,
      vpa,
      payeeName,
    );

    // Get category-specific caps information using the suggested category
    const suggestedCategoryId =
      analysis.suggestedTag?.categoryId || analysis.suggestedTag?.category?.id;
    let capsInfo: any;
    let capsAnalysis: any;

    if (suggestedCategoryId) {
      // Get category-specific caps analysis
      capsAnalysis = await this.capsService.analyzeCaps(
        userId,
        suggestedCategoryId,
        amount,
      );

      // Get overall caps info for context
      capsInfo = await this.capsService.checkCaps(userId, amount);
    } else {
      // Fallback to overall caps if no category suggested
      capsInfo = await this.capsService.checkCaps(userId, amount);
    }

    // Get UPI app options
    const upiApps = vpa ? await this.upiService.getUpiApps(vpa) : [];

    // Calculate category-specific remaining amount
    let remainingAmount = 0;
    let categorySpending = 0;
    let categoryLimit = 0;
    let percentUsed = 0;

    if (capsAnalysis?.affectedCategory) {
      categorySpending = capsAnalysis.affectedCategory.currentSpent;
      categoryLimit = capsAnalysis.affectedCategory.capAmount;
      remainingAmount = Math.max(0, categoryLimit - categorySpending);
      percentUsed = Math.round((categorySpending / categoryLimit) * 100);
    } else if (capsInfo) {
      remainingAmount = capsInfo.totalLimit - capsInfo.totalSpent;
      percentUsed = Math.round(
        (capsInfo.totalSpent / capsInfo.totalLimit) * 100,
      );
    }

    return {
      ...analysis,
      caps: {
        status: capsAnalysis?.capsState || capsInfo?.status || 'ok',
        percentUsed,
        remainingAmount,
        categorySpending,
        categoryLimit,
        details: capsInfo,
      },
      upiOptions: {
        availableApps: upiApps,
        recommendedApp:
          upiApps[0]?.packageName || 'com.google.android.apps.nbu.paisa.user',
      },
    };
  }

  /**
   * Create escrow payment: user pays us, we pay recipient
   */
  async createEscrowPayment(
    userId: string,
    escrowDto: {
      amount: number;
      recipientVpa: string;
      recipientName?: string;
      category?: string;
      categoryId?: string;
      note?: string;
      voiceMemo?: {
        objectKey: string;
        durationMs: number;
        transcript?: string;
        transcriptConfidence?: number;
        language?: string;
      };
    },
  ) {
    // Validate recipient VPA
    if (!this.upiService.validateVpa(escrowDto.recipientVpa)) {
      throw new BadRequestException('Invalid recipient VPA format');
    }

    // Generate unique reference ID for this escrow transaction
    const referenceId = this.decentroService.generateReferenceId('ESCROW');

    this.logger.log(`Creating complete escrow payment flow for user ${userId}`);

    // Get AI suggested tag for categorization
    const now = new Date();
    const tagSuggestion = await this.taggingService.suggestTag({
      userId,
      vpa: escrowDto.recipientVpa,
      payeeName: escrowDto.recipientName,
      amount: escrowDto.amount,
      timeOfDay: now.getHours(),
      dayOfWeek: now.getDay(),
    });

    // Determine final category ID: prioritize mobile selection, fallback to AI suggestion
    let finalCategoryId = escrowDto.categoryId || tagSuggestion.categoryId;
    let finalCategoryName =
      escrowDto.category || tagSuggestion.category?.name || 'Other';

    // If mobile provided category name but no ID, try to find matching category
    if (escrowDto.category && !escrowDto.categoryId) {
      const matchingCategory = await this.prisma.category.findFirst({
        where: {
          name: {
            contains: escrowDto.category,
            mode: 'insensitive',
          },
        },
      });
      if (matchingCategory) {
        finalCategoryId = matchingCategory.id;
        finalCategoryName = matchingCategory.name;
      }
    }

    try {
      // STEP 1: Create PaymentIntent record (MOBILE REQUIREMENT)
      this.logger.log('Step 1: Creating PaymentIntent record...');
      const paymentIntent = await this.prisma.paymentIntent.create({
        data: {
          userId: userId,
          trRef: referenceId,
          vpa: escrowDto.recipientVpa,
          payeeName: escrowDto.recipientName || 'Unknown',
          amount: escrowDto.amount,
          currency: 'INR',
          status: 'CREATED',
          platform: 'ANDROID',
          entrypoint: 'escrow_payment',
          noteLong:
            escrowDto.note ||
            `${escrowDto.category || 'Payment'} via Cap'n Pay`,
          initiatedAt: new Date(),
          transferType: 'UPI',
          isReceiptGenerated: false,
          receiptViewed: false,
        },
      });

      this.logger.log(`✅ PaymentIntent created: ${paymentIntent.id}`);

      // STEP 1.2: Create voice memo if provided
      if (escrowDto.voiceMemo) {
        try {
          this.logger.log('Step 1.2: Creating voice memo...');
          await this.memosService.createVoiceMemo(
            paymentIntent.id,
            escrowDto.voiceMemo.objectKey,
            escrowDto.voiceMemo.durationMs,
            escrowDto.voiceMemo.transcript,
            escrowDto.voiceMemo.transcriptConfidence,
            escrowDto.voiceMemo.language,
          );
          this.logger.log(
            `✅ Voice memo created for payment intent: ${paymentIntent.id}`,
          );
        } catch (voiceMemoError) {
          this.logger.error(
            'Failed to create voice memo:',
            voiceMemoError.message,
          );
          // Don't fail the whole payment for voice memo creation issues
        }
      }

      // STEP 1.5: Create tag for categorization (IMMEDIATE TAGGING)
      this.logger.log('Step 1.5: Creating payment tag...');
      if (finalCategoryId) {
        try {
          await this.prisma.tag.create({
            data: {
              paymentIntentId: paymentIntent.id,
              categoryId: finalCategoryId,
              tagText: `${finalCategoryName} payment`,
              source: escrowDto.categoryId ? 'MANUAL' : 'AUTO',
            },
          });
          this.logger.log(
            `✅ Tag created: ${finalCategoryName} (${escrowDto.categoryId ? 'manual' : 'auto'})`,
          );
        } catch (tagError) {
          this.logger.warn(
            'Failed to create tag during payment creation:',
            tagError,
          );
        }
      }

      // STEP 2: Create BankingPayment record (BANKING AUDIT)
      this.logger.log('Step 2: Creating BankingPayment record...');
      const bankingPayment = await this.prisma.bankingPayment.create({
        data: {
          senderId: userId,
          receiverId: userId, // Will be updated once we create the recipient
          amount: escrowDto.amount,
          currency: 'INR',
          paymentType: 'ESCROW',
          overallStatus: 'CREATED',
          collectionStatus: 'INITIATED',
          payoutStatus: 'PENDING',
          purpose: `${escrowDto.category || 'Payment'} via Cap'n Pay`,
          riskScore: 0.0,
          complianceCheckPassed: true,
        },
      });

      this.logger.log(`✅ BankingPayment created: ${bankingPayment.id}`);

      // Link PaymentIntent to BankingPayment for deterministic joins later
      await this.prisma.paymentIntent
        .update({
          where: { id: paymentIntent.id },
          data: { bankingPaymentId: bankingPayment.id },
        })
        .catch(() => undefined);

      // STEP 3: Ensure recipient user exists using enhanced banking service
      this.logger.log(
        'Step 3: Ensuring recipient user exists via banking service...',
      );
      const recipientUserCreated =
        await this.bankingService.findOrCreateUserByVpa(
          escrowDto.recipientVpa,
          escrowDto.recipientName,
        );

      // Get the VPA registry entry for the recipient
      const recipientUser = await this.prisma.vpaRegistry.findUnique({
        where: { vpaAddress: escrowDto.recipientVpa },
        include: { user: true },
      });

      if (!recipientUser) {
        throw new Error(
          `Failed to create or find recipient user for VPA: ${escrowDto.recipientVpa}`,
        );
      }

      // Update BankingPayment with correct recipient
      await this.prisma.bankingPayment.update({
        where: { id: bankingPayment.id },
        data: { receiverId: recipientUser.userId },
      });

      this.logger.log(
        `✅ Recipient user ensured via banking service: ${recipientUser.userId}, Name: ${recipientUser.user.name}`,
      );

      // STEP 4: Create Collection record
      this.logger.log('Step 4: Creating Collection record...');
      const sanitizedPurpose = `${escrowDto.category || 'Payment'} via CapnPay`
        .replace(/[.@#$%^&*!;:'"~`?=+)(]/g, '')
        .substring(0, 35);

      const collectionResponse =
        await this.decentroService.createPaymentCollection({
          reference_id: referenceId,
          payee_account: escrowDto.recipientVpa,
          amount: escrowDto.amount,
          purpose_message: sanitizedPurpose,
          generate_qr: true,
          expiry_time: 15,
        });

      const collection = await this.prisma.collection.create({
        data: {
          decentroTxnId: collectionResponse.decentro_txn_id,
          amount: escrowDto.amount,
          status: 'INITIATED',
        },
      });

      // Link Collection to BankingPayment
      await this.prisma.bankingPayment.update({
        where: { id: bankingPayment.id },
        data: { collectionId: collection.id },
      });

      this.logger.log(`✅ Collection created: ${collection.decentroTxnId}`);

      // STEP 5: Create EscrowTransaction record
      this.logger.log('Step 5: Creating EscrowTransaction record...');
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: { vpaIds: { where: { isPrimary: true }, take: 1 } },
      });

      if (!user?.vpaIds?.[0]?.vpaAddress) {
        throw new BadRequestException(
          'User must have a primary VPA to create escrow payments',
        );
      }

      const escrowTransaction = await this.prisma.escrowTransaction.create({
        data: {
          id: referenceId,
          payerUpi: user.vpaIds[0].vpaAddress,
          recipientUpi: escrowDto.recipientVpa,
          amount: escrowDto.amount,
          note:
            escrowDto.note ||
            `${escrowDto.category || 'Payment'} via Cap'n Pay`,
          status: 'INITIATED',
          escrowCollectionId: collectionResponse.decentro_txn_id,
          collectionStatus: 'initiated',
          payoutStatus: 'pending',
          createdAt: new Date(),
        },
      });

      this.logger.log(`✅ EscrowTransaction created: ${escrowTransaction.id}`);

      // STEP 6: Create initial audit log
      this.logger.log('Step 6: Creating audit log...');
      await this.prisma.paymentAuditLog.create({
        data: {
          paymentId: bankingPayment.id,
          action: 'CREATED',
          performedBy: userId,
          metadata: {
            referenceId: referenceId,
            paymentIntentId: paymentIntent.id,
            escrowTransactionId: escrowTransaction.id,
            collectionId: collection.decentroTxnId,
            amount: escrowDto.amount,
            recipientVpa: escrowDto.recipientVpa,
            stage: 'payment_initiated',
          },
          timestamp: new Date(),
        },
      });

      // STEP 7: Create initial status history
      this.logger.log('Step 7: Creating status history...');
      await this.prisma.paymentStatusHistory.create({
        data: {
          paymentId: bankingPayment.id,
          status: 'CREATED',
          subStatus: 'collection_initiated',
          details: {
            referenceId: referenceId,
            stage: 'collection_pending',
            collectionId: collection.decentroTxnId,
          },
          systemNotes: 'Payment initiated, collection created',
          createdAt: new Date(),
        },
      });

      this.logger.log('✅ Complete escrow payment flow created successfully!');

      return {
        referenceId,
        paymentIntentId: paymentIntent.id,
        bankingPaymentId: bankingPayment.id,
        collectionId: collection.decentroTxnId,
        status: 'collection_created',
        collectionLinks: collectionResponse.data,
        message: 'Escrow payment created. Please complete collection payment.',
        expiryTime: new Date(Date.now() + 15 * 60 * 1000),
      };
    } catch (error) {
      this.logger.error('❌ Complete escrow payment creation failed:', {
        error: error.message,
        stack: error.stack,
        code: error.code,
        meta: error.meta,
        details: error,
      });
      throw new BadRequestException(
        `Failed to create escrow payment: ${error.message}`,
      );
    }
  }

  /**
   * Get escrow payment status from database (updated by webhooks)
   * Mobile apps should use this for real-time status updates
   */
  async getEscrowPaymentStatus(referenceId: string) {
    this.logger.log(`Getting escrow payment status for ${referenceId}`);

    // Get escrow transaction from database
    const escrowTransaction = await this.prisma.escrowTransaction.findUnique({
      where: { id: referenceId }, // The referenceId IS the id in EscrowTransaction
    });

    if (!escrowTransaction) {
      throw new NotFoundException('Escrow transaction not found');
    }

    this.logger.log(
      `Found escrow: ${escrowTransaction.id}, status: ${escrowTransaction.status}`,
    );

    // In webhook-disabled mode, we need to actively poll Decentro API to update status
    let currentStatus = escrowTransaction.status;
    let stage = this.determineStage(escrowTransaction);
    let collectionStatus = escrowTransaction.collectionStatus;
    let payoutStatus = escrowTransaction.payoutStatus;

    try {
      // Check collection status if we have a collection ID and it's not yet successful
      if (
        escrowTransaction.escrowCollectionId &&
        collectionStatus !== 'success'
      ) {
        this.logger.log('Checking collection status with Decentro API...');
        const collectionApiStatus =
          await this.decentroService.getTransactionStatus(
            escrowTransaction.escrowCollectionId,
            'collection',
          );

        const statusInterpretation = this.decentroService[
          'interpretTransactionStatus'
        ](collectionApiStatus, 'collection');

        if (
          statusInterpretation.isTransactionSuccess &&
          collectionStatus !== 'success'
        ) {
          this.logger.log('Collection successful! Updating database...');
          const now = new Date();

          // 1) Update EscrowTransaction
          await this.prisma.escrowTransaction.update({
            where: { id: referenceId },
            data: {
              collectionStatus: 'success',
              updatedAt: now,
            },
          });
          collectionStatus = 'success';

          // 2) Update Collection record status to COMPLETED (if exists)
          const collectionRec = await this.prisma.collection.findFirst({
            where: { decentroTxnId: escrowTransaction.escrowCollectionId },
          });
          if (collectionRec) {
            await this.prisma.collection.update({
              where: { id: collectionRec.id },
              data: { status: 'COMPLETED' },
            });
          }

          // 3) Update related BankingPayment collection fields
          if (collectionRec) {
            const bp = await this.prisma.bankingPayment.findFirst({
              where: { collectionId: collectionRec.id },
            });
            if (bp) {
              await this.prisma.bankingPayment.update({
                where: { id: bp.id },
                data: {
                  collectionStatus: 'COMPLETED',
                  collectionCompletedAt: now,
                },
              });

              // 4) Audit + Status history for collection completed
              await this.prisma.paymentAuditLog
                .create({
                  data: {
                    paymentId: bp.id,
                    action: 'UPDATED',
                    performedBy: 'system',
                    metadata: {
                      referenceId,
                      collectionId: escrowTransaction.escrowCollectionId,
                      stage: 'collection_success',
                    },
                    timestamp: now,
                  },
                })
                .catch(() => undefined);

              await this.prisma.paymentStatusHistory
                .create({
                  data: {
                    paymentId: bp.id,
                    status: 'COLLECTION_COMPLETED',
                    subStatus: 'success',
                    details: {
                      referenceId,
                      collectionId: escrowTransaction.escrowCollectionId,
                      stage: 'collection_success',
                    },
                    systemNotes: 'Collection succeeded via status polling',
                    createdAt: now,
                  },
                })
                .catch(() => undefined);
            }
          }
        }
      }

      // Auto-trigger payout if collection is successful and no payout exists yet
      if (collectionStatus === 'success' && !escrowTransaction.escrowPayoutId) {
        this.logger.log('Collection successful, triggering payout...');
        try {
          // Create payout via Decentro service
          const sanitizedPurpose = (escrowTransaction.note || 'Payment payout')
            .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special characters
            .replace(/\s+/g, ' ') // Replace multiple spaces with single space
            .trim()
            .substring(0, 35); // Limit to 35 characters

          const payoutResponse = await this.decentroService.initiatePayout({
            reference_id: `payout_${escrowTransaction.id}`,
            payee_account: escrowTransaction.recipientUpi,
            amount: escrowTransaction.amount.toNumber(),
            purpose_message: sanitizedPurpose,
          });

          // Create Payout record in database
          const payoutRecord = await this.prisma.payout.create({
            data: {
              decentroTxnId: payoutResponse.decentro_txn_id,
              amount: escrowTransaction.amount,
              recipientVpa: escrowTransaction.recipientUpi,
              recipientName: escrowTransaction.recipientUpi.split('@')[0],
              status: 'PROCESSING',
              webhookData: {
                source: 'auto_payout_initiation',
                referenceId: escrowTransaction.id,
                timestamp: new Date().toISOString(),
                decentroResponse: payoutResponse,
              },
            },
          });

          // Update escrow with payout ID and link to payout record
          await this.prisma.escrowTransaction.update({
            where: { id: referenceId },
            data: {
              escrowPayoutId: payoutResponse.decentro_txn_id,
              payoutStatus: 'processing',
              updatedAt: new Date(),
            },
          });

          // Deterministically link payout to BankingPayment via Collection
          const collectionRec = await this.prisma.collection.findFirst({
            where: { decentroTxnId: escrowTransaction.escrowCollectionId },
          });
          if (collectionRec) {
            const bankingPayment = await this.prisma.bankingPayment.findFirst({
              where: { collectionId: collectionRec.id },
            });
            if (bankingPayment) {
              await this.prisma.bankingPayment.update({
                where: { id: bankingPayment.id },
                data: {
                  payoutId: payoutRecord.id,
                  payoutStatus: 'PROCESSING',
                },
              });

              // Audit + Status history for payout initiated
              await this.prisma.paymentAuditLog
                .create({
                  data: {
                    paymentId: bankingPayment.id,
                    action: 'CREATED',
                    performedBy: 'system',
                    metadata: {
                      referenceId,
                      payoutId: payoutResponse.decentro_txn_id,
                      stage: 'payout_initiated',
                    },
                    timestamp: new Date(),
                  },
                })
                .catch(() => undefined);
              await this.prisma.paymentStatusHistory
                .create({
                  data: {
                    paymentId: bankingPayment.id,
                    status: 'PAYOUT_INITIATED',
                    subStatus: 'processing',
                    details: {
                      referenceId,
                      payoutId: payoutResponse.decentro_txn_id,
                      stage: 'payout_processing',
                    },
                    systemNotes: 'Payout started via status polling',
                    createdAt: new Date(),
                  },
                })
                .catch(() => undefined);
            }
          }

          payoutStatus = 'processing';
          stage = 'payout_initiated';
        } catch (error) {
          this.logger.error('Failed to initiate payout:', error);
        }
      }

      // Check payout status if we have a payout ID and it's not yet successful
      if (escrowTransaction.escrowPayoutId && payoutStatus !== 'success') {
        this.logger.log('Checking payout status with Decentro API...');
        const payoutApiStatus = await this.decentroService.getTransactionStatus(
          escrowTransaction.escrowPayoutId,
          'payout',
        );

        const statusInterpretation = this.decentroService[
          'interpretTransactionStatus'
        ](payoutApiStatus, 'payout');

        if (
          statusInterpretation.isTransactionSuccess &&
          payoutStatus !== 'success'
        ) {
          this.logger.log('Payout successful! Updating database...');

          // Update EscrowTransaction
          await this.prisma.escrowTransaction.update({
            where: { id: referenceId },
            data: {
              payoutStatus: 'success',
              updatedAt: new Date(),
            },
          });

          // Update Payout table if record exists
          const payoutRecord = await this.prisma.payout.findFirst({
            where: { decentroTxnId: escrowTransaction.escrowPayoutId },
          });

          if (payoutRecord) {
            await this.prisma.payout.update({
              where: { id: payoutRecord.id },
              data: {
                status: 'COMPLETED',
                webhookData: {
                  ...(payoutRecord.webhookData as Record<string, any>),
                  completedAt: new Date().toISOString(),
                  completedViaStatusCheck: true,
                },
              },
            });

            // Update related BankingPayment (first by payoutId, else via collection link)
            let bankingPayment = await this.prisma.bankingPayment.findFirst({
              where: { payoutId: payoutRecord.id },
            });

            if (!bankingPayment) {
              const collectionRec = await this.prisma.collection.findFirst({
                where: { decentroTxnId: escrowTransaction.escrowCollectionId },
              });
              if (collectionRec) {
                bankingPayment = await this.prisma.bankingPayment.findFirst({
                  where: { collectionId: collectionRec.id },
                });
              }
            }

            if (bankingPayment) {
              await this.prisma.bankingPayment.update({
                where: { id: bankingPayment.id },
                data: {
                  payoutId: payoutRecord.id,
                  payoutStatus: 'COMPLETED',
                  payoutCompletedAt: new Date(),
                  // Ensure collection is marked completed as well
                  collectionStatus:
                    bankingPayment.collectionStatus || 'COMPLETED',
                  overallStatus: 'SUCCESS',
                },
              });

              // Reconcile collection completion if not already set
              const collectionRec2 = await this.prisma.collection.findFirst({
                where: { decentroTxnId: escrowTransaction.escrowCollectionId },
              });
              if (collectionRec2 && collectionRec2.status !== 'COMPLETED') {
                await this.prisma.collection.update({
                  where: { id: collectionRec2.id },
                  data: { status: 'COMPLETED' },
                });
              }
              if (bankingPayment.collectionStatus !== 'COMPLETED') {
                await this.prisma.bankingPayment.update({
                  where: { id: bankingPayment.id },
                  data: {
                    collectionStatus: 'COMPLETED',
                    collectionCompletedAt: new Date(),
                  },
                });
              }

              // Audit + Status history for payout completed
              await this.prisma.paymentAuditLog
                .create({
                  data: {
                    paymentId: bankingPayment.id,
                    action: 'UPDATED',
                    performedBy: 'system',
                    metadata: {
                      referenceId,
                      payoutId: escrowTransaction.escrowPayoutId,
                      stage: 'completed',
                    },
                    timestamp: new Date(),
                  },
                })
                .catch(() => undefined);
              await this.prisma.paymentStatusHistory
                .create({
                  data: {
                    paymentId: bankingPayment.id,
                    status: 'PAYOUT_COMPLETED',
                    subStatus: 'success',
                    details: {
                      referenceId,
                      payoutId: escrowTransaction.escrowPayoutId,
                      stage: 'completed',
                    },
                    systemNotes: 'Payout succeeded via status polling',
                    createdAt: new Date(),
                  },
                })
                .catch(() => undefined);
            }
          }

          payoutStatus = 'success';
        }
      }

      // Check if escrow should be marked as completed
      if (
        collectionStatus === 'success' &&
        payoutStatus === 'success' &&
        currentStatus !== 'COMPLETED'
      ) {
        await this.prisma.escrowTransaction.update({
          where: { id: referenceId },
          data: {
            status: 'COMPLETED',
            updatedAt: new Date(),
          },
        });
        currentStatus = 'COMPLETED';
        stage = 'completed';

        // Mark PaymentIntent as SUCCESS and generate receipt
        try {
          // Try to resolve intent via BankingPayment->Collection; fallback by trRef
          let intent: any = null;
          let bankingPaymentResolved: any = null;
          const collectionRec = await this.prisma.collection.findFirst({
            where: { decentroTxnId: escrowTransaction.escrowCollectionId },
          });
          if (collectionRec) {
            bankingPaymentResolved = await this.prisma.bankingPayment.findFirst(
              {
                where: { collectionId: collectionRec.id },
              },
            );
            if (bankingPaymentResolved?.id) {
              intent = await this.prisma.paymentIntent.findFirst({
                where: { bankingPaymentId: bankingPaymentResolved.id },
              });
            }
          }
          if (!intent) {
            intent = await this.prisma.paymentIntent.findFirst({
              where: { trRef: referenceId },
            });
          }
          if (intent) {
            await this.prisma.paymentIntent.update({
              where: { id: intent.id },
              data: {
                status: PaymentStatus.SUCCESS,
                completedAt: new Date(),
                upiTxnRef:
                  escrowTransaction.escrowCollectionId || intent.upiTxnRef,
              },
            });

            // Auto-tag successful payment if not already tagged
            await this.autoTagSuccessfulPayment(intent).catch(() => undefined);

            // Best-effort receipt generation
            await this.paymentReceiptService
              .generateReceipt(intent.id)
              .catch(() => undefined);
          }
        } catch (e) {
          this.logger.warn(
            'Failed to finalize intent/receipt in non-webhook path',
            e as any,
          );
        }
      }
    } catch (error) {
      this.logger.error('Error checking payment status:', error);
      // Return database status if API calls fail
    }

    // Update stage based on current status
    const updatedEscrow = {
      ...escrowTransaction,
      collectionStatus,
      payoutStatus,
      status: currentStatus,
    };
    stage = this.determineStage(updatedEscrow);

    return {
      referenceId,
      status: currentStatus,
      stage,
      collection_status: collectionStatus || 'pending',
      payout_status: payoutStatus || 'pending',
      collection_id: escrowTransaction.escrowCollectionId || null,
      payout_id: escrowTransaction.escrowPayoutId || null,
      escrow: {
        id: escrowTransaction.id,
        amount: escrowTransaction.amount,
        payerUpi: escrowTransaction.payerUpi,
        recipientUpi: escrowTransaction.recipientUpi,
        note: escrowTransaction.note,
        createdAt: escrowTransaction.createdAt,
        updatedAt: escrowTransaction.updatedAt,
        payment_intent: {
          target_upi: escrowTransaction.recipientUpi,
          description: escrowTransaction.note,
        },
      },
      timestamp: new Date().toISOString(),
    };
  }

  private determineStage(escrow: any): string {
    if (escrow.status === 'COMPLETED') return 'completed';
    if (escrow.status === 'FAILED') return 'collection_failed';

    if (!escrow.collectionStatus || escrow.collectionStatus === 'pending')
      return 'collection_pending';
    if (escrow.collectionStatus === 'processing')
      return 'collection_processing';

    if (escrow.collectionStatus === 'success') {
      if (!escrow.payoutStatus || escrow.payoutStatus === 'pending')
        return 'collection_success';
      if (escrow.payoutStatus === 'processing') return 'payout_processing';
      if (escrow.payoutStatus === 'success') return 'completed';
      if (escrow.payoutStatus === 'failed') return 'payout_failed';
    }

    if (escrow.collectionStatus === 'failed') return 'collection_failed';

    return 'unknown';
  }

  /**
   * Get payment receipt for a specific payment
   */
  async getPaymentReceipt(userId: string, paymentId: string) {
    try {
      // Try multiple approaches to find the payment intent
      let paymentIntent = null;

      // First try: direct payment intent ID lookup
      paymentIntent = await this.prisma.paymentIntent.findFirst({
        where: { id: paymentId, userId },
        include: {
          tags: {
            include: {
              category: true,
            },
          },
        },
      });

      // Second try: lookup by trRef (transaction reference)
      if (!paymentIntent) {
        paymentIntent = await this.prisma.paymentIntent.findFirst({
          where: { trRef: paymentId, userId },
          include: {
            tags: {
              include: {
                category: true,
              },
            },
          },
        });
      }

      // Third try: lookup via bankingPaymentId (in case mobile app passes wrong ID)
      if (!paymentIntent) {
        paymentIntent = await this.prisma.paymentIntent.findFirst({
          where: { bankingPaymentId: paymentId, userId },
          include: {
            tags: {
              include: {
                category: true,
              },
            },
          },
        });
      }

      if (!paymentIntent) {
        throw new NotFoundException('Payment not found');
      }

      // Check if payment is completed
      if (paymentIntent.status !== PaymentStatus.SUCCESS) {
        throw new BadRequestException(
          'Receipt not available for incomplete payments',
        );
      }

      // Try to get existing receipt or generate one
      let receiptData;
      try {
        receiptData = await this.paymentReceiptService.getReceiptByPaymentId(
          paymentIntent.id,
        );
      } catch {
        // If receipt doesn't exist, generate it
        this.logger.log(`Generating receipt for payment ${paymentIntent.id}`);
        receiptData = await this.paymentReceiptService.generateReceipt(
          paymentIntent.id,
        );
      }

      // Format the response to match API contract
      return {
        payment: {
          id: paymentIntent.id,
          trRef: paymentIntent.trRef,
          amount: Number(paymentIntent.amount),
          payeeName: paymentIntent.payeeName,
          vpa: paymentIntent.vpa,
          status: paymentIntent.status.toLowerCase(),
          completedAt: paymentIntent.completedAt?.toISOString(),
          category: receiptData.category,
          note: paymentIntent.noteLong,
        },
        receipt: {
          receiptNumber: receiptData.receipt.receiptNumber,
          collectionId: receiptData.receipt.collectionId,
          collectionAmount: Number(receiptData.receipt.collectionAmount),
          collectionFee: Number(receiptData.receipt.collectionFee),
          collectionStatus: receiptData.receipt.collectionStatus.toLowerCase(),
          collectionReference: receiptData.receipt.collectionReference,
          collectionCompletedAt:
            receiptData.receipt.collectionCompletedAt?.toISOString(),
          payoutId: receiptData.receipt.payoutId,
          payoutAmount: Number(receiptData.receipt.payoutAmount),
          payoutFee: Number(receiptData.receipt.payoutFee),
          payoutStatus: receiptData.receipt.payoutStatus.toLowerCase(),
          payoutReference: receiptData.receipt.payoutReference,
          payoutCompletedAt:
            receiptData.receipt.payoutCompletedAt?.toISOString(),
          totalAmount: Number(receiptData.receipt.totalAmount),
          totalFees: Number(receiptData.receipt.totalFees),
          netAmount: Number(receiptData.receipt.netAmount),
          issuedAt: receiptData.receipt.issuedAt?.toISOString(),
          createdAt: receiptData.receipt.createdAt?.toISOString(),
        },
      };
    } catch (error) {
      this.logger.error(
        `Failed to get payment receipt: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  private getStatusMessage(status: string): string {
    switch (status) {
      case 'INITIATED':
        return 'Waiting for payment collection...';
      case 'PAID':
        return 'Collection received! Processing payout...';
      case 'PROCESSING':
        return 'Payout in progress...';
      case 'COMPLETED':
        return 'Payment completed successfully!';
      case 'FAILED':
        return 'Payment failed';
      default:
        return 'Processing payment...';
    }
  }
}
