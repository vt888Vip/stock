const cron = require('node-cron');
const fetch = require('node-fetch');

// Cấu hình Cron job
const CRON_SCHEDULE = '*/30 * * * * *'; // Chạy mỗi 30 giây
const API_URL = process.env.API_URL || 'http://localhost:3000';

console.log('🚀 Bắt đầu thiết lập Cron job cho hệ thống giao dịch...');
console.log(`📅 Lịch trình: ${CRON_SCHEDULE}`);
console.log(`🌐 API URL: ${API_URL}`);

// Hàm gọi API xử lý phiên
async function processSessions() {
  try {
    const response = await fetch(`${API_URL}/api/cron/process-sessions`);
    const data = await response.json();
    
    if (data.success) {
      console.log(`✅ Cron job thành công: ${data.message}`);
      if (data.results.totalProcessed > 0) {
        console.log(`📊 Đã xử lý ${data.results.totalProcessed} phiên`);
        data.results.processedSessions.forEach(session => {
          console.log(`  - ${session.action}: ${session.sessionId}`);
        });
      }
    } else {
      console.error(`❌ Cron job thất bại: ${data.message}`);
    }
  } catch (error) {
    console.error('❌ Lỗi khi gọi API cron:', error.message);
  }
}

// Thiết lập Cron job
const cronJob = cron.schedule(CRON_SCHEDULE, () => {
  const now = new Date();
  console.log(`\n🕐 Cron job chạy lúc: ${now.toISOString()}`);
  processSessions();
}, {
  scheduled: false,
  timezone: "Asia/Ho_Chi_Minh"
});

// Bắt đầu Cron job
cronJob.start();
console.log('✅ Cron job đã được khởi động!');

// Xử lý tắt chương trình
process.on('SIGINT', () => {
  console.log('\n🛑 Đang dừng Cron job...');
  cronJob.stop();
  console.log('✅ Cron job đã được dừng.');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Đang dừng Cron job...');
  cronJob.stop();
  console.log('✅ Cron job đã được dừng.');
  process.exit(0);
});

// Chạy lần đầu ngay lập tức
console.log('🔄 Chạy lần đầu...');
processSessions(); 