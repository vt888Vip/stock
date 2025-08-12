import { NextRequest, NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';
import { ObjectId } from 'mongodb';
import { verifyToken } from '@/lib/auth';

// API để tạo yêu cầu rút tiền mới
export async function POST(req: NextRequest) {
  try {
    console.log('Withdrawal request received');
    
    // Xác thực người dùng
    const token = req.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      console.log('No authorization token found');
      return NextResponse.json({ message: 'Bạn cần đăng nhập' }, { status: 401 });
    }

    console.log('Verifying token...');
    const { userId, isValid } = await verifyToken(token);
    if (!isValid || !userId) {
      console.log('Invalid token:', { userId, isValid });
      return NextResponse.json({ message: 'Token không hợp lệ' }, { status: 401 });
    }
    
    console.log('Token verified for user:', userId);

    // Parse request body
    const body = await req.json();
    console.log('Withdrawal request body:', body);
    
    const { amount, bankName, accountNumber, accountHolder } = body;

    if (!amount || !bankName || !accountNumber || !accountHolder) {
      console.log('Missing required fields:', { amount: !!amount, bankName: !!bankName, accountNumber: !!accountNumber, accountHolder: !!accountHolder });
      return NextResponse.json({ message: 'Thiếu thông tin cần thiết' }, { status: 400 });
    }

    // Kết nối DB
    console.log('Connecting to database...');
    const db = await getMongoDb();
    console.log('Database connected');

    // Lấy thông tin người dùng
    console.log('Finding user with ID:', userId);
    const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
    if (!user) {
      console.log('User not found');
      return NextResponse.json({ message: 'Không tìm thấy người dùng' }, { status: 404 });
    }
    console.log('User found:', { username: user.username, balance: user.balance });

    // ✅ Đã loại bỏ giới hạn rút tiền - User có thể rút bất kỳ số tiền nào (chỉ cần đủ số dư)
    console.log('✅ Không có giới hạn rút tiền - User có thể rút bất kỳ số tiền nào');

    // ✅ CHUẨN HÓA: Luôn sử dụng balance dạng object
    let userBalance = user.balance || { available: 0, frozen: 0 };
    
    // Nếu balance là number (kiểu cũ), chuyển đổi thành object
    if (typeof userBalance === 'number') {
      userBalance = {
        available: userBalance,
        frozen: 0
      };
      
      console.log(`🔄 [WITHDRAWAL MIGRATION] User ${user.username}: Chuyển đổi balance từ number sang object`);
    }
    
    const currentAvailable = userBalance.available || 0;
    
    // Kiểm tra số dư
    if (currentAvailable < amount) {
      return NextResponse.json({ message: 'Số dư không đủ' }, { status: 400 });
    }

    // ✅ TRỪ TIỀN NGAY LẬP TỨC khi user rút tiền
    const newAvailableBalance = currentAvailable - amount;
    const newBalance = {
      ...userBalance,
      available: newAvailableBalance
    };
    
    await db.collection('users').updateOne(
      { _id: new ObjectId(userId) },
      { 
        $set: { 
          balance: newBalance,
          updatedAt: new Date()
        } 
      }
    );
    
    console.log(`💰 [WITHDRAWAL] Đã trừ ${amount} VND từ user ${user.username}. Số dư cũ: ${currentAvailable} VND, Số dư mới: ${newAvailableBalance} VND`);

    // Tạo yêu cầu rút tiền mới với ID theo định dạng RUT-username-timestamp
    const timestamp = new Date().getTime();
    const username = user.username || 'user';
    const withdrawalId = `RUT-${username}-${timestamp}`;

    const withdrawal = {
      withdrawalId,
      user: new ObjectId(userId),
      username: user.username,
      amount,
      bankName,
      bankAccountNumber: accountNumber,
      accountHolder: accountHolder,
      status: 'Chờ duyệt',
      notes: '',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await db.collection('withdrawals').insertOne(withdrawal);

    // Gửi thông báo cho admin (có thể triển khai sau)
    // TODO: Gửi thông báo cho admin qua socket hoặc email

    return NextResponse.json({
      message: 'Yêu cầu rút tiền đã được gửi và tiền đã bị trừ khỏi tài khoản. Vui lòng chờ admin xét duyệt.',
      withdrawalId: result.insertedId
    }, { status: 201 });

  } catch (error) {
    console.error('Error creating withdrawal request:', error);
    return NextResponse.json({ message: 'Đã xảy ra lỗi khi tạo yêu cầu rút tiền' }, { status: 500 });
  }
}
