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

    // Lấy balance hiện tại
    const currentBalance = userData.balance || { available: 0, frozen: 0 };
    const availableBalance = typeof currentBalance === 'number' ? currentBalance : currentBalance.available || 0;
    const frozenBalance = typeof currentBalance === 'number' ? 0 : currentBalance.frozen || 0;

    // Lấy lịch sử trades gần đây
    const recentTrades = await db.collection('trades')
      .find({ userId: new ObjectId(user.userId) })
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();

    // Tính toán balance theo logic mới
    let calculatedAvailable = availableBalance;
    let calculatedFrozen = frozenBalance;

    for (const trade of recentTrades) {
      if (trade.status === 'pending') {
        // Trade đang pending: tiền đã bị trừ khỏi available và cộng vào frozen
        // Không cần thay đổi gì
      } else if (trade.status === 'completed') {
        if (trade.result === 'win') {
          // Trade thắng: tiền gốc đã được trả từ frozen về available, cộng thêm profit
          calculatedAvailable += (trade.amount || 0) + (trade.profit || 0);
          calculatedFrozen -= trade.amount || 0;
        } else if (trade.result === 'lose') {
          // Trade thua: tiền gốc đã bị trừ khỏi frozen
          calculatedFrozen -= trade.amount;
        }
      }
    }

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