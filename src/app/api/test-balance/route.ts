import { NextResponse, NextRequest } from 'next/server';
import { getMongoDb } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { ObjectId } from 'mongodb';

export async function GET(request: NextRequest) {
  try {
    // Xác thực user
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
    const user = await verifyToken(token);
    
    if (!user?.userId) {
      return NextResponse.json({ message: 'Invalid token' }, { status: 401 });
    }

    const db = await getMongoDb();
    
    // Lấy thông tin user hiện tại
    const userData = await db.collection('users').findOne({ _id: new ObjectId(user.userId) });
    if (!userData) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 });
    }

    // ✅ CHUẨN HÓA: Luôn sử dụng balance dạng object
    let currentBalance = userData.balance || { available: 0, frozen: 0 };
    
    // Nếu balance là number (kiểu cũ), chuyển đổi thành object
    if (typeof currentBalance === 'number') {
      currentBalance = {
        available: currentBalance,
        frozen: 0
      };
      
      console.log(`🔄 [TEST BALANCE MIGRATION] User ${userData.username}: Chuyển đổi balance từ number sang object`);
    }
    
    const availableBalance = currentBalance.available || 0;
    const frozenBalance = currentBalance.frozen || 0;

    // Lấy lịch sử trades gần đây
    const recentTrades = await db.collection('trades')
      .find({ userId: new ObjectId(user.userId) })
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();

    // ✅ SỬA LỖI: Tính toán balance theo logic chính xác
    let calculatedAvailable = availableBalance;
    let calculatedFrozen = frozenBalance;

    for (const trade of recentTrades) {
      if (trade.status === 'pending') {
        // Trade đang pending: tiền đã bị trừ khỏi available và cộng vào frozen
        // Không cần thay đổi gì
      } else if (trade.status === 'completed') {
        if (trade.result === 'win') {
          // ✅ SỬA LỖI: Trade thắng - tiền gốc đã được trả từ frozen về available, cộng thêm profit
          // Lưu ý: Logic này giả định rằng balance hiện tại đã được cập nhật đúng
          // Nếu balance bị sai, cần sửa lại
          calculatedAvailable += (trade.amount || 0) + (trade.profit || 0);
          calculatedFrozen -= trade.amount || 0;
        } else if (trade.result === 'lose') {
          // Trade thua: tiền gốc đã bị trừ khỏi frozen
          calculatedFrozen -= trade.amount;
        }
      }
    }

    // ✅ KIỂM TRA: So sánh balance hiện tại với balance tính toán
    const availableDiff = Math.abs(calculatedAvailable - availableBalance);
    const frozenDiff = Math.abs(calculatedFrozen - frozenBalance);
    const hasDiscrepancy = availableDiff > 1000 || frozenDiff > 1000; // Cho phép sai số 1000 VND

    return NextResponse.json({
      success: true,
      data: {
        currentBalance: {
          available: availableBalance,
          frozen: frozenBalance,
          total: availableBalance + frozenBalance
        },
        calculatedBalance: {
          available: calculatedAvailable,
          frozen: calculatedFrozen,
          total: calculatedAvailable + calculatedFrozen
        },
        discrepancy: {
          hasDiscrepancy,
          availableDiff,
          frozenDiff,
          message: hasDiscrepancy ? 'Phát hiện sự khác biệt lớn giữa balance hiện tại và balance tính toán. Cần kiểm tra và sửa lỗi.' : 'Balance chính xác'
        },
        recentTrades: recentTrades.map(trade => ({
          id: trade._id,
          sessionId: trade.sessionId,
          direction: trade.direction,
          amount: trade.amount,
          status: trade.status,
          result: trade.result,
          profit: trade.profit,
          createdAt: trade.createdAt
        }))
      }
    });

  } catch (error) {
    console.error('Test balance error:', error);
    return NextResponse.json({ 
      success: false, 
      message: 'Lỗi khi test balance',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 