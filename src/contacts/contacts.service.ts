import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RelationshipAnalyzerService } from '../intelligence/relationship-analyzer.service';

export interface ContactRelationship {
  contactPhone: string;
  contactVpa: string;
  contactName: string;
  trustScore: number;
  totalSent: number;
  totalReceived: number;
  transactionCount: number;
  averageAmount: number;
  relationshipType: 'personal' | 'merchant' | 'professional' | 'unknown';
  firstInteraction: Date;
  lastInteraction: Date;
}

export interface ContactTransaction {
  id: string;
  type: 'sent' | 'received';
  amount: number;
  status: 'success' | 'pending' | 'failed';
  timestamp: Date;
  category?: string;
  note?: string;
}

export interface ContactInsights {
  trustScore: number;
  totalSent: number;
  totalReceived: number;
  transactionCount: number;
  averageAmount: number;
  relationshipType: 'personal' | 'merchant' | 'professional' | 'unknown';
  lastInteraction: string;
  frequencyScore: number;
  consistencyScore: number;
  reciprocityScore: number;
  riskLevel: 'low' | 'medium' | 'high';
  recommendedAmount?: number;
  behavioralInsights: string[];
}

@Injectable()
export class ContactsService {
  constructor(
    private prisma: PrismaService,
    private relationshipAnalyzer: RelationshipAnalyzerService,
  ) {}

  /**
   * Get all contacts for a user with relationship data from VPA registry
   */
  async getUserContacts(userId: string): Promise<ContactRelationship[]> {
    try {
      console.log('Getting contacts for user:', userId);

      // Get all payment intents for this user to build contact relationships
      const paymentIntents = await this.prisma.paymentIntent.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });

      // Group by VPA to build contact relationships
      const contactsMap = new Map<string, any>();

      for (const payment of paymentIntents) {
        if (!payment.vpa) continue; // Skip payments without VPA

        const vpaKey = payment.vpa;
        if (!contactsMap.has(vpaKey)) {
          contactsMap.set(vpaKey, {
            contactVpa: payment.vpa,
            contactName: payment.payeeName || 'Unknown Contact',
            contactPhone: null, // We'll try to find this from VPA registry
            totalSent: 0,
            totalReceived: 0,
            transactionCount: 0,
            firstInteraction: payment.createdAt,
            lastInteraction: payment.createdAt,
          });
        }

        const contact = contactsMap.get(vpaKey);
        contact.transactionCount += 1;
        contact.totalSent += Number(payment.amount);
        contact.lastInteraction = payment.createdAt;
        if (payment.createdAt < contact.firstInteraction) {
          contact.firstInteraction = payment.createdAt;
        }
      }

      // Try to find phone numbers and user data from VPA registry
      const vpaList = Array.from(contactsMap.keys());
      const vpaRegistries = await this.prisma.vpaRegistry.findMany({
        where: { vpaAddress: { in: vpaList } },
        include: {
          user: {
            select: {
              primaryVpa: true,
              phoneE164: true,
              name: true,
              id: true,
            },
          },
        },
      });

      // Update contact info with VPA registry data
      for (const vpaRegistry of vpaRegistries) {
        if (contactsMap.has(vpaRegistry.vpaAddress)) {
          const contact = contactsMap.get(vpaRegistry.vpaAddress);
          contact.contactPhone =
            vpaRegistry.extractedPhone ||
            vpaRegistry.user.phoneE164 ||
            'Unknown';
          if (vpaRegistry.user.name) {
            contact.contactName = vpaRegistry.user.name;
          }
        }
      }

      // For VPAs not in registry, try to find from user table directly (backward compatibility)
      const unregisteredVpas = vpaList.filter(
        (vpa) => !vpaRegistries.some((reg) => reg.vpaAddress === vpa),
      );

      if (unregisteredVpas.length > 0) {
        const users = await this.prisma.user.findMany({
          where: { primaryVpa: { in: unregisteredVpas } },
          select: { primaryVpa: true, phoneE164: true, name: true },
        });

        // Update contact info with user data
        for (const user of users) {
          if (user.primaryVpa && contactsMap.has(user.primaryVpa)) {
            const contact = contactsMap.get(user.primaryVpa);
            contact.contactPhone = user.phoneE164 || 'Unknown';
            if (user.name) {
              contact.contactName = user.name;
            }
          }
        }
      }

      // Convert to ContactRelationship format
      const contacts: ContactRelationship[] = Array.from(
        contactsMap.values(),
      ).map((contact) => ({
        contactPhone: contact.contactPhone || 'Unknown',
        contactVpa: contact.contactVpa,
        contactName: contact.contactName,
        trustScore: Math.min(90, Math.max(50, contact.transactionCount * 5)), // Simple trust score
        totalSent: contact.totalSent,
        totalReceived: contact.totalReceived,
        transactionCount: contact.transactionCount,
        averageAmount: contact.totalSent / contact.transactionCount,
        relationshipType:
          contact.transactionCount > 10 ? 'personal' : 'professional',
        firstInteraction: contact.firstInteraction,
        lastInteraction: contact.lastInteraction,
      }));

      console.log(`Found ${contacts.length} contacts for user ${userId}`);
      return contacts;
    } catch (error) {
      console.error('Error fetching user contacts:', error);
      // Return empty array instead of mock data
      return [];
    }
  }

  /**
   * Get transaction history between user and specific contact
   */
  async getContactTransactions(
    userId: string,
    contactVpa: string,
  ): Promise<ContactTransaction[]> {
    // Get all transactions between user and this contact
    const transactions = await this.prisma.paymentIntent.findMany({
      where: {
        userId,
        vpa: contactVpa,
        status: 'SUCCESS', // Only show successful transactions
      },
      include: {
        tags: {
          include: {
            category: true,
          },
        },
      },
      orderBy: {
        completedAt: 'desc',
      },
    });

    return transactions.map((txn) => ({
      id: txn.id,
      type: 'sent', // For now, we only track sent payments
      amount: Number(txn.amount),
      status: txn.status.toLowerCase() as 'success' | 'pending' | 'failed',
      timestamp: txn.completedAt || txn.createdAt,
      category: txn.tags[0]?.category?.name || 'Other',
      note: txn.noteLong || undefined,
    }));
  }

  /**
   * Get contact insights for a specific contact VPA
   */
  async getContactInsights(
    userId: string,
    contactVpa: string,
  ): Promise<ContactInsights> {
    // Get relationship insights from the analyzer service
    const insights = await this.relationshipAnalyzer.getRelationshipInsights(
      userId,
      contactVpa,
    );

    return insights;
  }

  /**
   * Get smart suggestions for a contact based on relationship analysis
   */
  async getSmartSuggestions(
    userId: string,
    contactVpa: string,
  ): Promise<any[]> {
    const insights = await this.getContactInsights(userId, contactVpa);
    const transactions = await this.getContactTransactions(userId, contactVpa);

    const suggestions = [];

    // Amount suggestion based on historical data
    if (insights.averageAmount > 0) {
      suggestions.push({
        id: 'amount_suggestion',
        type: 'amount',
        title: 'Typical Amount',
        description: `Based on your history, you usually send around ₹${insights.averageAmount} to this contact`,
        value: insights.averageAmount,
        confidence: 0.85,
        insights: [
          'Average of recent transactions',
          'Consistent payment pattern',
        ],
        action: 'Use this amount',
      });
    }

    // Timing insights based on transaction patterns
    const eveningTransactions = transactions.filter((tx) => {
      const hour = tx.timestamp.getHours();
      return hour >= 18 && hour <= 22;
    });

    if (eveningTransactions.length > transactions.length * 0.5) {
      suggestions.push({
        id: 'timing_insight',
        type: 'timing',
        title: 'Best Time to Pay',
        description: 'This contact typically responds fastest in the evening',
        confidence: 0.72,
        insights: ['Response time analysis', 'Evening payments 40% faster'],
      });
    }

    // Split bill pattern detection
    const roundAmounts = transactions.filter((tx) => tx.amount % 100 === 0);
    if (roundAmounts.length > transactions.length * 0.6) {
      suggestions.push({
        id: 'split_bill_pattern',
        type: 'context',
        title: 'Split Bill Pattern',
        description:
          'You often split bills with this contact - consider even amounts',
        confidence: 0.68,
        insights: ['Frequent round numbers', 'Mutual payment history'],
      });
    }

    // Risk-based suggestions
    if (insights.trustScore < 60) {
      suggestions.push({
        id: 'risk_warning',
        type: 'behavioral',
        title: 'New Relationship',
        description: 'Consider starting with smaller amounts to build trust',
        confidence: 0.8,
        insights: [
          'Limited payment history',
          'Gradual trust building recommended',
        ],
      });
    }

    return suggestions;
  }

  /**
   * Update contact relationship data after a transaction
   */
  /**
   * Update contact VPA/UPI ID and create user if needed with VPA registry
   */
  async updateContactVpa(
    userId: string,
    contactPhone: string,
    vpa: string,
    contactName?: string,
  ): Promise<{ success: boolean; message: string; contactUserId?: string }> {
    try {
      // First, validate the UPI ID format
      const upiRegex = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z][a-zA-Z0-9.\-_]{2,64}$/;
      if (!upiRegex.test(vpa)) {
        return {
          success: false,
          message: 'Invalid UPI ID format',
        };
      }

      // Format phone number: add +91 if it's a 10-digit number without country code
      let formattedPhone = contactPhone;
      if (contactPhone && /^\d{10}$/.test(contactPhone)) {
        formattedPhone = `+91${contactPhone}`;
      }

      // Check if VPA is already in the VPA registry
      const existingVpaRegistry = await this.prisma.vpaRegistry.findFirst({
        where: { vpaAddress: vpa },
        include: { user: true },
      });

      let contactUserId: string | undefined;

      if (existingVpaRegistry) {
        // VPA already exists in registry
        contactUserId = existingVpaRegistry.userId;
        console.log('🏦 VPA found in registry for user:', contactUserId);

        // Update phone if different and not set
        if (formattedPhone && !existingVpaRegistry.extractedPhone) {
          await this.prisma.vpaRegistry.update({
            where: { id: existingVpaRegistry.id },
            data: { extractedPhone: formattedPhone },
          });
        }

        // Update user name if provided and not already set
        if (contactName && !existingVpaRegistry.user.name) {
          await this.prisma.user.update({
            where: { id: existingVpaRegistry.userId },
            data: { name: contactName },
          });
          console.log('📝 Updated user name to:', contactName);
        }
      } else {
        // Check if user with this phone already exists
        const existingUserWithPhone = await this.prisma.user.findFirst({
          where: { phoneE164: formattedPhone },
        });

        if (existingUserWithPhone) {
          // Update existing user's primary VPA if not set
          if (!existingUserWithPhone.primaryVpa) {
            await this.prisma.user.update({
              where: { id: existingUserWithPhone.id },
              data: {
                primaryVpa: vpa,
                ...(contactName &&
                  !existingUserWithPhone.name && { name: contactName }),
              },
            });
          } else if (contactName && !existingUserWithPhone.name) {
            // Update name if provided and not already set
            await this.prisma.user.update({
              where: { id: existingUserWithPhone.id },
              data: { name: contactName },
            });
            console.log('📝 Updated existing user name to:', contactName);
          }
          contactUserId = existingUserWithPhone.id;
          console.log('📱 Found existing user with phone:', contactUserId);
        } else {
          // Create new user with phone, VPA, and name
          const newUser = await this.prisma.user.create({
            data: {
              phoneE164: formattedPhone,
              primaryVpa: vpa,
              name: contactName || null, // Set the contact name if provided
              userType: 'VPA_ONLY', // Mark as VPA-only user (not full app user)
              isOnboardingComplete: false, // They haven't completed full onboarding
              language: 'en',
              currency: 'INR',
            },
          });
          contactUserId = newUser.id;
          console.log(
            '👤 Created new user with name:',
            contactName,
            'ID:',
            contactUserId,
          );
        }

        // Create VPA registry entry
        await this.prisma.vpaRegistry.create({
          data: {
            vpaAddress: vpa,
            userId: contactUserId,
            extractedPhone: formattedPhone,
            bankName: this.extractBankFromVpa(vpa),
            isPrimary: true, // Mark as primary VPA for this user
            isVerified: false, // Will be verified on first successful transaction
            riskLevel: 'LOW',
          },
        });
        console.log('🏦 Created VPA registry entry for:', vpa);
      }

      // Now find and update payment intents for this contact
      // We'll look for payments where the VPA matches or where we have this phone number
      const existingPayments = await this.prisma.paymentIntent.findMany({
        where: {
          userId: userId,
          OR: [{ vpa: vpa }, { payeeName: { contains: contactPhone } }],
        },
        orderBy: { createdAt: 'desc' },
      });

      // Update payment intents to use the new VPA if needed
      if (existingPayments.length > 0) {
        await this.prisma.paymentIntent.updateMany({
          where: {
            userId: userId,
            OR: [{ vpa: vpa }, { payeeName: { contains: contactPhone } }],
          },
          data: {
            vpa: vpa,
          },
        });
        console.log(`📝 Updated ${existingPayments.length} payment intents`);
      }

      return {
        success: true,
        message: 'Contact VPA updated successfully',
        contactUserId,
      };
    } catch (error) {
      console.error('Error updating contact VPA:', error);
      return {
        success: false,
        message: 'Failed to update contact VPA',
      };
    }
  }

  /**
   * Extract bank name from VPA handle
   */
  private extractBankFromVpa(vpa: string): string {
    const handle = vpa.split('@')[1]?.toLowerCase() || '';

    const bankMappings: { [key: string]: string } = {
      paytm: 'Paytm Payments Bank',
      phonepe: 'YES Bank',
      gpay: 'ICICI Bank',
      googlepay: 'ICICI Bank',
      amazonpay: 'ICICI Bank',
      bharatpe: 'ICICI Bank',
      mobikwik: 'Zaakpay',
      freecharge: 'ICICI Bank',
      ybl: 'YES Bank',
      ibl: 'IDBI Bank',
      axl: 'Axis Bank',
      hdfcbank: 'HDFC Bank',
      icici: 'ICICI Bank',
      sbi: 'State Bank of India',
      okaxis: 'Axis Bank',
      okhdfcbank: 'HDFC Bank',
      okicici: 'ICICI Bank',
      oksbi: 'State Bank of India',
    };

    return bankMappings[handle] || handle.toUpperCase();
  }

  async updateContactRelationship(
    userId: string,
    contactVpa: string,
    transactionAmount: number,
    transactionType: 'sent' | 'received',
    transactionStatus: 'success' | 'failed',
  ): Promise<void> {
    // Update relationship metrics in database
    // This would involve updating trust scores, transaction counts, etc.
    console.log('Updating contact relationship:', {
      userId,
      contactVpa,
      transactionAmount,
      transactionType,
      transactionStatus,
    });
  }

  /**
   * Search contacts by name, phone, or VPA
   */
  async searchContacts(
    userId: string,
    query: string,
  ): Promise<ContactRelationship[]> {
    const allContacts = await this.getUserContacts(userId);

    const filteredContacts = allContacts.filter(
      (contact) =>
        contact.contactName.toLowerCase().includes(query.toLowerCase()) ||
        contact.contactVpa.toLowerCase().includes(query.toLowerCase()) ||
        contact.contactPhone.includes(query),
    );

    return filteredContacts;
  }

  /**
   * Get VPA for a phone number from registry
   */
  async getVpaForPhone(phoneNumber: string): Promise<string | null> {
    try {
      // Format phone number: add +91 if it's a 10-digit number without country code
      let formattedPhone = phoneNumber;
      if (phoneNumber && /^\d{10}$/.test(phoneNumber)) {
        formattedPhone = `+91${phoneNumber}`;
      }

      // First check VPA registry by extracted phone
      const vpaRegistry = await this.prisma.vpaRegistry.findFirst({
        where: { extractedPhone: formattedPhone },
        orderBy: { updatedAt: 'desc' }, // Get most recent entry
      });

      if (vpaRegistry) {
        return vpaRegistry.vpaAddress;
      }

      // Fallback: check user table
      const user = await this.prisma.user.findFirst({
        where: { phoneE164: formattedPhone },
      });

      return user?.primaryVpa || null;
    } catch (error) {
      console.error('Error getting VPA for phone:', error);
      return null;
    }
  }

  /**
   * Check if a contact (phone number) has an associated VPA
   */
  async checkContactHasVpa(phoneNumber: string): Promise<{
    hasVpa: boolean;
    vpa?: string;
    userId?: string;
  }> {
    try {
      // Format phone number: add +91 if it's a 10-digit number without country code
      let formattedPhone = phoneNumber;
      if (phoneNumber && /^\d{10}$/.test(phoneNumber)) {
        formattedPhone = `+91${phoneNumber}`;
      }

      // Check VPA registry first
      const vpaRegistry = await this.prisma.vpaRegistry.findFirst({
        where: { extractedPhone: formattedPhone },
        include: { user: true },
        orderBy: { updatedAt: 'desc' },
      });

      if (vpaRegistry) {
        return {
          hasVpa: true,
          vpa: vpaRegistry.vpaAddress,
          userId: vpaRegistry.userId,
        };
      }

      // Fallback: check user table
      const user = await this.prisma.user.findFirst({
        where: { phoneE164: formattedPhone },
      });

      if (user?.primaryVpa) {
        return {
          hasVpa: true,
          vpa: user.primaryVpa,
          userId: user.id,
        };
      }

      return { hasVpa: false };
    } catch (error) {
      console.error('Error checking contact VPA:', error);
      return { hasVpa: false };
    }
  }
}
