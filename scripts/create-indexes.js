const { MongoClient } = require('mongodb');

async function createIndexes() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ MONGODB_URI không được cấu hình');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log('✅ Đã kết nối MongoDB');
    
    const db = client.db();
    
    // Tạo index cho collection trading_sessions
    console.log('📊 Đang tạo index cho trading_sessions...');
    await db.collection('trading_sessions').createIndex({ sessionId: 1 }, { unique: true });
    await db.collection('trading_sessions').createIndex({ status: 1 });
    await db.collection('trading_sessions').createIndex({ startTime: 1 });
    await db.collection('trading_sessions').createIndex({ endTime: 1 });
    await db.collection('trading_sessions').createIndex({ createdAt: -1 });
    console.log('✅ Đã tạo index cho trading_sessions');
    
    // Tạo index cho collection trades
    console.log('📊 Đang tạo index cho trades...');
    await db.collection('trades').createIndex({ sessionId: 1, status: 1 });
    await db.collection('trades').createIndex({ sessionId: 1, status: 1, result: 1 });
    await db.collection('trades').createIndex({ sessionId: 1, createdAt: -1 });
    await db.collection('trades').createIndex({ userId: 1 });
    await db.collection('trades').createIndex({ status: 1 });
    await db.collection('trades').createIndex({ createdAt: -1 });
    await db.collection('trades').createIndex({ userId: 1, createdAt: -1 });
    console.log('✅ Đã tạo index cho trades');
    
    // Tạo index cho collection users
    console.log('📊 Đang tạo index cho users...');
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    await db.collection('users').createIndex({ username: 1 });
    await db.collection('users').createIndex({ createdAt: -1 });
    console.log('✅ Đã tạo index cho users');
    
    console.log('🎉 Hoàn thành tạo tất cả index!');
    
  } catch (error) {
    console.error('❌ Lỗi khi tạo index:', error);
  } finally {
    await client.close();
    console.log('🔌 Đã đóng kết nối MongoDB');
  }
}

createIndexes(); 