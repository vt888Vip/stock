import { NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';
import { verifyToken } from '@/lib/auth';
import { ObjectId } from 'mongodb';

export async function POST(req: Request) {
  try {
    // Xác thực user
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
    const user = await verifyToken(token);
    
    if (!user?.userId) {
      return NextResponse.json({ message: 'Invalid token' }, { status: 401 });
    }

    // Lấy dữ liệu từ request
    let { sessionId, direction, amount, asset } = await req.json();
    if (!asset) asset = 'Vàng/Đô la Mỹ'; // Mặc định là Vàng/Đô la Mỹ
    
    // Log dữ liệu đầu vào
    console.log('API /trades/place - Input:', { sessionId, direction, amount, asset });

    if (!sessionId || !direction || !amount || !asset) {
      return NextResponse.json({ message: 'Missing required fields' }, { status: 400 });
    }

    // Validate input
    if (!['UP', 'DOWN'].includes(direction)) {
      return NextResponse.json({ message: 'Invalid direction' }, { status: 400 });
    }

    if (amount <= 0) {
      return NextResponse.json({ message: 'Amount must be greater than 0' }, { status: 400 });
    }

    const db = await getMongoDb();
    if (!db) {
      return NextResponse.json({ message: 'Database connection failed' }, { status: 500 });
    }

    try {
      // 1. Kiểm tra và lấy thông tin user
      const userData = await db.collection('users').findOne(
        { _id: new ObjectId(user.userId) }
      );
      
      if (!userData) {
        throw new Error('User not found');
      }

      // ✅ CHUẨN HÓA: Luôn sử dụng balance dạng object
      let userBalance = userData.balance || { available: 0, frozen: 0 };
      
      // Nếu balance là number (kiểu cũ), chuyển đổi thành object
      if (typeof userBalance === 'number') {
        userBalance = {
          available: userBalance,
          frozen: 0
        };
        
        // Cập nhật database để chuyển đổi sang kiểu mới
        await db.collection('users').updateOne(
          { _id: new ObjectId(user.userId) },
          { 
            $set: { 
              balance: userBalance,
              updatedAt: new Date()
            } 
          }
        );
        
        console.log(`🔄 [PLACE TRADE MIGRATION] User ${userData.username}: Chuyển đổi balance từ number sang object`);
      }
      
      const availableBalance = userBalance.available || 0;
      
      if (availableBalance < amount) {
        throw new Error('Insufficient balance');
      }

      // 3. Kiểm tra phiên giao dịch
      const tradingSession = await db.collection('trading_sessions').findOne(
        { 
          sessionId,
          status: { $in: ['ACTIVE', 'PREDICTED'] }
        }
      );

      if (!tradingSession) {
        throw new Error('Trading session not found or not active');
      }

      // Kiểm tra phiên đã kết thúc chưa
      if (tradingSession.endTime <= new Date()) {
        throw new Error('Trading session has ended');
      }

      // 4. Trừ tiền khỏi available balance và cộng vào frozen balance
      const newAvailableBalance = availableBalance - amount;
      const currentFrozenBalance = userBalance.frozen || 0;
      const newFrozenBalance = currentFrozenBalance + amount;

      console.log(`💰 [PLACE TRADE] User ${userData.username}: available ${availableBalance} → ${newAvailableBalance} (-${amount}), frozen ${currentFrozenBalance} → ${newFrozenBalance} (+${amount})`);

      const updateUserResult = await db.collection('users').updateOne(
        { _id: new ObjectId(user.userId) },
        {
          $set: {
            balance: {
              available: newAvailableBalance,
              frozen: newFrozenBalance
            },
            updatedAt: new Date()
          }
        }
      );

      if (updateUserResult.modifiedCount === 0) {
        throw new Error('Failed to update user balance');
      }

      // 5. Tạo lệnh giao dịch
      const trade = {
        sessionId,
        userId: new ObjectId(user.userId),
        direction,
        amount: Number(amount),
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date()
      };

      console.log('API /trades/place - Insert trade:', trade);
      const tradeResult = await db.collection('trades').insertOne(trade);
      console.log('API /trades/place - Insert result:', tradeResult);

      if (!tradeResult.insertedId) {
        throw new Error('Failed to create trade');
      }

      // Lấy lại lệnh vừa insert để trả về frontend
      const insertedTrade = await db.collection('trades').findOne({ _id: tradeResult.insertedId });
      if (!insertedTrade) {
        throw new Error('Inserted trade not found');
      }

      // Thành công
      return NextResponse.json({
        success: true,
        message: 'Trade placed successfully',
        trade: {
          ...insertedTrade,
          _id: insertedTrade._id.toString(),
          userId: insertedTrade.userId.toString()
        },
        data: {
          sessionId,
          direction,
          amount,
          asset
        }
      });

    } catch (error) {
      console.error('Error placing trade:', error);
      throw error;
    }

  } catch (error) {
    console.error('Error placing trade:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json({
      success: false,
      message: errorMessage
    }, { status: 400 });
  }
}
