import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { getMongoDb } from '@/lib/db';
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

    const { searchParams } = new URL(request.url);
    const waitForPendingTrades = searchParams.get('waitForPending') === 'true';
    const forceSync = searchParams.get('force') === 'true'; // ✅ THÊM: Force sync parameter

    const db = await getMongoDb();
    const userId = new ObjectId(tokenData.userId);

    // Lấy thông tin user
    const user = await db.collection('users').findOne({ _id: userId });
    if (!user) {
      return NextResponse.json({ success: false, message: 'Không tìm thấy người dùng' }, { status: 404 });
    }

    // Nếu cần chờ pending trades hoàn thành và không phải force sync
    if (waitForPendingTrades && !forceSync) {
      // Kiểm tra xem có trades nào đang pending không
      const pendingTrades = await db.collection('trades').find({
        userId: userId,
        status: 'pending'
      }).toArray();

      // Nếu còn trades pending, trả về status 202 (chưa sẵn sàng)
      if (pendingTrades.length > 0) {
        console.log(`⏭️ [SYNC] User ${user.username} còn ${pendingTrades.length} trades pending, chưa sync balance`);
        return NextResponse.json({ 
          success: false,
          message: 'Còn lệnh giao dịch đang xử lý',
          pendingTradesCount: pendingTrades.length,
          balance: user.balance || { available: 0, frozen: 0 }
        }, { status: 202 });
      }
    }
    
    // ✅ THÊM: Log khi force sync
    if (forceSync) {
      console.log(`🔄 [SYNC] Force sync balance cho user ${user.username}`);
    }

    // Lấy số dư từ field balance của user
    const userBalance = user.balance || { available: 0, frozen: 0 };
    const availableBalance = typeof userBalance === 'number' ? userBalance : userBalance.available || 0;
    const frozenBalance = typeof userBalance === 'number' ? 0 : userBalance.frozen || 0;
    
  
    return NextResponse.json({
      success: true,
      balance: {
        available: availableBalance,
        frozen: frozenBalance,
        total: availableBalance + frozenBalance
      },
      user: {
        id: user._id,
        username: user.username,
        email: user.email
      }
    });

  } catch (error) {
    console.error('Sync balance error:', error);
    return NextResponse.json({ 
      success: false, 
      message: 'Lỗi khi đồng bộ số dư' 
    }, { status: 500 });
  }
} 