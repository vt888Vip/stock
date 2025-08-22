const { MongoClient } = require('mongodb');

// MongoDB connection string
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/financial_platform';

async function testAndFixBalance() {
  const client = new MongoClient(MONGODB_URI);
  
  try {
    await client.connect();
    console.log('✅ Kết nối MongoDB thành công');
    
    const db = client.db();
    
    // 1. Tìm tất cả users có balance không hợp lệ
    console.log('\n🔍 Đang tìm users có balance không hợp lệ...');
    
    const invalidUsers = await db.collection('users').find({
      $or: [
        { 'balance.available': { $lt: 0 } },
        { 'balance.frozen': { $lt: 0 } },
        { balance: { $type: 'number' } } // Balance kiểu cũ
      ]
    }).toArray();
    
    console.log(`📊 Tìm thấy ${invalidUsers.length} users có balance không hợp lệ`);
    
    if (invalidUsers.length === 0) {
      console.log('✅ Tất cả balance đều hợp lệ!');
      return;
    }
    
    // 2. Hiển thị danh sách users có vấn đề
    console.log('\n📋 Danh sách users có vấn đề:');
    invalidUsers.forEach((user, index) => {
      console.log(`${index + 1}. ${user.username} (${user.email})`);
      console.log(`   Balance hiện tại:`, user.balance);
      
      if (typeof user.balance === 'number') {
        console.log(`   ⚠️  Định dạng cũ (number)`);
      }
      if (user.balance?.available < 0) {
        console.log(`   ❌ Available âm: ${user.balance.available}`);
      }
      if (user.balance?.frozen < 0) {
        console.log(`   ❌ Frozen âm: ${user.balance.frozen}`);
      }
      console.log('');
    });
    
    // 3. Hỏi người dùng có muốn sửa không
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    const answer = await new Promise((resolve) => {
      rl.question('Bạn có muốn sửa balance cho tất cả users này không? (y/N): ', resolve);
    });
    
    rl.close();
    
    if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
      console.log('❌ Hủy bỏ việc sửa balance');
      return;
    }
    
    // 4. Sửa balance cho từng user
    console.log('\n🔧 Đang sửa balance...');
    
    let fixedCount = 0;
    let errorCount = 0;
    
    for (const user of invalidUsers) {
      try {
        let newBalance = { available: 0, frozen: 0 };
        
        // Nếu balance là number (kiểu cũ), chuyển đổi thành object
        if (typeof user.balance === 'number') {
          newBalance = {
            available: Math.max(0, user.balance),
            frozen: 0
          };
          console.log(`   🔄 ${user.username}: Chuyển đổi từ number (${user.balance}) sang object`);
        } else {
          // Sửa balance âm
          newBalance = {
            available: Math.max(0, user.balance?.available || 0),
            frozen: Math.max(0, user.balance?.frozen || 0)
          };
          
          if (user.balance?.available < 0) {
            console.log(`   🔧 ${user.username}: Sửa available từ ${user.balance.available} thành ${newBalance.available}`);
          }
          if (user.balance?.frozen < 0) {
            console.log(`   🔧 ${user.username}: Sửa frozen từ ${user.balance.frozen} thành ${newBalance.frozen}`);
          }
        }
        
        // Cập nhật database
        await db.collection('users').updateOne(
          { _id: user._id },
          { 
            $set: { 
              balance: newBalance,
              updatedAt: new Date()
            } 
          }
        );
        
        fixedCount++;
        console.log(`   ✅ ${user.username}: Đã sửa thành công`);
        
      } catch (error) {
        errorCount++;
        console.error(`   ❌ ${user.username}: Lỗi - ${error.message}`);
      }
    }
    
    console.log(`\n🎉 Hoàn thành! Đã sửa ${fixedCount} users, ${errorCount} lỗi`);
    
    // 5. Kiểm tra lại
    console.log('\n🔍 Kiểm tra lại sau khi sửa...');
    const remainingInvalidUsers = await db.collection('users').find({
      $or: [
        { 'balance.available': { $lt: 0 } },
        { 'balance.frozen': { $lt: 0 } },
        { balance: { $type: 'number' } }
      ]
    }).toArray();
    
    if (remainingInvalidUsers.length === 0) {
      console.log('✅ Tất cả balance đã được sửa thành công!');
    } else {
      console.log(`⚠️  Vẫn còn ${remainingInvalidUsers.length} users có vấn đề`);
    }
    
  } catch (error) {
    console.error('❌ Lỗi:', error);
  } finally {
    await client.close();
    console.log('\n🔌 Đã đóng kết nối MongoDB');
  }
}

// Chạy script
testAndFixBalance().catch(console.error);
