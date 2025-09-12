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
    const audioContent = Buffer.from(
      'dummy audio content for testing voice memo functionality',
    );
    const tempFilePath = path.join(__dirname, 'temp-audio.wav');
    fs.writeFileSync(tempFilePath, audioContent);

    const objectKey = `voice-memo-test-${Date.now()}`;

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
    console.log('📁 Object key:', objectKey);
    return objectKey;
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
    console.log('🔑 Using object key:', objectKey);

    const paymentData = {
      amount: 150,
      vpa: 'test@paytm',
      payeeName: 'Voice Memo Test Recipient',
      entrypoint: 'test_voice_memo_integration',
      noteLong: 'Testing voice memo integration with payment intent creation',
      voiceMemo: {
        objectKey: objectKey,
        durationMs: 8500,
        transcript:
          'This is a comprehensive test of the voice memo feature integrated with payment creation. The memo should be created after successful payment intent creation.',
        transcriptConfidence: 0.95,
        language: 'en',
      },
    };

    console.log('📤 Sending payment request with voice memo data...');

    const response = await axios.post(`${BASE_URL}/pay-intents`, paymentData, {
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
    });

    console.log('✅ Standard payment with voice memo created successfully!');
    console.log('💰 Payment ID (tr):', response.data.tr);
    console.log('💰 Payment Intent ID:', response.data.paymentIntentId);
    console.log(
      '🏷️ Suggested category:',
      response.data.suggestedTag?.category?.name,
    );
    console.log('📄 Full response data keys:', Object.keys(response.data));

    return response.data;
  } catch (error) {
    console.error(
      '❌ Standard payment failed:',
      error.response?.data || error.message,
    );
    throw error;
  }
}

async function verifyMemosCreated(paymentIntentId) {
  try {
    console.log('🔍 Verifying memos created for payment:', paymentIntentId);

    // Wait a bit for memo creation
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const response = await axios.get(
      `${BASE_URL}/memos/payment/${paymentIntentId}`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    );

    console.log('✅ Memos verification result:');
    console.log('📝 Number of memos found:', response.data.length);

    if (response.data.length > 0) {
      response.data.forEach((memo, index) => {
        console.log(`📄 Memo ${index + 1}:`);
        console.log(`   - Type: ${memo.type}`);
        console.log(`   - Content: ${memo.content || 'N/A'}`);
        console.log(`   - Object Key: ${memo.objectKey || 'N/A'}`);
        console.log(`   - Duration: ${memo.durationMs || 'N/A'}ms`);
        console.log(`   - Transcript: ${memo.transcript || 'N/A'}`);
        console.log(`   - Created: ${memo.createdAt}`);
      });
    } else {
      console.log('⚠️  No memos found for this payment');
    }

    return response.data;
  } catch (error) {
    console.error(
      '❌ Memo verification failed:',
      error.response?.data || error.message,
    );
    return null;
  }
}

async function testRecentMemos() {
  try {
    console.log('📋 Checking recent memos...');

    const response = await axios.get(`${BASE_URL}/memos/recent`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    console.log('✅ Recent memos:');
    console.log('📝 Total recent memos:', response.data.length);

    response.data.slice(0, 3).forEach((memo, index) => {
      console.log(`📄 Recent memo ${index + 1}:`);
      console.log(`   - Type: ${memo.type}`);
      console.log(`   - Payment ID: ${memo.paymentIntentId}`);
      console.log(`   - Created: ${memo.createdAt}`);
    });
  } catch (error) {
    console.error(
      '❌ Recent memos check failed:',
      error.response?.data || error.message,
    );
  }
}

async function runVoiceMemoTest() {
  try {
    console.log('🚀 Starting Voice Memo Integration Test...\n');

    // Step 1: Authenticate
    await authenticateUser();
    console.log('');

    // Step 2: Upload voice file
    const objectKey = await uploadVoiceFile();
    console.log('');

    // Step 3: Test standard payment with voice memo
    console.log('--- Standard Payment with Voice Memo ---');
    const standardPayment = await testStandardPaymentWithVoiceMemo(objectKey);
    console.log('');

    // Step 4: Verify memo was created
    console.log('--- Voice Memo Verification ---');
    const memos = await verifyMemosCreated(standardPayment.paymentIntentId);
    console.log('');

    // Step 5: Check recent memos
    console.log('--- Recent Memos Check ---');
    await testRecentMemos();

    console.log('\n🎉 Voice Memo Integration Test Completed!');

    if (memos && memos.length > 0) {
      console.log(
        '\n✅ SUCCESS: Voice memo was successfully created and linked to payment!',
      );
      console.log('🔗 Integration working as expected');
    } else {
      console.log('\n⚠️  WARNING: No voice memos found for the payment');
      console.log(
        '🔍 This might indicate an issue with the voice memo creation process',
      );
    }
  } catch (error) {
    console.error('\n💥 Test failed:', error.message);
    process.exit(1);
  }
}

// Run the test
runVoiceMemoTest();
