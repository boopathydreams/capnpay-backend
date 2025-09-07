import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  BankingPayment,
  User,
  UserType,
  PaymentType,
  CollectionStatus,
  PayoutStatus,
  AuditAction,
  RiskLevel,
} from '@prisma/client';
import * as crypto from 'crypto';

export interface CreatePaymentRequest {
  senderId: string;
  receiverVpa: string;
  amount: number;
  purpose?: string;
  paymentType?: PaymentType;
  transferType?: 'UPI' | 'RTGS' | 'IMPS' | 'NEFT' | 'NACH';
  categoryId?: string;
}

export interface VpaLookupResult {
  userId: string;
  vpaAddress: string;
  isVerified: boolean;
  riskLevel: RiskLevel;
  userType: UserType;
}

@Injectable()
export class BankingService {
  private readonly logger = new Logger(BankingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a banking-standard payment with proper sender/receiver relationships
   */
  async createPayment(request: CreatePaymentRequest): Promise<BankingPayment> {
    this.logger.log(
      `Creating banking payment: ${request.senderId} -> ${request.receiverVpa} ₹${request.amount}`,
    );

    // 1. Validate sender
    const sender = await this.prisma.user.findUnique({
      where: { id: request.senderId },
      include: { vpaIds: true },
    });

    if (!sender) {
      throw new NotFoundException(`Sender user not found: ${request.senderId}`);
    }

    // 2. Find or create receiver based on VPA
    const receiver = await this.findOrCreateUserByVpa(request.receiverVpa);

    // 3. Calculate risk score
    const riskScore = await this.calculateRiskScore(
      sender,
      receiver,
      request.amount,
    );

    // 4. Create banking payment record
    const payment = await this.prisma.bankingPayment.create({
      data: {
        id: this.generatePaymentId(),
        senderId: sender.id,
        receiverId: receiver.id,
        amount: request.amount,
        transferType: request.transferType || 'UPI', // Default to UPI transfers
        paymentType: request.paymentType || PaymentType.P2P,
        purpose: request.purpose,
        categoryId: request.categoryId,
        riskScore,
        complianceCheckPassed: riskScore < 0.7, // Compliance check based on risk
      },
      include: {
        sender: true,
        receiver: true,
      },
    });

    // 5. Create audit log
    await this.createAuditLog({
      paymentId: payment.id,
      action: AuditAction.CREATED,
      toStatus: 'CREATED',
      metadata: {
        senderVpa: sender.primaryVpa,
        receiverVpa: request.receiverVpa,
        riskScore,
        paymentType: request.paymentType || 'P2P',
      },
      performedBy: sender.id,
    });

    // 6. Create initial status history
    await this.createStatusHistory({
      paymentId: payment.id,
      status: 'CREATED',
      details: {
        initialAmount: request.amount,
        purpose: request.purpose,
      },
      systemNotes: 'Payment created successfully',
    });

    this.logger.log(`Banking payment created: ${payment.id}`);
    return payment;
  }

  /**
   * Find existing user by VPA or create new VPA-only user
   */
  async findOrCreateUserByVpa(vpaAddress: string): Promise<User> {
    // First check VPA registry
    const vpaRecord = await this.prisma.vpaRegistry.findUnique({
      where: { vpaAddress },
      include: { user: true },
    });

    if (vpaRecord) {
      return vpaRecord.user;
    }

    // Check if user exists with this as primary VPA
    const existingUser = await this.prisma.user.findFirst({
      where: { primaryVpa: vpaAddress },
    });

    if (existingUser) {
      // Add to VPA registry for future lookups
      await this.prisma.vpaRegistry.create({
        data: {
          vpaAddress,
          userId: existingUser.id,
          isPrimary: true,
          isVerified: false, // Needs verification
        },
      });
      return existingUser;
    }

    // Create new VPA-only user
    const newUser = await this.prisma.user.create({
      data: {
        id: this.generateUserId(vpaAddress),
        phoneE164: '+00000000000', // Placeholder for VPA-only users
        userType: UserType.VPA_ONLY,
        primaryVpa: vpaAddress,
        extractedPhone: this.extractPhoneFromVpa(vpaAddress),
        userStatus: 'ACTIVE',
        riskScore: 0.1, // Low initial risk for new VPA users
      },
    });

    // Add to VPA registry
    await this.prisma.vpaRegistry.create({
      data: {
        vpaAddress,
        userId: newUser.id,
        isPrimary: true,
        isVerified: false,
        extractedPhone: this.extractPhoneFromVpa(vpaAddress),
      },
    });

    this.logger.log(
      `Created VPA-only user: ${newUser.id} for VPA: ${vpaAddress}`,
    );
    return newUser;
  }

  /**
   * Update payment collection status
   */
  async updateCollectionStatus(
    paymentId: string,
    collectionId: string,
    status: CollectionStatus,
    txnNo?: string,
    refNo?: string,
  ): Promise<BankingPayment> {
    const payment = await this.prisma.bankingPayment.update({
      where: { id: paymentId },
      data: {
        collectionId,
        collectionStatus: status,
        collectionTxnNo: txnNo,
        collectionRefNo: refNo,
        collectionCompletedAt:
          status === CollectionStatus.COMPLETED ? new Date() : null,
        overallStatus:
          status === CollectionStatus.COMPLETED ? 'SUCCESS' : 'PENDING',
      },
      include: {
        sender: true,
        receiver: true,
      },
    });

    // Create audit log
    await this.createAuditLog({
      paymentId,
      action: AuditAction.STATUS_CHANGED,
      fromStatus: 'CREATED',
      toStatus: status,
      metadata: { collectionId, txnNo, refNo },
      performedBy: 'system',
    });

    // Create status history
    await this.createStatusHistory({
      paymentId,
      status: `COLLECTION_${status}`,
      details: { collectionId, txnNo, refNo },
      systemNotes: `Collection status updated to ${status}`,
    });

    return payment;
  }

  /**
   * Update payment payout status
   */
  async updatePayoutStatus(
    paymentId: string,
    payoutId: string,
    status: PayoutStatus,
    txnNo?: string,
    refNo?: string,
  ): Promise<BankingPayment> {
    const payment = await this.prisma.bankingPayment.update({
      where: { id: paymentId },
      data: {
        payoutId,
        payoutStatus: status,
        payoutTxnNo: txnNo,
        payoutRefNo: refNo,
        payoutCompletedAt:
          status === PayoutStatus.COMPLETED ? new Date() : null,
        overallStatus:
          status === PayoutStatus.COMPLETED ? 'SUCCESS' : 'PENDING',
      },
      include: {
        sender: true,
        receiver: true,
      },
    });

    // Create audit log
    await this.createAuditLog({
      paymentId,
      action: AuditAction.STATUS_CHANGED,
      toStatus: status,
      metadata: { payoutId, txnNo, refNo },
      performedBy: 'system',
    });

    // Create status history
    await this.createStatusHistory({
      paymentId,
      status: `PAYOUT_${status}`,
      details: { payoutId, txnNo, refNo },
      systemNotes: `Payout status updated to ${status}`,
    });

    return payment;
  }

  /**
   * Get comprehensive payment details with audit trail
   */
  async getPaymentDetails(paymentId: string) {
    const payment = await this.prisma.bankingPayment.findUnique({
      where: { id: paymentId },
      include: {
        sender: {
          select: {
            id: true,
            name: true,
            primaryVpa: true,
            userType: true,
            riskScore: true,
          },
        },
        receiver: {
          select: {
            id: true,
            name: true,
            primaryVpa: true,
            userType: true,
            riskScore: true,
          },
        },
        collection: true,
        payout: true,
        refund: true,
        auditLogs: {
          orderBy: { timestamp: 'desc' },
          take: 10,
        },
        statusHistory: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });

    if (!payment) {
      throw new NotFoundException(`Payment not found: ${paymentId}`);
    }

    return payment;
  }

  /**
   * Calculate risk score for a payment
   */
  private async calculateRiskScore(
    sender: User,
    receiver: User,
    amount: number,
  ): Promise<number> {
    let riskScore = 0.0;

    // Base risk from user risk scores
    riskScore += (sender.riskScore?.toNumber() || 0) * 0.3;
    riskScore += (receiver.riskScore?.toNumber() || 0) * 0.2;

    // Amount-based risk
    if (amount > 50000) riskScore += 0.3;
    else if (amount > 10000) riskScore += 0.1;

    // VPA-only receiver adds slight risk
    if (receiver.userType === UserType.VPA_ONLY) {
      riskScore += 0.1;
    }

    // New user risk
    const daysSinceCreation = Math.floor(
      (Date.now() - receiver.createdAt.getTime()) / (1000 * 60 * 60 * 24),
    );
    if (daysSinceCreation < 1) riskScore += 0.2;
    else if (daysSinceCreation < 7) riskScore += 0.1;

    // Cap at 1.0
    return Math.min(riskScore, 1.0);
  }

  /**
   * Create audit log entry
   */
  private async createAuditLog(data: {
    paymentId: string;
    action: AuditAction;
    fromStatus?: string;
    toStatus?: string;
    metadata?: any;
    performedBy?: string;
    ipAddress?: string;
    userAgent?: string;
  }) {
    await this.prisma.paymentAuditLog.create({
      data: {
        id: crypto.randomUUID(),
        ...data,
      },
    });
  }

  /**
   * Create status history entry
   */
  private async createStatusHistory(data: {
    paymentId: string;
    status: string;
    subStatus?: string;
    details?: any;
    systemNotes?: string;
  }) {
    await this.prisma.paymentStatusHistory.create({
      data: {
        id: crypto.randomUUID(),
        ...data,
      },
    });
  }

  /**
   * Generate unique payment ID
   */
  private generatePaymentId(): string {
    const timestamp = Date.now().toString();
    const random = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `BP_${timestamp}_${random}`;
  }

  /**
   * Generate unique user ID for VPA-only users
   */
  private generateUserId(vpaAddress: string): string {
    const vpaHash = crypto
      .createHash('md5')
      .update(vpaAddress)
      .digest('hex')
      .substring(0, 8);
    const timestamp = Date.now().toString().substring(-6);
    return `VPA_${vpaHash}_${timestamp}`;
  }

  /**
   * Attempt to extract phone number from VPA
   */
  private extractPhoneFromVpa(vpaAddress: string): string | null {
    // Common patterns: phone@bank, +91phone@bank, etc.
    const phonePattern = /(\+?91)?(\d{10})@/;
    const match = vpaAddress.match(phonePattern);
    return match ? `+91${match[2]}` : null;
  }

  /**
   * Get user's payment history
   */
  async getUserPaymentHistory(userId: string, limit = 20, offset = 0) {
    return await this.prisma.bankingPayment.findMany({
      where: {
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      include: {
        sender: {
          select: { id: true, name: true, primaryVpa: true },
        },
        receiver: {
          select: { id: true, name: true, primaryVpa: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });
  }

  /**
   * Get VPA registry information
   */
  async getVpaInfo(vpaAddress: string): Promise<VpaLookupResult | null> {
    const vpaRecord = await this.prisma.vpaRegistry.findUnique({
      where: { vpaAddress },
      include: {
        user: {
          select: {
            id: true,
            userType: true,
          },
        },
      },
    });

    if (!vpaRecord) return null;

    return {
      userId: vpaRecord.user.id,
      vpaAddress: vpaRecord.vpaAddress,
      isVerified: vpaRecord.isVerified,
      riskLevel: vpaRecord.riskLevel,
      userType: vpaRecord.user.userType,
    };
  }
}
