const https = require('https');

const API_KEY = process.env.CIRCLE_API_KEY || '';
const ENTITY_SECRET = process.env.CIRCLE_ENTITY_SECRET || '';
const APP_ID = process.env.NEXT_PUBLIC_CIRCLE_APP_ID || '';

console.log('🔍 Testing Circle W3S Configuration:');
console.log('API Key exists:', !!API_KEY);
console.log('Entity Secret exists:', !!ENTITY_SECRET);
console.log('App ID:', APP_ID);

const testEndpoint = (endpoint, headers) => {
  return new Promise((resolve) => {
    const options = {
      hostname: 'api-sandbox.circle.com',
      port: 443,
      path: endpoint,
      method: 'GET',
      headers: headers
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        console.log(`\n🌐 ${endpoint}:`);
        console.log(`Status: ${res.statusCode}`);
        try {
          const parsed = JSON.parse(data);
          console.log('Response:', JSON.stringify(parsed, null, 2).substring(0, 300) + '...');
        } catch {
          console.log('Response:', data.substring(0, 200));
        }
        resolve();
      });
    });

    req.on('error', (error) => {
      console.log(`\n❌ ${endpoint} Error:`, error.message);
      resolve();
    });

    req.end();
  });
};

async function runTests() {
  // Test 1: Regular API with Bearer token
  await testEndpoint('/v1/configuration', {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json'
  });

  // Test 2: W3S developer endpoint
  await testEndpoint('/v1/w3s/developer/configuration', {
    'Authorization': `Bearer ${API_KEY}`,
    'Content-Type': 'application/json'
  });

  // Test 3: With Entity Secret
  if (ENTITY_SECRET) {
    await testEndpoint('/v1/w3s/developer/configuration', {
      'X-Circle-Entity-Secret': ENTITY_SECRET,
      'Content-Type': 'application/json'
    });
  }

  // Test 4: App-specific endpoint
  if (APP_ID) {
    await testEndpoint(`/v1/w3s/apps/${APP_ID}`, {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json'
    });
  }
}

runTests();
