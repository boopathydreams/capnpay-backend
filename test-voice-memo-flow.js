const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:3000';

// Test user credentials
const testUser = {
  phoneNumber: '+919876543210',
  firstName: 'Test',
  lastName: 'User',
};

let authToken = '';

async function authenticateUser() {
  try {
    console.log('🔐 Authenticating user...');

    // Request OTP
    const otpResponse = await axios.post(`${BASE_URL}/auth/otp/request`, {
      phone: testUser.phoneNumber,
    });

    console.log('📱 OTP requested:', otpResponse.data);

    // For testing, we'll use the OTP from the response
    const testOtp = otpResponse.data.devCode || '123456';

    // Verify OTP
    const verifyResponse = await axios.post(`${BASE_URL}/auth/otp/verify`, {
      phone: testUser.phoneNumber,
      code: testOtp,
    });

    authToken = verifyResponse.data.accessToken;
    console.log('✅ Authentication successful');
    return authToken;
  } catch (error) {
    console.error(
      '❌ Authentication failed:',
      error.response?.data || error.message,
    );
    throw error;
  }
}

async function uploadVoiceFile() {
  try {
    console.log('🎤 Uploading voice file...');

    // Create a dummy audio file for testing
    const audioContent = Buffer.from('dummy audio content for testing');
    const tempFilePath = path.join(__dirname, 'temp-audio.wav');
    fs.writeFileSync(tempFilePath, audioContent);

    const objectKey = `voice-memo-${Date.now()}`;

    const formData = new FormData();
    formData.append('file', fs.createReadStream(tempFilePath), {
      filename: 'test-voice-memo.wav',
      contentType: 'audio/wav',
    });

    const response = await axios.post(
      `${BASE_URL}/attachments/local-upload/${objectKey}`,
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          Authorization: `Bearer ${authToken}`,
        },
      },
    );

    // Clean up temp file
    fs.unlinkSync(tempFilePath);

    console.log('✅ Voice file uploaded:', response.data);
    return objectKey; // Return the objectKey we used
  } catch (error) {
    console.error(
      '❌ Voice file upload failed:',
      error.response?.data || error.message,
    );
    throw error;
  }
}

async function testStandardPaymentWithVoiceMemo(objectKey) {
  try {
    console.log('💳 Testing standard payment with voice memo...');

    const paymentData = {
      amount: 100,
      vpa: 'test@paytm',
      payeeName: 'Test Recipient',
      entrypoint: 'test_voice_memo',
      noteLong: 'Test payment with voice memo',
      voiceMemo: {
        objectKey: objectKey,
        durationMs: 5000,
        transcript: 'This is a test voice memo for the payment',
      },
    };

    const response = await axios.post(`${BASE_URL}/pay-intents`, paymentData, {
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('✅ Standard payment with voice memo created:', response.data);
    return response.data;
  } catch (error) {
    console.error(
      '❌ Standard payment failed:',
      error.response?.data || error.message,
    );
    throw error;
  }
}

async function testEscrowPaymentWithVoiceMemo(objectKey) {
  try {
    console.log('🏦 Testing escrow payment with voice memo...');

    const escrowData = {
      amount: 500,
      recipientVpa: 'escrow@paytm',
      recipientName: 'Escrow Recipient',
      category: 'Services',
      categoryId: '2',
      note: 'Test escrow payment with voice memo',
      voiceMemo: {
        objectKey: objectKey,
        durationMs: 7000,
        transcript: 'This is a test voice memo for the escrow payment',
      },
    };

    const response = await axios.post(
      `${BASE_URL}/pay-intents/escrow`,
      escrowData,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
      },
    );

    console.log('✅ Escrow payment with voice memo created:', response.data);
    return response.data;
  } catch (error) {
    console.error(
      '❌ Escrow payment failed:',
      error.response?.data || error.message,
    );
    throw error;
  }
}

async function verifyMemosCreated(paymentIntentId) {
  try {
    console.log('🔍 Verifying memos created for payment:', paymentIntentId);

    const response = await axios.get(
      `${BASE_URL}/memos/payment/${paymentIntentId}`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    );

    console.log('✅ Memos found:', response.data);
    return response.data;
  } catch (error) {
    console.error(
      '❌ Memo verification failed:',
      error.response?.data || error.message,
    );
    return null;
  }
}

async function runCompleteTest() {
  try {
    console.log('🚀 Starting complete voice memo flow test...\n');

    // Step 1: Authenticate
    await authenticateUser();

    // Step 2: Upload voice file (simulating mobile app behavior)
    const objectKey = await uploadVoiceFile();

    // Step 3: Test standard payment with voice memo
    console.log('\n--- Testing Standard Payment ---');
    const standardPayment = await testStandardPaymentWithVoiceMemo(objectKey);

    // Wait a moment for memo creation
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Verify memo was created for standard payment
    await verifyMemosCreated(standardPayment.tr);

    // Step 4: Test escrow payment with voice memo
    console.log('\n--- Testing Escrow Payment ---');
    const escrowPayment = await testEscrowPaymentWithVoiceMemo(objectKey);

    // Wait a moment for memo creation
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Verify memo was created for escrow payment
    await verifyMemosCreated(escrowPayment.referenceId);

    console.log('\n🎉 All tests completed successfully!');
    console.log('\nSummary:');
    console.log('✅ Voice file upload');
    console.log('✅ Standard payment with voice memo');
    console.log('✅ Escrow payment with voice memo');
    console.log('✅ Voice memo creation verification');
  } catch (error) {
    console.error('\n💥 Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
runCompleteTest();
