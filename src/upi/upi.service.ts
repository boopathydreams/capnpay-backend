import { Injectable } from '@nestjs/common';

export interface UpiApp {
  name: string;
  packageName: string;
  icon: string;
  isInstalled?: boolean;
}

export interface UpiPaymentParams {
  vpa: string; // This will be the USER'S recipient VPA (for our records)
  payeeName?: string;
  amount: number;
  transactionNote?: string;
  transactionRef: string;
  currency?: string;
  // New fields for merchant aggregator mode
  actualRecipientVpa?: string; // The real recipient (stored in DB, not used in UPI URL)
  actualRecipientName?: string; // The real recipient name (stored in DB)
}

@Injectable()
export class UpiService {
  // Merchant VPA Configuration (Payment Aggregator Mode)
  private readonly MERCHANT_VPA =
    'altaradiustechnologiesprivatelimited.ibz@icici';
  private readonly MERCHANT_NAME =
    'M/S.ALTARADIUS TECHNOLOGIES PRIVATE LIMITED';
  private readonly MERCHANT_CODE = '4816';
  private readonly ORG_ID = '000000';

  /**
   * Build UPI deep link for payment aggregator - MERCHANT MODE
   * User enters recipient VPA but payment goes to our merchant account
   * We'll transfer to actual recipient later from our backend
   */
  buildUpiDeepLink(params: UpiPaymentParams): string {
    const {
      amount,
      transactionNote,
      transactionRef,
      currency = 'INR',
      // Note: actualRecipientVpa and actualRecipientName are stored in DB, not used in UPI URL
    } = params;

    // PAYMENT AGGREGATOR MODE: Always use our merchant VPA
    const encodedParams = new URLSearchParams();
    encodedParams.set('pa', this.MERCHANT_VPA); // OUR merchant VPA (not user's recipient)
    encodedParams.set('pn', this.MERCHANT_NAME); // OUR merchant name
    encodedParams.set('am', amount.toFixed(2)); // Amount
    encodedParams.set('cu', currency); // Currency
    //encodedParams.set('tr', transactionRef); // Transaction reference (for tracking)
    //encodedParams.set('mc', this.MERCHANT_CODE); // Merchant code (makes it explicitly merchant transaction)

    // Add transaction note if provided
    if (transactionNote && transactionNote.trim()) {
      encodedParams.set(
        'tn',
        encodeURIComponent(transactionNote.substring(0, 50)),
      );
    }

    // MERCHANT MODE: We can add callback URL since we're explicitly a merchant
    // encodedParams.set('url', 'capnpay://payment-result');

    console.log(
      `💳 Generated MERCHANT UPI URL with aggregator VPA: ${this.MERCHANT_VPA}`,
    );
    console.log(
      `📝 Actual recipient (stored separately): ${params.actualRecipientVpa}`,
    );

    return `upi://pay?${encodedParams.toString()}`;
  }

  /**
   * Build app-specific UPI deep link for payment aggregator
   * Now that we're using merchant mode, we can use app-specific schemes again
   */
  buildAppSpecificUpiDeepLink(
    params: UpiPaymentParams,
    packageName: string,
  ): string {
    return this.buildUpiDeepLink(params);

    // MERCHANT/AGGREGATOR MODE: Use app-specific schemes for better UX
    // Since we're explicitly using merchant parameters, no need to avoid merchant detection
    console.log(
      `� Using merchant mode with app-specific scheme for ${packageName}`,
    );

    switch (packageName) {
      case 'com.google.android.apps.nbu.paisa.user':
        return this.buildGooglePayDeepLink(params);
      case 'com.phonepe.app':
        return this.buildPhonePeDeepLink(params);
      case 'net.one97.paytm':
        return this.buildPaytmDeepLink(params);
      case 'in.amazon.mShop.android.shopping':
        return this.buildAmazonPayDeepLink(params);
      case 'in.org.npci.upiapp':
        return this.buildBhimDeepLink(params);
      default:
        return this.buildUpiDeepLink(params);
    }
  }

  /**
   * Google Pay specific deep link - MERCHANT AGGREGATOR MODE
   * URL Scheme: gpay://upi/pay
   * Uses our merchant VPA instead of user's recipient VPA
   */
  private buildGooglePayDeepLink(params: UpiPaymentParams): string {
    const {
      amount,
      transactionNote,
      transactionRef,
      currency = 'INR',
    } = params;

    // Google Pay is extremely strict - use URLSearchParams for proper encoding
    const searchParams = new URLSearchParams();

    // Required parameters - MERCHANT/AGGREGATOR MODE
    searchParams.set('pa', this.MERCHANT_VPA); // OUR merchant VPA (not user's recipient)
    searchParams.set('pn', this.MERCHANT_NAME); // OUR merchant name
    searchParams.set('am', amount.toFixed(2)); // Amount with 2 decimals
    searchParams.set('cu', currency); // Currency code
    searchParams.set('tr', transactionRef); // Transaction reference
    searchParams.set('mc', this.MERCHANT_CODE); // Our merchant code (explicit merchant transaction)
    searchParams.set('orgid', this.ORG_ID); // Our organization ID (for Google Pay)

    if (transactionNote && transactionNote.trim()) {
      // Google Pay is very strict about transaction notes - keep it simple
      const cleanNote = transactionNote
        .replace(/[^a-zA-Z0-9\s]/g, '') // Remove special chars including hyphens
        .replace(/\s+/g, ' ') // Normalize spaces
        .trim()
        .substring(0, 30); // Shorter limit for Google Pay compatibility

      if (cleanNote) {
        searchParams.set('tn', cleanNote);
      }
    }

    // MERCHANT MODE: Add callback URL since we're explicitly a merchant
    // searchParams.set('url', 'capnpay://payment-result');

    const finalUrl = `gpay://upi/pay?${searchParams.toString()}`;

    console.log('� Google Pay MERCHANT URL:', {
      merchantVpa: this.MERCHANT_VPA,
      merchantName: this.MERCHANT_NAME,
      amount: amount.toFixed(2),
      transactionRef,
      actualRecipient: params.actualRecipientVpa, // The real recipient (stored separately)
      finalUrl,
      urlBreakdown: {
        encodedParams: searchParams.toString(),
        hasSpaces: finalUrl.includes(' '),
        hasMerchantCode: finalUrl.includes('mc='),
        hasCallbackUrl: finalUrl.includes('url='),
      },
    });

    return finalUrl;
  }

  /**
   * Build alternative Google Pay deep links for testing
   * Returns an object with multiple URL variations
   */
  buildGooglePayAlternatives(params: UpiPaymentParams): {
    primary: string;
    legacy: string;
    generic: string;
  } {
    const {
      vpa,
      payeeName,
      amount,
      transactionNote,
      transactionRef,
      currency = 'INR',
    } = params;

    // Clean parameters
    const cleanPayeeName = payeeName
      ?.replace(/[^a-zA-Z0-9\s]/g, '')
      .trim()
      .substring(0, 50);
    const cleanNote = transactionNote
      ?.replace(/[^a-zA-Z0-9\s]/g, '')
      .trim()
      .substring(0, 50);

    // Build query parameters
    const baseParams = [
      `pa=${vpa}`,
      `am=${amount.toFixed(2)}`,
      `cu=${currency}`,
      `tr=${transactionRef}`,
    ];

    if (cleanPayeeName) baseParams.push(`pn=${cleanPayeeName}`);
    if (cleanNote) baseParams.push(`tn=${cleanNote}`);

    const queryString = baseParams.join('&');

    return {
      primary: `gpay://upi/pay?${queryString}`, // Modern Google Pay
      legacy: `tez://upi/pay?${queryString}`, // Legacy Google Pay (Tez)
      generic: `upi://pay?${queryString}`, // Generic UPI
    };
  }

  /**
   * PhonePe specific deep link - PEER-TO-PEER MODE
   * URL Scheme: phonepe://upi/pay
   */
  private buildPhonePeDeepLink(params: UpiPaymentParams): string {
    const {
      vpa,
      payeeName,
      amount,
      transactionNote,
      transactionRef,
      currency = 'INR',
    } = params;

    // URL encode all parameters to handle special characters and spaces
    const encodedParams = new URLSearchParams();
    encodedParams.set('pa', this.MERCHANT_VPA);
    encodedParams.set('pn', this.MERCHANT_NAME);
    encodedParams.set('am', amount.toFixed(2));
    encodedParams.set('cu', currency);
    encodedParams.set('tr', transactionRef);
    encodedParams.set('mc', this.MERCHANT_CODE); // Our merchant code (explicit merchant transaction)
    encodedParams.set('orgid', this.ORG_ID); // Our organization ID (for Google Pay)

    // CRITICAL: No callback URL for P2P mode
    // DO NOT ADD: encodedParams.set('url', 'capnpay://payment-result');

    if (transactionNote) {
      encodedParams.set('tn', transactionNote.substring(0, 50));
    }

    return `phonepe://upi/pay?${encodedParams.toString()}`;
  }

  /**
   * Paytm specific deep link - PEER-TO-PEER MODE
   * URL Scheme: paytmmp://pay
   */
  private buildPaytmDeepLink(params: UpiPaymentParams): string {
    const {
      vpa,
      payeeName,
      amount,
      transactionNote,
      transactionRef,
      currency = 'INR',
    } = params;

    // URL encode all parameters to handle special characters and spaces
    const encodedParams = new URLSearchParams();
    encodedParams.set('pa', encodeURIComponent(vpa));
    encodedParams.set('am', amount.toFixed(2));
    encodedParams.set('cu', currency);
    encodedParams.set('tr', encodeURIComponent(transactionRef));

    // CRITICAL: No callback URL for P2P mode
    // DO NOT ADD: encodedParams.set('url', 'capnpay://payment-result');

    if (payeeName) {
      encodedParams.set('pn', encodeURIComponent(payeeName.substring(0, 50)));
    }

    if (transactionNote) {
      encodedParams.set(
        'tn',
        encodeURIComponent(transactionNote.substring(0, 50)),
      );
    }

    return `paytmmp://pay?${encodedParams.toString()}`;
  }

  /**
   * Amazon Pay specific deep link - PEER-TO-PEER MODE
   * URL Scheme: amazonpay://upi/pay
   */
  private buildAmazonPayDeepLink(params: UpiPaymentParams): string {
    const {
      vpa,
      payeeName,
      amount,
      transactionNote,
      transactionRef,
      currency = 'INR',
    } = params;

    // URL encode all parameters to handle special characters and spaces
    const encodedParams = new URLSearchParams();
    encodedParams.set('pa', encodeURIComponent(vpa));
    encodedParams.set('am', amount.toFixed(2));
    encodedParams.set('cu', currency);
    encodedParams.set('tr', encodeURIComponent(transactionRef));

    // CRITICAL: No callback URL for P2P mode
    // DO NOT ADD: encodedParams.set('url', 'capnpay://payment-result');

    if (payeeName) {
      encodedParams.set('pn', encodeURIComponent(payeeName.substring(0, 50)));
    }

    if (transactionNote) {
      encodedParams.set(
        'tn',
        encodeURIComponent(transactionNote.substring(0, 50)),
      );
    }

    return `amazonpay://upi/pay?${encodedParams.toString()}`;
  }

  /**
   * BHIM specific deep link - PEER-TO-PEER MODE
   * URL Scheme: bhim://upi/pay
   */
  private buildBhimDeepLink(params: UpiPaymentParams): string {
    const {
      vpa,
      payeeName,
      amount,
      transactionNote,
      transactionRef,
      currency = 'INR',
    } = params;

    // URL encode all parameters to handle special characters and spaces
    const encodedParams = new URLSearchParams();
    encodedParams.set('pa', encodeURIComponent(vpa));
    encodedParams.set('am', amount.toFixed(2));
    encodedParams.set('cu', currency);
    encodedParams.set('tr', encodeURIComponent(transactionRef));

    // CRITICAL: No callback URL for P2P mode
    // DO NOT ADD: encodedParams.set('url', 'capnpay://payment-result');

    if (payeeName) {
      encodedParams.set('pn', encodeURIComponent(payeeName.substring(0, 50)));
    }

    if (transactionNote) {
      encodedParams.set(
        'tn',
        encodeURIComponent(transactionNote.substring(0, 50)),
      );
    }

    return `bhim://upi/pay?${encodedParams.toString()}`;
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
