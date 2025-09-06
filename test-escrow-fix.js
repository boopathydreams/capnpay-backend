const fetch = require('node-fetch');

const API_BASE_URL = 'http://localhost:3000';

class EscrowTester {
  constructor() {
    this.authToken = null;
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

  async authenticate() {
    // Step 1: Request OTP
    const otpResponse = await this.makeRequest('/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({
        phone: '+919876543210',
      }),
    });

    // Step 2: Verify OTP
    const verifyResponse = await this.makeRequest('/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({
        phone: '+919876543210',
        code: otpResponse.devCode,
      }),
    });

    this.authToken = verifyResponse.accessToken;
    await this.log('Authentication successful', { hasToken: !!this.authToken });
  }

  async createEscrowTransaction() {
    await this.log('Creating escrow transaction for payout verification test');

    const response = await this.makeRequest('/pay-intents/escrow', {
      method: 'POST',
      body: JSON.stringify({
        recipientVpa: 'test@paytm',
        amount: 100,
        note: 'Testing payout verification fix',
        category: 'Testing',
      }),
    });

    await this.log('Escrow transaction created', response);
    return response.referenceId;
  }

  async checkEscrowStatus(referenceId) {
    await this.log(`Checking escrow status for ${referenceId}`);

    const response = await this.makeRequest(
      `/pay-intents/${referenceId}/status`,
    );
    await this.log('Escrow status', response);
    return response;
  }

  async testPayoutVerification() {
    try {
      console.log('🚀 Testing Payout Verification Fix\n');

      // Authenticate
      await this.authenticate();

      // Create escrow transaction (this will create collection)
      const referenceId = await this.createEscrowTransaction();

      // Check status multiple times to see the flow
      await this.log('Waiting 5 seconds before first status check...');
      await new Promise((resolve) => setTimeout(resolve, 5000));

      await this.checkEscrowStatus(referenceId);

      await this.log('Waiting 10 seconds for collection to complete...');
      await new Promise((resolve) => setTimeout(resolve, 10000));

      await this.checkEscrowStatus(referenceId);

      await this.log('Waiting 10 more seconds for payout to complete...');
      await new Promise((resolve) => setTimeout(resolve, 10000));

      const finalStatus = await this.checkEscrowStatus(referenceId);

      console.log('\n✅ Test completed! Final status:', finalStatus.status);
    } catch (error) {
      console.error('\n❌ Test failed:', error.message);
      throw error;
    }
  }
}

// Run the test
const tester = new EscrowTester();
tester
  .testPayoutVerification()
  .then(() => {
    console.log('\n🎉 Payout verification test completed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Test failed:', error.message);
    process.exit(1);
  });
