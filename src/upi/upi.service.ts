import { Injectable } from '@nestjs/common';

export interface UpiApp {
  name: string;
  packageName: string;
  icon: string;
  isInstalled?: boolean;
}

export interface UpiPaymentParams {
  vpa: string;
  payeeName?: string;
  amount: number;
  transactionNote?: string;
  transactionRef: string;
  currency?: string;
}

@Injectable()
export class UpiService {
  /**
   * Build UPI deep link for payment intent
   * Format: upi://pay?pa={vpa}&pn={name}&am={amount}&tn={shortNote}&tr={tr}&cu=INR
   */
  buildUpiDeepLink(params: UpiPaymentParams): string {
    const {
      vpa,
      payeeName,
      amount,
      transactionNote,
      transactionRef,
      currency = 'INR',
    } = params;

    // Build query parameters
    const queryParams = new URLSearchParams();
    queryParams.set('pa', vpa); // Payee VPA
    queryParams.set('am', amount.toFixed(2)); // Amount
    queryParams.set('cu', currency); // Currency
    queryParams.set('tr', transactionRef); // Transaction reference

    if (payeeName) {
      // Limit payee name to 50 chars for UPI compatibility
      queryParams.set('pn', payeeName.substring(0, 50));
    }

    if (transactionNote) {
      // Limit transaction note to 50 chars for UPI compatibility
      queryParams.set('tn', transactionNote.substring(0, 50));
    }

    return `upi://pay?${queryParams.toString()}`;
  }

  /**
   * Validate VPA format
   * Format: identifier@handle (e.g., user@paytm, 1234567890@ybl)
   */
  validateVpa(vpa: string): boolean {
    const vpaRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/;
    return vpaRegex.test(vpa) && vpa.length <= 255;
  }

  /**
   * Extract handle from VPA
   * e.g., user@paytm -> paytm
   */
  getVpaHandle(vpa: string): string | null {
    if (!this.validateVpa(vpa)) {
      return null;
    }
    return vpa.split('@')[1];
  }

  /**
   * Generate transaction reference
   * Format: tr_timestamp_random
   */
  generateTransactionRef(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `tr_${timestamp}_${random}`;
  }

  /**
   * Get available UPI apps for a given VPA
   * Returns app-specific recommendations based on VPA handle
   */
  async getUpiApps(vpa: string): Promise<UpiApp[]> {
    const handle = this.getVpaHandle(vpa);
    const allApps: UpiApp[] = [
      {
        name: 'Google Pay',
        packageName: 'com.google.android.apps.nbu.paisa.user',
        icon: '🔵',
        isInstalled: true, // Mock data
      },
      {
        name: 'PhonePe',
        packageName: 'com.phonepe.app',
        icon: '🟣',
        isInstalled: true,
      },
      {
        name: 'Paytm',
        packageName: 'net.one97.paytm',
        icon: '🔷',
        isInstalled: true,
      },
      {
        name: 'Amazon Pay',
        packageName: 'in.amazon.mShop.android.shopping',
        icon: '🟠',
        isInstalled: false,
      },
      {
        name: 'BHIM',
        packageName: 'in.org.npci.upiapp',
        icon: '🟢',
        isInstalled: true,
      },
    ];

    // Reorder based on VPA handle preference
    if (handle) {
      const handlePreferences = {
        ybl: ['com.phonepe.app', 'com.google.android.apps.nbu.paisa.user'],
        okaxis: ['com.google.android.apps.nbu.paisa.user'],
        paytm: ['net.one97.paytm', 'com.google.android.apps.nbu.paisa.user'],
        apl: [
          'in.amazon.mShop.android.shopping',
          'com.google.android.apps.nbu.paisa.user',
        ],
      };

      const preferred = handlePreferences[handle] || [];
      return allApps.sort((a, b) => {
        const aIndex = preferred.indexOf(a.packageName);
        const bIndex = preferred.indexOf(b.packageName);

        if (aIndex === -1 && bIndex === -1) return 0;
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;

        return aIndex - bIndex;
      });
    }

    return allApps;
  }
}
