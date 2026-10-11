const apiKey = process.env.CIRCLE_API_KEY || '';

console.log('🔍 Testing Circle API Key Format:');
console.log('Key (first 50 chars):', apiKey.substring(0, 50) + '...');
console.log('Length:', apiKey.length);

const parts = apiKey.split(':');
if (parts.length === 3) {
  console.log('✅ Format correct (3 parts)');
  console.log('Environment:', parts[0]);
  console.log('Key ID:', parts[1].substring(0, 8) + '...');
  console.log('Key Secret:', parts[2].substring(0, 8) + '...');
  
  // Test the API
  const testAPI = async () => {
    try {
      const response = await fetch('https://api-sandbox.circle.com/v1/configuration', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });
      
      console.log('\n🌐 API Response:');
      console.log('Status:', response.status);
      const text = await response.text();
      console.log('Body:', text.substring(0, 200));
    } catch (error) {
      console.error('\n❌ API Error:', error.message);
    }
  };
  
  testAPI();
} else {
  console.log('❌ Format incorrect. Expected 3 parts, got', parts.length);
  console.log('Example: TEST_API_KEY:key_id:key_secret');
}
