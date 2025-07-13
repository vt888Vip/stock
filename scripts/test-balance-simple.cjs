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

async function testBalanceSimple() {
  console.log('💰 Test cập nhật số dư đơn giản...\n');

  try {
    // 1. Test đăng nhập
    console.log('1️⃣ Test đăng nhập...');
    const loginResponse = await makeRequest(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: {
        email: 'test@example.com',
        password: 'password123'
      }
    });

    if (loginResponse.status !== 200) {
      throw new Error('Đăng nhập thất bại');
    }

    const loginData = loginResponse.data;
    const token = loginData.token;
    console.log('✅ Đăng nhập thành công\n');

    // 2. Lấy số dư ban đầu
    console.log('2️⃣ Lấy số dư ban đầu...');
    const initialBalanceResponse = await makeRequest(`${BASE_URL}/api/user/balance`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (initialBalanceResponse.status === 200) {
      const initialBalanceData = initialBalanceResponse.data;
      console.log('💰 Số dư ban đầu:', initialBalanceData.balance.available);
    }

    // 3. Test cập nhật số dư cho phiên cụ thể
    console.log('3️⃣ Test cập nhật số dư...');
    const sessionId = '202507130102'; // Thay bằng sessionId thực tế
    
    const updateBalanceResponse = await makeRequest(`${BASE_URL}/api/test-balance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: {
        action: 'update_balance',
        sessionId: sessionId
      }
    });

    if (updateBalanceResponse.status === 200) {
      const updateData = updateBalanceResponse.data;
      console.log('📊 Kết quả cập nhật số dư:', updateData);
      
      if (updateData.success) {
        console.log('✅ Cập nhật số dư thành công!');
        console.log(`💰 Số dư cũ: ${updateData.data.oldBalance.toLocaleString()}`);
        console.log(`💰 Số dư mới: ${updateData.data.newBalance.toLocaleString()}`);
        console.log(`💰 Tiền đặt cược: ${updateData.data.tradeAmount.toLocaleString()}`);
        console.log(`💰 Tiền thắng: ${updateData.data.profit.toLocaleString()}`);
        console.log(`💰 Tổng cộng: ${updateData.data.totalAdded.toLocaleString()}`);
      } else {
        console.log('❌ Cập nhật số dư thất bại:', updateData.message);
      }
    } else {
      console.log('❌ Lỗi khi gọi API cập nhật số dư');
    }

    // 4. Kiểm tra số dư sau khi cập nhật
    console.log('4️⃣ Kiểm tra số dư sau khi cập nhật...');
    const finalBalanceResponse = await makeRequest(`${BASE_URL}/api/user/balance`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (finalBalanceResponse.status === 200) {
      const finalBalanceData = finalBalanceResponse.data;
      console.log('💰 Số dư cuối cùng:', finalBalanceData.balance.available);
    }

    console.log('\n🎉 Test cập nhật số dư hoàn thành!');

  } catch (error) {
    console.error('❌ Lỗi trong quá trình test:', error.message);
    process.exit(1);
  }
}

// Chạy test
testBalanceSimple(); 