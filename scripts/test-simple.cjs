const https = require('https');
const http = require('http');

const BASE_URL = 'http://localhost:3000';

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = client.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({ status: res.statusCode, data: jsonData });
        } catch (error) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

async function testSimple() {
  console.log('🚀 Bắt đầu test đơn giản...\n');

  try {
    // 1. Test lấy phiên hiện tại
    console.log('1️⃣ Test lấy phiên hiện tại...');
    const sessionResponse = await makeRequest(`${BASE_URL}/api/trading-sessions`);
    
    if (sessionResponse.status !== 200) {
      throw new Error(`Lấy phiên thất bại: ${sessionResponse.status}`);
    }

    console.log('📊 Phiên hiện tại:', sessionResponse.data.currentSession);
    console.log('✅ Lấy phiên thành công\n');

    // 2. Test lưu kết quả phiên
    console.log('2️⃣ Test lưu kết quả phiên...');
    const saveResultResponse = await makeRequest(`${BASE_URL}/api/trading-sessions/auto-save-result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    if (saveResultResponse.status !== 200) {
      throw new Error(`Lưu kết quả phiên thất bại: ${saveResultResponse.status}`);
    }

    console.log('📊 Kết quả lưu phiên:', saveResultResponse.data);
    console.log('✅ Lưu kết quả phiên thành công\n');

    // 3. Test công bố kết quả
    console.log('3️⃣ Test công bố kết quả...');
    const publishResponse = await makeRequest(`${BASE_URL}/api/trades/publish-results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    if (publishResponse.status !== 200) {
      throw new Error(`Công bố kết quả thất bại: ${publishResponse.status}`);
    }

    console.log('📊 Kết quả công bố:', publishResponse.data);
    console.log('✅ Công bố kết quả thành công\n');

    // 4. Test lấy danh sách lệnh đã công bố
    console.log('4️⃣ Test lấy danh sách lệnh đã công bố...');
    const publishedTradesResponse = await makeRequest(`${BASE_URL}/api/trades/publish-results`);
    
    if (publishedTradesResponse.status !== 200) {
      throw new Error(`Lấy danh sách lệnh thất bại: ${publishedTradesResponse.status}`);
    }

    console.log('📊 Lệnh đã công bố:', publishedTradesResponse.data);
    console.log('✅ Lấy danh sách lệnh thành công\n');

    console.log('🎉 Test đơn giản hoàn thành thành công!');
    console.log('\n📋 Tóm tắt:');
    console.log('- ✅ Lấy phiên hiện tại thành công');
    console.log('- ✅ Lưu kết quả phiên thành công');
    console.log('- ✅ Công bố kết quả thành công');
    console.log('- ✅ Lấy danh sách lệnh đã công bố thành công');

  } catch (error) {
    console.error('❌ Lỗi trong quá trình test:', error.message);
    process.exit(1);
  }
}

// Chạy test
testSimple(); 