import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  PaymentType,
  UserType,
  CollectionStatus,
  PayoutStatus,
  PaymentStatus,
} from '@prisma/client';
import { Subject } from 'rxjs';
import { filter } from 'rxjs/operators';

export interface CreatePaymentRequest {
  senderId: string;
  receiverVpa: string;
  amount: number;
  purpose?: string;
  paymentType?: PaymentType;
  categoryId?: string;
  recipientName?: string;
}

@Injectable()
export class BankingService {
  private readonly logger = new Logger(BankingService.name);
  private readonly updates$ = new Subject<{
    type:
      | 'created'
      | 'collection_update'
      | 'payout_update'
      | 'status_update'
      | 'alert';
    paymentId: string;
    userId: string; // recipient of the event stream
    payload: any;
  }>();

  constructor(private readonly prisma: PrismaService) {}

  getUserUpdates(userId: string) {
    return this.updates$
      .asObservable()
      .pipe(filter((evt) => evt.userId === userId));
  }

  /**
   * Create a banking-standard payment with real database records
   */
  async createPayment(request: CreatePaymentRequest) {
    this.logger.log(
      `Creating banking payment: ${request.senderId} -> ${request.receiverVpa} ₹${request.amount}`,
    );

    try {
      // Step 1: Find or create receiver user based on VPA
      const receiver = await this.findOrCreateUserByVpa(
        request.receiverVpa,
        request.recipientName,
      );

      // Step 2: Validate sender exists
      const sender = await this.prisma.user.findUnique({
        where: { id: request.senderId },
      });

      if (!sender) {
        throw new Error(`Sender user ${request.senderId} not found`);
      }

      // Step 3: Create banking payment record using BankingPayment model
      const payment = await this.prisma.bankingPayment.create({
        data: {
          senderId: request.senderId,
          receiverId: receiver.id,
          amount: request.amount,
          currency: 'INR',
          paymentType: request.paymentType || PaymentType.ESCROW,
          overallStatus: PaymentStatus.CREATED,
          collectionStatus: CollectionStatus.INITIATED,
          payoutStatus: PayoutStatus.PENDING,
          purpose: request.purpose || 'Banking payment',
          categoryId: request.categoryId,
          riskScore: 0.0,
          complianceCheckPassed: true,
        },
      });

      this.logger.log('Banking payment created successfully:', {
        id: payment.id,
        amount: payment.amount,
        receiverCreated: receiver.userType === UserType.VPA_ONLY,
      });

      return {
        id: payment.id,
        senderId: payment.senderId,
        receiverId: payment.receiverId,
        receiverVpa: request.receiverVpa,
        amount: payment.amount,
        currency: payment.currency,
        paymentType: payment.paymentType,
        purpose: payment.purpose,
        status: payment.overallStatus,
        collectionStatus: payment.collectionStatus,
        payoutStatus: payment.payoutStatus,
        createdAt: payment.createdAt,
        receiverIsAppUser: receiver.userType === UserType.APP_USER,
      };
      // Emit to both sender and receiver streams
      this.updates$.next({
        type: 'created',
        paymentId: payment.id,
        userId: request.senderId,
        payload: { id: payment.id, status: payment.overallStatus },
      });
      this.updates$.next({
        type: 'created',
        paymentId: payment.id,
        userId: receiver.id,
        payload: { id: payment.id, status: payment.overallStatus },
      });
    } catch (error) {
      this.logger.error('Failed to create banking payment:', error.message);
      throw error;
    }
  }

  /**
   * Find existing user by VPA or create a new VPA-only user
   */
  async findOrCreateUserByVpa(vpaAddress: string, recipientName?: string) {
    this.logger.log(`Looking up user for VPA: ${vpaAddress}`);

    // First, check VPA registry for existing user
    const vpaEntry = await this.prisma.vpaRegistry.findUnique({
      where: { vpaAddress: vpaAddress },
      include: { user: true },
    });

    if (vpaEntry && vpaEntry.user) {
      this.logger.log(`Found existing user for VPA ${vpaAddress}:`, {
        userId: vpaEntry.user.id,
        userType: vpaEntry.user.userType,
      });

      // Update user name if provided and current name is null/empty
      if (
        recipientName &&
        (!vpaEntry.user.name || vpaEntry.user.name.trim() === '')
      ) {
        const updatedUser = await this.prisma.user.update({
          where: { id: vpaEntry.user.id },
          data: { name: recipientName },
        });
        this.logger.log(`Updated existing user name to: ${recipientName}`);
        return updatedUser;
      }

      return vpaEntry.user;
    }

    // Also check if user has this VPA as primary VPA
    const existingUser = await this.prisma.user.findFirst({
      where: { primaryVpa: vpaAddress },
    });

    if (existingUser) {
      this.logger.log(`Found existing user with primary VPA ${vpaAddress}:`, {
        userId: existingUser.id,
        userType: existingUser.userType,
      });

      // Update user name if provided and current name is null/empty
      if (
        recipientName &&
        (!existingUser.name || existingUser.name.trim() === '')
      ) {
        const updatedUser = await this.prisma.user.update({
          where: { id: existingUser.id },
          data: { name: recipientName },
        });
        this.logger.log(`Updated existing user name to: ${recipientName}`);
        return updatedUser;
      }

      return existingUser;
    }

    // If no user found, create a new VPA-only user
    this.logger.log(`Creating new VPA-only user for VPA: ${vpaAddress}`);

    // Use provided name or extract display name from VPA (e.g., "username@bank" -> "username")
    const displayName =
      recipientName || vpaAddress.split('@')[0] || 'Unknown User';

    // Format phone number: add +91 if it's a 10-digit number
    const phoneNumber = `+91${Math.floor(Math.random() * 10000000000)}`;

    // Simple merchant detection: if VPA contains merchant indicators or amount patterns suggest merchant
    const isMerchant = this.detectMerchantType(vpaAddress, displayName);
    const userType = isMerchant ? UserType.VPA_ONLY : UserType.VPA_ONLY; // For now, all are VPA_ONLY, but we could add MERCHANT type

    const user = await this.prisma.user.create({
      data: {
        phoneE164: phoneNumber,
        name: displayName,
        userType: userType,
        primaryVpa: vpaAddress,
        kycStatus: 'NOT_STARTED',
      },
    });

    // Extract bank name from VPA
    const bankName = this.extractBankFromVpa(vpaAddress);

    // Also create VPA registry entry
    await this.prisma.vpaRegistry.create({
      data: {
        vpaAddress: vpaAddress,
        userId: user.id,
        extractedPhone: null, // No phone extracted from VPA
        bankName: bankName,
        isVerified: false,
        isPrimary: true,
      },
    });

    this.logger.log(`Created new VPA-only user:`, {
      userId: user.id,
      vpa: vpaAddress,
      userType: userType,
      displayName: displayName,
      bankName: bankName,
      isMerchant: isMerchant,
    });

    return user;
  }

  /**
   * Update collection status for a banking payment
   */
  async updateCollectionStatus(
    paymentId: string,
    status: CollectionStatus,
    details?: { collectionId?: string; txnNo?: string; refNo?: string },
  ) {
    this.logger.log(`Updating collection status for ${paymentId}: ${status}`);

    const payment = await this.prisma.bankingPayment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new NotFoundException(`Payment ${paymentId} not found`);
    }

    // Update collection status and timestamp
    const updateData: any = {
      collectionStatus: status,
      updatedAt: new Date(),
    };

    if (status === CollectionStatus.COMPLETED) {
      updateData.collectionCompletedAt = new Date();
    }

    if (details?.collectionId) updateData.collectionId = details.collectionId;
    if (details?.txnNo) updateData.collectionTxnNo = details.txnNo;
    if (details?.refNo) updateData.collectionRefNo = details.refNo;

    const updatedPayment = await this.prisma.bankingPayment.update({
      where: { id: paymentId },
      data: updateData,
    });

    // Update overall status based on collection and payout status
    await this.updateOverallStatus(paymentId);

    // Emit update (we don't know current user; emit to both parties)
    const p = await this.prisma.bankingPayment.findUnique({
      where: { id: paymentId },
    });
    if (p) {
      this.updates$.next({
        type: 'collection_update',
        paymentId,
        userId: p.senderId,
        payload: { collectionStatus: updatedPayment.collectionStatus },
      });
      this.updates$.next({
        type: 'collection_update',
        paymentId,
        userId: p.receiverId,
        payload: { collectionStatus: updatedPayment.collectionStatus },
      });
    }

    return {
      paymentId,
      collectionStatus: updatedPayment.collectionStatus,
      updated: true,
    };
  }

  /**
   * Update payout status for a banking payment
   */
  async updatePayoutStatus(
    paymentId: string,
    status: PayoutStatus,
    details?: { payoutId?: string; txnNo?: string; refNo?: string },
  ) {
    this.logger.log(`Updating payout status for ${paymentId}: ${status}`);

    const payment = await this.prisma.bankingPayment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) {
      throw new NotFoundException(`Payment ${paymentId} not found`);
    }

    // Update payout status and timestamp
    const updateData: any = {
      payoutStatus: status,
      updatedAt: new Date(),
    };

    if (status === PayoutStatus.COMPLETED) {
      updateData.payoutCompletedAt = new Date();
    }

    if (details?.payoutId) updateData.payoutId = details.payoutId;
    if (details?.txnNo) updateData.payoutTxnNo = details.txnNo;
    if (details?.refNo) updateData.payoutRefNo = details.refNo;

    const updatedPayment = await this.prisma.bankingPayment.update({
      where: { id: paymentId },
      data: updateData,
    });

    // Update overall status based on collection and payout status
    await this.updateOverallStatus(paymentId);

    const p2 = await this.prisma.bankingPayment.findUnique({
      where: { id: paymentId },
    });
    if (p2) {
      this.updates$.next({
        type: 'payout_update',
        paymentId,
        userId: p2.senderId,
        payload: { payoutStatus: updatedPayment.payoutStatus },
      });
      this.updates$.next({
        type: 'payout_update',
        paymentId,
        userId: p2.receiverId,
        payload: { payoutStatus: updatedPayment.payoutStatus },
      });
    }

    return {
      paymentId,
      payoutStatus: updatedPayment.payoutStatus,
      updated: true,
    };
  }

  /**
   * Update overall status based on collection and payout status
   */
  private async updateOverallStatus(paymentId: string) {
    const payment = await this.prisma.bankingPayment.findUnique({
      where: { id: paymentId },
    });

    if (!payment) return;

    let newStatus = payment.overallStatus;

    // Logic for overall status based on collection and payout status
    if (
      payment.collectionStatus === CollectionStatus.COMPLETED &&
      payment.payoutStatus === PayoutStatus.COMPLETED
    ) {
      newStatus = PaymentStatus.SUCCESS;
    } else if (
      payment.collectionStatus === CollectionStatus.FAILED ||
      payment.payoutStatus === PayoutStatus.FAILED
    ) {
      newStatus = PaymentStatus.FAILED;
    } else if (
      payment.collectionStatus === CollectionStatus.COMPLETED &&
      payment.payoutStatus === PayoutStatus.PENDING
    ) {
      newStatus = PaymentStatus.PENDING; // Collection done, waiting for payout
    } else if (payment.collectionStatus === CollectionStatus.PROCESSING) {
      newStatus = PaymentStatus.PENDING; // Collection in progress
    }

    if (newStatus !== payment.overallStatus) {
      await this.prisma.bankingPayment.update({
        where: { id: paymentId },
        data: {
          overallStatus: newStatus,
          updatedAt: new Date(),
        },
      });
      // Emit overall status change to both participants
      const pp = await this.prisma.bankingPayment.findUnique({
        where: { id: paymentId },
      });
      if (pp) {
        this.updates$.next({
          type: 'status_update',
          paymentId,
          userId: pp.senderId,
          payload: { status: newStatus },
        });
        this.updates$.next({
          type: 'status_update',
          paymentId,
          userId: pp.receiverId,
          payload: { status: newStatus },
        });
      }
    }
  }

  /**
   * Get collection status for a banking payment (for mobile polling)
   */
  async getCollectionStatus(paymentId: string) {
    this.logger.log(`Getting collection status for ${paymentId}`);

    const payment = await this.prisma.bankingPayment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        collectionStatus: true,
        collectionId: true,
        collectionTxnNo: true,
        collectionRefNo: true,
        collectionCompletedAt: true,
        updatedAt: true,
      },
    });

    if (!payment) {
      throw new NotFoundException(`Payment ${paymentId} not found`);
    }

    return {
      paymentId,
      collectionStatus: payment.collectionStatus,
      collectionId: payment.collectionId,
      collectionTxnNo: payment.collectionTxnNo,
      collectionRefNo: payment.collectionRefNo,
      collectionCompletedAt: payment.collectionCompletedAt,
      updatedAt: payment.updatedAt,
    };
  }

  /**
   * Get payout status for a banking payment (for mobile polling)
   */
  async getPayoutStatus(paymentId: string) {
    this.logger.log(`Getting payout status for ${paymentId}`);

    const payment = await this.prisma.bankingPayment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        payoutStatus: true,
        payoutId: true,
        payoutTxnNo: true,
        payoutRefNo: true,
        payoutCompletedAt: true,
        updatedAt: true,
      },
    });

    if (!payment) {
      throw new NotFoundException(`Payment ${paymentId} not found`);
    }

    return {
      paymentId,
      payoutStatus: payment.payoutStatus,
      payoutId: payment.payoutId,
      payoutTxnNo: payment.payoutTxnNo,
      payoutRefNo: payment.payoutRefNo,
      payoutCompletedAt: payment.payoutCompletedAt,
      updatedAt: payment.updatedAt,
    };
  }

  /**
   * Get complete payment flow status (collection + payout) for webhook-disabled polling
   */
  async getCompletePaymentStatus(paymentId: string) {
    this.logger.log(`Getting complete payment status for ${paymentId}`);

    const payment = await this.prisma.bankingPayment.findUnique({
      where: { id: paymentId },
      select: {
        id: true,
        overallStatus: true,
        collectionStatus: true,
        payoutStatus: true,
        collectionId: true,
        payoutId: true,
        collectionCompletedAt: true,
        payoutCompletedAt: true,
        amount: true,
        updatedAt: true,
      },
    });

    if (!payment) {
      throw new NotFoundException(`Payment ${paymentId} not found`);
    }

    // Auto-trigger payout if collection is completed and payout is still pending
    if (
      payment.collectionStatus === CollectionStatus.COMPLETED &&
      payment.payoutStatus === PayoutStatus.PENDING
    ) {
      this.logger.log(`Auto-triggering payout for payment ${paymentId}...`);
      // This would typically call the payout service
      // For now, we'll just update status to PROCESSING
      await this.prisma.bankingPayment.update({
        where: { id: paymentId },
        data: {
          payoutStatus: PayoutStatus.PROCESSING,
          updatedAt: new Date(),
        },
      });

      // Update the payment object for response
      payment.payoutStatus = PayoutStatus.PROCESSING;
    }

    return {
      paymentId,
      overallStatus: payment.overallStatus,
      collectionStatus: payment.collectionStatus,
      payoutStatus: payment.payoutStatus,
      collectionId: payment.collectionId,
      payoutId: payment.payoutId,
      collectionCompletedAt: payment.collectionCompletedAt,
      payoutCompletedAt: payment.payoutCompletedAt,
      amount: payment.amount,
      updatedAt: payment.updatedAt,
      stage: this.determinePaymentStage(
        payment.collectionStatus,
        payment.payoutStatus,
      ),
    };
  }

  /**
   * Determine the current stage of payment for mobile UI
   */
  private determinePaymentStage(
    collectionStatus: CollectionStatus,
    payoutStatus: PayoutStatus,
  ): string {
    if (
      collectionStatus === CollectionStatus.INITIATED ||
      collectionStatus === CollectionStatus.PROCESSING
    ) {
      return 'collecting';
    }

    if (collectionStatus === CollectionStatus.COMPLETED) {
      if (payoutStatus === PayoutStatus.PENDING) {
        return 'collection_success';
      }
      if (payoutStatus === PayoutStatus.PROCESSING) {
        return 'payout_processing';
      }
      if (payoutStatus === PayoutStatus.COMPLETED) {
        return 'completed';
      }
      if (payoutStatus === PayoutStatus.FAILED) {
        return 'payout_failed';
      }
    }

    if (collectionStatus === CollectionStatus.FAILED) {
      return 'collection_failed';
    }

    return 'unknown';
  }

  /**
   * Get payment details with full information
   */
  async getPaymentDetails(paymentId: string) {
    this.logger.log(`Getting payment details for: ${paymentId}`);

    const payment = await this.prisma.bankingPayment.findUnique({
      where: { id: paymentId },
      include: {
        sender: {
          select: {
            id: true,
            primaryVpa: true,
            userType: true,
            name: true,
          },
        },
        receiver: {
          select: {
            id: true,
            primaryVpa: true,
            userType: true,
            name: true,
          },
        },
      },
    });

    if (!payment) {
      throw new NotFoundException(`Payment ${paymentId} not found`);
    }

    return {
      id: payment.id,
      senderId: payment.senderId,
      receiverId: payment.receiverId,
      sender: payment.sender,
      receiver: payment.receiver,
      amount: payment.amount,
      currency: payment.currency,
      paymentType: payment.paymentType,
      purpose: payment.purpose,
      status: payment.overallStatus,
      collectionStatus: payment.collectionStatus,
      payoutStatus: payment.payoutStatus,
      riskScore: payment.riskScore,
      complianceCheckPassed: payment.complianceCheckPassed,
      createdAt: payment.createdAt,
      updatedAt: payment.updatedAt,
    };
  }

  /**
   * Get user payment history from banking system
   */
  async getUserPaymentHistory(
    userId: string,
    limit: number = 20,
    offset: number = 0,
    from?: string,
    to?: string,
  ) {
    this.logger.log(`Getting payment history for user: ${userId}`);

    let createdAtFilter: any | undefined = undefined;
    try {
      if (from || to) {
        const gte = from ? new Date(from) : undefined;
        const lte = to ? new Date(to) : undefined;
        if (gte || lte)
          createdAtFilter = {
            ...(gte ? { gte } : {}),
            ...(lte ? { lte } : {}),
          };
      }
    } catch {}

    const payments = await this.prisma.bankingPayment.findMany({
      where: {
        OR: [{ senderId: userId }, { receiverId: userId }],
        ...(createdAtFilter ? { createdAt: createdAtFilter } : {}),
      },
      include: {
        sender: {
          select: {
            id: true,
            primaryVpa: true,
            userType: true,
            name: true,
          },
        },
        receiver: {
          select: {
            id: true,
            primaryVpa: true,
            userType: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      skip: offset,
    });

    return {
      userId,
      payments: payments.map((payment) => ({
        id: payment.id,
        amount: payment.amount,
        paymentType: payment.paymentType,
        status: payment.overallStatus,
        createdAt: payment.createdAt,
        isSender: payment.senderId === userId,
        counterparty:
          payment.senderId === userId ? payment.receiver : payment.sender,
      })),
      total: payments.length,
      hasMore: payments.length === limit,
    };
  }

  /**
   * Get VPA information and associated user
   */
  async getVpaInfo(vpaAddress: string) {
    this.logger.log(`Getting VPA info for: ${vpaAddress}`);

    const vpaRegistry = await this.prisma.vpaRegistry.findUnique({
      where: { vpaAddress: vpaAddress },
      include: {
        user: {
          select: {
            id: true,
            userType: true,
            primaryVpa: true,
            name: true,
          },
        },
      },
    });

    if (!vpaRegistry) {
      return {
        vpaAddress,
        exists: false,
        message: 'VPA not found in registry',
      };
    }

    return {
      vpaAddress: vpaRegistry.vpaAddress,
      isVerified: vpaRegistry.isVerified,
      isPrimary: vpaRegistry.isPrimary,
      user: vpaRegistry.user,
      exists: true,
    };
  }

  async setPaymentCategory(paymentId: string, categoryId: string) {
    const payment = await this.prisma.bankingPayment.findUnique({
      where: { id: paymentId },
    });
    if (!payment) throw new NotFoundException(`Payment ${paymentId} not found`);
    const updated = await this.prisma.bankingPayment.update({
      where: { id: paymentId },
      data: { categoryId, updatedAt: new Date() },
    });
    // Emit status update for UI to refresh
    this.updates$.next({
      type: 'status_update',
      paymentId,
      userId: updated.senderId,
      payload: { categoryId },
    });
    this.updates$.next({
      type: 'status_update',
      paymentId,
      userId: updated.receiverId,
      payload: { categoryId },
    });
    return { ok: true };
  }

  /**
   * Helper method to detect if a VPA belongs to a merchant
   */
  private detectMerchantType(vpaAddress: string, displayName: string): boolean {
    const merchantKeywords = [
      'merchant',
      'shop',
      'store',
      'business',
      'company',
      'ltd',
      'pvt',
      'inc',
      'corp',
      'retail',
      'mart',
      'mall',
      'restaurant',
      'cafe',
      'hotel',
      'service',
      'paytm',
      'phonepe',
      'gpay',
      'bhim',
    ];

    const vpaLower = vpaAddress.toLowerCase();
    const nameLower = displayName.toLowerCase();

    return merchantKeywords.some(
      (keyword) => vpaLower.includes(keyword) || nameLower.includes(keyword),
    );
  }

  /**
   * Helper method to extract bank name from VPA
   */
  private extractBankFromVpa(vpaAddress: string): string | null {
    const bankMappings: Record<string, string> = {
      paytm: 'Paytm Payments Bank',
      okhdfcbank: 'HDFC Bank',
      okhdfc: 'HDFC Bank',
      okaxis: 'Axis Bank',
      okicici: 'ICICI Bank',
      oksbi: 'State Bank of India',
      ybl: 'Yes Bank',
      idbi: 'IDBI Bank',
      axl: 'Axis Bank',
      phonepe: 'Yes Bank',
      gpay: 'Google Pay',
      bhim: 'BHIM UPI',
      apl: 'Airtel Payments Bank',
      ibl: 'IndusInd Bank',
      pnb: 'Punjab National Bank',
      boi: 'Bank of India',
      cub: 'City Union Bank',
      federal: 'Federal Bank',
      kotak: 'Kotak Mahindra Bank',
      rbl: 'RBL Bank',
    };

    const handle = vpaAddress.split('@')[1]?.toLowerCase();
    return handle ? bankMappings[handle] || null : null;
  }
}
