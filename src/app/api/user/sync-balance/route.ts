import { NextRequest, NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { ObjectId } from 'mongodb';

export async function GET(request: NextRequest) {
  try {
    // Xác thực người dùng
    let token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      const cookieHeader = request.headers.get('cookie');
      if (cookieHeader) {
        const cookies = cookieHeader.split(';').reduce((acc, cookie) => {
          const [name, value] = cookie.trim().split('=');
          acc[name] = value;
          return acc;
        }, {} as Record<string, string>);
        token = cookies['token'] || cookies['authToken'];
      }
    }
    if (!token) {
      return NextResponse.json({ success: false, message: 'Bạn cần đăng nhập' }, { status: 401 });
    }
    const tokenData = await verifyToken(token);
    if (!tokenData?.isValid) {
      return NextResponse.json({ success: false, message: 'Token không hợp lệ' }, { status: 401 });
    }
    const db = await getMongoDb();
    const userId = new ObjectId(tokenData.userId);

    // Kiểm tra còn lệnh trade nào đang pending không
    const pendingTrade = await db.collection('trades').findOne({ userId, status: 'pending' });
    if (pendingTrade) {
      return NextResponse.json({ status: 'pending' });
    }

    // Nếu không còn lệnh pending, trả về số dư mới nhất
    const user = await db.collection('users').findOne({ _id: userId });
    if (!user) {
      return NextResponse.json({ success: false, message: 'Không tìm thấy người dùng' }, { status: 404 });
    }
    // ✅ CHUẨN HÓA: Luôn sử dụng balance dạng object
    let userBalance = user.balance || { available: 0, frozen: 0 };
    
    // Nếu balance là number (kiểu cũ), chuyển đổi thành object
    if (typeof userBalance === 'number') {
      userBalance = {
        available: userBalance,
        frozen: 0
      };
      
      // Cập nhật database để chuyển đổi sang kiểu mới
      await db.collection('users').updateOne(
        { _id: userId },
        { 
          $set: { 
            balance: userBalance,
            updatedAt: new Date()
          } 
        }
      );
      
      console.log(`🔄 [SYNC BALANCE MIGRATION] User ${user.username}: Chuyển đổi balance từ number sang object`);
    }
    
    const availableBalance = userBalance.available || 0;
    const frozenBalance = userBalance.frozen || 0;
    return NextResponse.json({
      status: 'ok',
      balance: {
        available: availableBalance,
        frozen: frozenBalance,
        total: availableBalance + frozenBalance
      }
    });
  } catch (error) {
    
    return NextResponse.json({ success: false, message: 'Lỗi khi đồng bộ số dư' }, { status: 500 });
  }
} 