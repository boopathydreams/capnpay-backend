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
   * Get all contacts for a user with relationship data
   */
  async getUserContacts(userId: string): Promise<ContactRelationship[]> {
    // For now, return mock data - replace with actual Prisma queries
    const mockContacts: ContactRelationship[] = [
      {
        contactPhone: '+919876543210',
        contactVpa: 'john.doe@paytm',
        contactName: 'John Doe',
        trustScore: 85,
        totalSent: 2500,
        totalReceived: 300,
        transactionCount: 12,
        averageAmount: 650,
        relationshipType: 'personal',
        firstInteraction: new Date('2024-01-15'),
        lastInteraction: new Date(),
      },
      {
        contactPhone: '+919876543211',
        contactVpa: 'alice.smith@phonepe',
        contactName: 'Alice Smith',
        trustScore: 92,
        totalSent: 4200,
        totalReceived: 1800,
        transactionCount: 18,
        averageAmount: 750,
        relationshipType: 'personal',
        firstInteraction: new Date('2023-08-20'),
        lastInteraction: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
      {
        contactPhone: '+919876543212',
        contactVpa: 'zomato.payments@paytm',
        contactName: 'Zomato',
        trustScore: 78,
        totalSent: 3200,
        totalReceived: 0,
        transactionCount: 24,
        averageAmount: 450,
        relationshipType: 'merchant',
        firstInteraction: new Date('2024-03-10'),
        lastInteraction: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      },
      {
        contactPhone: '+919876543213',
        contactVpa: 'uber.india@paytm',
        contactName: 'Uber',
        trustScore: 71,
        totalSent: 1800,
        totalReceived: 0,
        transactionCount: 15,
        averageAmount: 220,
        relationshipType: 'merchant',
        firstInteraction: new Date('2024-02-01'),
        lastInteraction: new Date(Date.now() - 2 * 60 * 60 * 1000),
      },
    ];

    return mockContacts;
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
   * Get comprehensive relationship insights for a specific contact
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
}
