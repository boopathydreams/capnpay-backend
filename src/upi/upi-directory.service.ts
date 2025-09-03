import { Injectable } from '@nestjs/common';

export interface UpiDirectoryEntry {
  phone: string;
  vpa: string;
  name: string;
  handle: string;
}

export interface IUpiDirectoryProvider {
  lookupVpaByPhone(phoneE164: string): Promise<UpiDirectoryEntry | null>;
  lookupPhoneByVpa(vpa: string): Promise<UpiDirectoryEntry | null>;
}

/**
 * Mock UPI Directory Service for Development
 * In production, this would integrate with actual UPI directory APIs
 */
@Injectable()
export class MockUpiDirectoryService implements IUpiDirectoryProvider {
  private readonly mockDirectory: Map<string, UpiDirectoryEntry> = new Map();

  constructor() {
    // Seed with mock data for testing
    this.seedMockData();
  }

  private seedMockData(): void {
    const mockEntries: UpiDirectoryEntry[] = [
      {
        phone: '+919876543210',
        vpa: 'john.doe@paytm',
        name: 'John Doe',
        handle: 'paytm',
      },
      {
        phone: '+919994678569',
        vpa: 'boopathy.nr@okicici',
        name: 'Jane Smith',
        handle: 'phonepe',
      },
      {
        phone: '+918765432109',
        vpa: 'jane.smith@phonepe',
        name: 'Jane Smith',
        handle: 'phonepe',
      },
      {
        phone: '+917654321098',
        vpa: 'bob.wilson@ybl',
        name: 'Bob Wilson',
        handle: 'ybl',
      },
      {
        phone: '+916543210987',
        vpa: 'alice.brown@oksbi',
        name: 'Alice Brown',
        handle: 'oksbi',
      },
      {
        phone: '+915432109876',
        vpa: 'zomato@paytm',
        name: 'Zomato',
        handle: 'paytm',
      },
      {
        phone: '+914321098765',
        vpa: 'myntra@phonepe',
        name: 'Myntra',
        handle: 'phonepe',
      },
      {
        phone: '+913210987654',
        vpa: 'uber@ybl',
        name: 'Uber',
        handle: 'ybl',
      },
    ];

    mockEntries.forEach((entry) => {
      this.mockDirectory.set(entry.phone, entry);
      this.mockDirectory.set(entry.vpa, entry);
    });
  }

  async lookupVpaByPhone(phoneE164: string): Promise<UpiDirectoryEntry | null> {
    // Simulate API latency
    await this.simulateDelay(100);

    const entry = this.mockDirectory.get(phoneE164);
    return entry || null;
  }

  async lookupPhoneByVpa(vpa: string): Promise<UpiDirectoryEntry | null> {
    // Simulate API latency
    await this.simulateDelay(100);

    const entry = this.mockDirectory.get(vpa);
    return entry || null;
  }

  /**
   * Add new phone-VPA mapping (for testing)
   */
  async addMapping(entry: UpiDirectoryEntry): Promise<void> {
    this.mockDirectory.set(entry.phone, entry);
    this.mockDirectory.set(entry.vpa, entry);
  }

  /**
   * Get all mock entries (for testing)
   */
  getAllEntries(): UpiDirectoryEntry[] {
    const entries: UpiDirectoryEntry[] = [];
    const seen = new Set<string>();

    for (const entry of this.mockDirectory.values()) {
      if (!seen.has(entry.phone)) {
        entries.push(entry);
        seen.add(entry.phone);
      }
    }

    return entries;
  }

  private async simulateDelay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
