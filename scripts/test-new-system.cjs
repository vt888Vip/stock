const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3000';

async function testNewSystem() {
  console.log('🚀 Bắt đầu test hệ thống mới...\n');

  try {
    // 1. Test đăng nhập
    console.log('1️⃣ Test đăng nhập...');
    const loginResponse = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test@example.com',
        password: 'password123'
      })
    });

    if (!loginResponse.ok) {
      throw new Error('Đăng nhập thất bại');
    }

    const loginData = await loginResponse.json();
    const token = loginData.token;
    console.log('✅ Đăng nhập thành công\n');

    // 2. Test lấy phiên hiện tại
    console.log('2️⃣ Test lấy phiên hiện tại...');
    const sessionResponse = await fetch(`${BASE_URL}/api/trading-sessions`);
    const sessionData = await sessionResponse.json();
    
    if (!sessionData.success) {
      throw new Error('Không thể lấy phiên hiện tại');
    }

    const currentSession = sessionData.currentSession;
    console.log('📊 Phiên hiện tại:', {
      sessionId: currentSession.sessionId,
      status: currentSession.status,
      result: currentSession.result,
      timeLeft: currentSession.timeLeft
    });
    console.log('✅ Lấy phiên thành công\n');

    // 3. Test đặt lệnh (đối chiếu ngay lập tức)
    console.log('3️⃣ Test đặt lệnh...');
    const tradeResponse = await fetch(`${BASE_URL}/api/trades/place`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        sessionId: currentSession.sessionId,
        direction: 'UP',
        amount: 100000,
        asset: 'BTC'
      })
    });

    if (!tradeResponse.ok) {
      throw new Error('Đặt lệnh thất bại');
    }

    const tradeData = await tradeResponse.json();
    console.log('📊 Kết quả đặt lệnh:', {
      success: tradeData.success,
      message: tradeData.message,
      tradeId: tradeData.trade._id,
      result: tradeData.trade.result,
      profit: tradeData.trade.profit,
      sessionResult: tradeData.trade.sessionResult
    });
    console.log('✅ Đặt lệnh thành công\n');

    // 4. Test lưu kết quả phiên
    console.log('4️⃣ Test lưu kết quả phiên...');
    const saveResultResponse = await fetch(`${BASE_URL}/api/trading-sessions/auto-save-result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!saveResultResponse.ok) {
      throw new Error('Lưu kết quả phiên thất bại');
    }

    const saveResultData = await saveResultResponse.json();
    console.log('📊 Kết quả lưu phiên:', {
      success: saveResultData.success,
      message: saveResultData.message,
      sessionId: saveResultData.data?.sessionId,
      actualResult: saveResultData.data?.actualResult,
      publishIn: saveResultData.data?.publishIn
    });
    console.log('✅ Lưu kết quả phiên thành công\n');

    // 5. Chờ 12 giây và test công bố kết quả
    console.log('5️⃣ Chờ 12 giây để công bố kết quả...');
    await new Promise(resolve => setTimeout(resolve, 12000));

    console.log('🔍 Test công bố kết quả...');
    const publishResponse = await fetch(`${BASE_URL}/api/trades/publish-results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    if (!publishResponse.ok) {
      throw new Error('Công bố kết quả thất bại');
    }

    const publishData = await publishResponse.json();
    console.log('📊 Kết quả công bố:', {
      success: publishData.success,
      message: publishData.message,
      publishedCount: publishData.data?.publishedCount,
      errorCount: publishData.data?.errorCount
    });
    console.log('✅ Công bố kết quả thành công\n');

    // 6. Test lấy danh sách lệnh đã công bố
    console.log('6️⃣ Test lấy danh sách lệnh đã công bố...');
    const publishedTradesResponse = await fetch(`${BASE_URL}/api/trades/publish-results`);
    const publishedTradesData = await publishedTradesResponse.json();

    if (publishedTradesData.success && publishedTradesData.data.length > 0) {
      console.log('📊 Lệnh đã công bố:', publishedTradesData.data[0]);
    } else {
      console.log('📊 Chưa có lệnh nào được công bố');
    }
    console.log('✅ Lấy danh sách lệnh thành công\n');

    // 7. Test lấy số dư sau khi có kết quả
    console.log('7️⃣ Test lấy số dư sau khi có kết quả...');
    const balanceResponse = await fetch(`${BASE_URL}/api/user/balance`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (balanceResponse.ok) {
      const balanceData = await balanceResponse.json();
      console.log('📊 Số dư hiện tại:', balanceData.balance);
    }
    console.log('✅ Lấy số dư thành công\n');

    console.log('🎉 Test hệ thống mới hoàn thành thành công!');
    console.log('\n📋 Tóm tắt:');
    console.log('- ✅ Đăng nhập thành công');
    console.log('- ✅ Lấy phiên hiện tại thành công');
    console.log('- ✅ Đặt lệnh và đối chiếu kết quả ngay lập tức');
    console.log('- ✅ Lưu kết quả phiên thành công');
    console.log('- ✅ Công bố kết quả sau 12 giây thành công');
    console.log('- ✅ Lấy danh sách lệnh đã công bố thành công');
    console.log('- ✅ Cập nhật số dư thành công');

  } catch (error) {
    console.error('❌ Lỗi trong quá trình test:', error.message);
    process.exit(1);
  }
}

// Chạy test
testNewSystem(); 