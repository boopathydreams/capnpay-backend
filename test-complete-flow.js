const fetch = require('node-fetch');

const API_BASE_URL = 'http://localhost:3000';

class CapnPayTester {
  constructor() {
    this.authToken = null;
    this.userId = null;
  }

  async log(message, data = null) {
    console.log(`🔍 ${message}`);
    if (data) {
      console.log('   📊', JSON.stringify(data, null, 2));
    }
  }

  async makeRequest(endpoint, options = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${JSON.stringify(data)}`);
      }

      return data;
    } catch (error) {
      throw new Error(`Request failed: ${error.message}`);
    }
  }

  async requestOTP() {
    await this.log('Step 1: Requesting OTP for +919876543210');

    const response = await this.makeRequest('/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({
        phone: '+919876543210',
      }),
    });

    await this.log('OTP Request Success', response);
    return response.devCode; // For development, we get the OTP code
  }

  async verifyOTP(code) {
    await this.log(`Step 2: Verifying OTP with code: ${code}`);

    const response = await this.makeRequest('/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({
        phone: '+919876543210',
        code: code,
      }),
    });

    this.authToken = response.accessToken;
    await this.log('OTP Verification Success', { hasToken: !!this.authToken });
    return response;
  }

  async completeOnboarding() {
    await this.log('Step 3: Completing onboarding');

    const response = await this.makeRequest('/onboarding/complete', {
      method: 'POST',
      body: JSON.stringify({
        name: 'Test User',
        salary: 50000,
        totalBudget: 25000,
        categories: [
          {
            name: 'Food & Dining',
            color: '#EF4444',
            amount: 10000,
            percentage: 40,
            description: 'Meals, groceries, restaurants',
          },
          {
            name: 'Transport',
            color: '#3B82F6',
            amount: 5000,
            percentage: 20,
            description: 'Cab, bus, metro, fuel',
          },
          {
            name: 'Entertainment',
            color: '#8B5CF6',
            amount: 5000,
            percentage: 20,
            description: 'Movies, games, subscriptions',
          },
          {
            name: 'Others',
            color: '#6B7280',
            amount: 5000,
            percentage: 20,
            description: 'Miscellaneous expenses',
          },
        ],
      }),
    });

    await this.log('Onboarding Complete', response);
    return response;
  }

  async createPayment() {
    await this.log('Step 4: Creating a payment intent');

    const response = await this.makeRequest('/pay-intents', {
      method: 'POST',
      body: JSON.stringify({
        amount: 100,
        vpa: 'test@paytm',
        payeeName: 'Test Payee',
        entrypoint: 'manual_entry',
        noteLong: 'Test payment for verification',
      }),
    });

    await this.log('Payment Intent Created', response);
    return response;
  }

  async completePayment(trRef) {
    await this.log(`Step 5: Completing payment ${trRef}`);

    const response = await this.makeRequest(`/pay-intents/${trRef}/complete`, {
      method: 'POST',
      body: JSON.stringify({
        status: 'SUCCESS',
        upiTxnRef: `UPI${Date.now()}`,
      }),
    });

    await this.log('Payment Completed', response);
    return response;
  }

  async checkDashboard() {
    await this.log('Step 6: Checking dashboard for recent transactions');

    const response = await this.makeRequest('/dashboard');
    await this.log('Dashboard Data', {
      recentActivityCount: response.recentActivity?.length || 0,
      recentActivity: response.recentActivity,
    });
    return response;
  }

  async checkTransactionHistory() {
    await this.log('Step 7: Checking transaction history');

    const response = await this.makeRequest('/dashboard/transactions');
    await this.log('Transaction History', {
      transactionCount: response.length || 0,
      transactions: response,
    });
    return response;
  }

  async runCompleteTest() {
    try {
      console.log("🚀 Starting Cap'n Pay Complete Flow Test\n");

      // Step 1-2: Authentication
      const otpCode = await this.requestOTP();
      await this.verifyOTP(otpCode);

      // Step 3: Onboarding
      await this.completeOnboarding();

      // Step 4-5: Payment Flow
      const payment = await this.createPayment();
      await this.completePayment(payment.tr);

      // Step 6-7: Verification
      await this.checkDashboard();
      await this.checkTransactionHistory();

      console.log('\n✅ All tests passed! The complete flow is working.');
    } catch (error) {
      console.error('\n❌ Test failed:', error.message);
      throw error;
    }
  }
}

// Run the test
const tester = new CapnPayTester();
tester
  .runCompleteTest()
  .then(() => {
    console.log('\n🎉 Test completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Test failed:', error.message);
    process.exit(1);
  });
