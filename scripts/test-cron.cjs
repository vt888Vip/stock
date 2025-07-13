const fetch = require('node-fetch');

const API_URL = process.env.API_URL || 'http://localhost:3000';

async function testCronJob() {
  console.log('🧪 Bắt đầu test Cron job...');
  console.log(`🌐 API URL: ${API_URL}`);
  
  try {
    console.log('📞 Gọi API cron/process-sessions...');
    const response = await fetch(`${API_URL}/api/cron/process-sessions`);
    const data = await response.json();
    
    console.log('📊 Kết quả:');
    console.log(`  - Success: ${data.success}`);
    console.log(`  - Message: ${data.message}`);
    console.log(`  - Timestamp: ${data.timestamp}`);
    console.log(`  - Total Processed: ${data.results?.totalProcessed || 0}`);
    console.log(`  - Errors: ${data.results?.errors?.length || 0}`);
    
    if (data.results?.processedSessions?.length > 0) {
      console.log('\n📋 Chi tiết phiên đã xử lý:');
      data.results.processedSessions.forEach((session, index) => {
        console.log(`  ${index + 1}. ${session.action}: ${session.sessionId}`);
        if (session.oldStatus && session.newStatus) {
          console.log(`     ${session.oldStatus} → ${session.newStatus}`);
        }
        if (session.result) {
          console.log(`     Kết quả: ${session.result}`);
        }
      });
    }
    
    if (data.results?.errors?.length > 0) {
      console.log('\n❌ Lỗi:');
      data.results.errors.forEach((error, index) => {
        console.log(`  ${index + 1}. ${error}`);
      });
    }
    
    console.log('\n✅ Test hoàn thành!');
    
  } catch (error) {
    console.error('❌ Lỗi khi test Cron job:', error.message);
  }
}

// Chạy test
testCronJob(); 