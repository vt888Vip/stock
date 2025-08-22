import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { getMongoDb } from '@/lib/db';
import { ObjectId } from 'mongodb';
import { validateAndFixBalance, getUserBalance } from '@/lib/balanceUtils';

export async function POST(request: NextRequest) {
  try {
    // Xác thực admin
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
    
    // Kiểm tra user có phải admin không
    const adminUser = await db.collection('users').findOne({ 
      _id: new ObjectId(tokenData.userId),
      role: 'admin'
    });
    
    if (!adminUser) {
      return NextResponse.json({ success: false, message: 'Bạn không có quyền truy cập' }, { status: 403 });
    }

    const { userId } = await request.json();
    
    if (!userId) {
      return NextResponse.json({ success: false, message: 'Thiếu userId' }, { status: 400 });
    }

    // Lấy thông tin user cần sửa
    const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
    if (!user) {
      return NextResponse.json({ success: false, message: 'Không tìm thấy người dùng' }, { status: 404 });
    }

    // Lấy balance hiện tại
    const currentBalance = await getUserBalance(db, userId);
    
    // Kiểm tra và sửa balance
    const wasFixed = await validateAndFixBalance(db, userId);
    
    // Lấy balance sau khi sửa
    const newBalance = await getUserBalance(db, userId);
    
    console.log(`🔧 [ADMIN FIX] Admin ${adminUser.username} sửa balance cho user ${user.username}:`, {
      before: currentBalance,
      after: newBalance,
      wasFixed
    });

    return NextResponse.json({
      success: true,
      message: wasFixed ? 'Đã sửa balance thành công' : 'Balance đã hợp lệ',
      data: {
        userId,
        username: user.username,
        balanceBefore: currentBalance,
        balanceAfter: newBalance,
        wasFixed
      }
    });

  } catch (error) {
    console.error('Fix balance error:', error);
    return NextResponse.json({ 
      success: false, 
      message: 'Lỗi khi sửa balance' 
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    // Xác thực admin
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
    
    // Kiểm tra user có phải admin không
    const adminUser = await db.collection('users').findOne({ 
      _id: new ObjectId(tokenData.userId),
      role: 'admin'
    });
    
    if (!adminUser) {
      return NextResponse.json({ success: false, message: 'Bạn không có quyền truy cập' }, { status: 403 });
    }

    // Lấy danh sách users có balance không hợp lệ
    const usersWithInvalidBalance = await db.collection('users').find({
      $or: [
        { 'balance.available': { $lt: 0 } },
        { 'balance.frozen': { $lt: 0 } },
        { balance: { $type: 'number' } } // Balance kiểu cũ
      ]
    }).toArray();

    const invalidUsers = [];
    
    for (const user of usersWithInvalidBalance) {
      const balance = await getUserBalance(db, user._id.toString());
      invalidUsers.push({
        id: user._id,
        username: user.username,
        email: user.email,
        balance,
        hasNegativeBalance: balance.available < 0 || balance.frozen < 0,
        hasOldFormat: typeof user.balance === 'number'
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        totalUsers: invalidUsers.length,
        users: invalidUsers
      }
    });

  } catch (error) {
    console.error('Check invalid balance error:', error);
    return NextResponse.json({ 
      success: false, 
      message: 'Lỗi khi kiểm tra balance' 
    }, { status: 500 });
  }
}
