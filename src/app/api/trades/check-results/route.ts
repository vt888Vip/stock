import { NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { ObjectId } from 'mongodb';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
    const user = await verifyToken(token);
    
    if (!user?.userId) {
      return NextResponse.json({ message: 'Invalid token' }, { status: 401 });
    }

    const { sessionId } = await req.json();
    if (!sessionId) {
      return NextResponse.json({ message: 'Session ID is required' }, { status: 400 });
    }

    const db = await getMongoDb();
    
    // Lấy kết quả phiên từ trading_sessions
    const session = await db.collection('trading_sessions').findOne({ sessionId });
    if (!session) {
      return NextResponse.json({ message: 'Session not found' }, { status: 404 });
    }

    // Nếu chưa có kết quả
    if (!session.result) {
      return NextResponse.json({ hasResult: false });
    }

    // Cập nhật tất cả các lệnh chưa có kết quả cho phiên này
    const trades = await db.collection('trades')
      .find({ 
        sessionId,
        status: 'pending',
        result: null
      })
      .toArray();

    // Cập nhật từng lệnh một cách tuần tự
    for (const trade of trades) {
      const isWin = trade.direction.toLowerCase() === session.result?.toLowerCase();
      const profit = isWin ? Math.floor(trade.amount * 0.9) : 0; // 90% tiền thắng (10 ăn 9)
      
      // Cập nhật trạng thái lệnh
      await db.collection('trades').updateOne(
        { _id: trade._id },
        {
          $set: {
            status: 'completed',
            result: isWin ? 'win' : 'lose',
            profit,
            updatedAt: new Date()
          }
        }
      );

      // Cập nhật số dư tài khoản
      if (isWin) {
        await db.collection('users').updateOne(
          { _id: trade.userId },
          {
            $inc: {
              'balance.available': trade.amount + profit, // Trả lại tiền cược + tiền thắng
              'balance.frozen': -trade.amount
            }
          }
        );
      } else {
        await db.collection('users').updateOne(
          { _id: trade.userId },
          {
            $inc: {
              'balance.frozen': -trade.amount
            }
          }
        );
      }
    }

    // Lấy lại danh sách lệnh đã cập nhật
    const updatedTrades = await db.collection('trades')
      .find({ sessionId })
      .sort({ createdAt: -1 })
      .toArray();

    // Sau khi xử lý kết quả xong, tạo phiên giao dịch mới để duy trì 30 phiên tương lai
    await createNewFutureSession(db);

    return NextResponse.json({
      hasResult: true,
      result: session.result,
      trades: updatedTrades.map(trade => ({
        ...trade,
        _id: trade._id.toString(),
        userId: trade.userId.toString()
      }))
    });

  } catch (error) {
    console.error('Error checking trade results:', error);
    return NextResponse.json(
      { message: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Hàm tạo phiên giao dịch mới để duy trì 30 phiên tương lai
async function createNewFutureSession(db: any) {
  try {
    const now = new Date();
    
    // Kiểm tra số lượng phiên tương lai hiện tại
    const futureSessionsCount = await db.collection('trading_sessions').countDocuments({
      startTime: { $gt: now }
    });

    console.log(`🔍 Hiện tại có ${futureSessionsCount} phiên tương lai`);

    // Nếu có ít hơn 30 phiên, tạo thêm phiên mới
    if (futureSessionsCount < 30) {
      const sessionsToCreate = 30 - futureSessionsCount;
      console.log(`🆕 Tạo thêm ${sessionsToCreate} phiên để duy trì 30 phiên tương lai`);

      for (let i = 0; i < sessionsToCreate; i++) {
        const sessionStartTime = new Date(now.getTime() + (i + 1) * 60000); // Mỗi phiên cách nhau 1 phút
        const sessionEndTime = new Date(sessionStartTime.getTime() + 60000); // Phiên kéo dài 1 phút
        const sessionId = generateSessionId(sessionStartTime);

        // Kiểm tra sessionId đã tồn tại chưa
        const exists = await db.collection('trading_sessions').findOne({ sessionId });
        if (!exists) {
          // Tự động tạo kết quả cho phiên tương lai (50% UP, 50% DOWN)
          const random = Math.random();
          const autoResult = random < 0.5 ? 'UP' : 'DOWN';
          
          const newSession = {
            sessionId,
            startTime: sessionStartTime,
            endTime: sessionEndTime,
            status: 'ACTIVE',
            result: autoResult, // Tự động tạo kết quả
            createdBy: 'system',
            createdAt: now,
            updatedAt: now
          };

          await db.collection('trading_sessions').insertOne(newSession);
          console.log(`🆕 Tạo phiên tương lai ${sessionId} với kết quả ${autoResult}`);
        }
      }
    }
  } catch (error) {
    console.error('❌ Lỗi khi tạo phiên tương lai:', error);
  }
}

// Hàm tạo sessionId
function generateSessionId(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  
  return `${year}${month}${day}${hours}${minutes}`;
}
