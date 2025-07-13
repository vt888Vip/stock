import { NextRequest, NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';

export async function GET(request: NextRequest) {
  try {
    const client = await clientPromise;
    const db = client.db();
    
    // Kiểm tra quyền admin (có thể thêm middleware sau)
    const token = request.headers.get('authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Lấy danh sách người dùng
    const users = await db.collection('users')
      .find({})
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    // Lấy thông tin số dư từ field balance
    const usersWithBalance = users.map(user => {
      const userBalance = user.balance || { available: 0, frozen: 0 };
      const availableBalance = typeof userBalance === 'number' ? userBalance : userBalance.available || 0;
      const frozenBalance = typeof userBalance === 'number' ? 0 : userBalance.frozen || 0;

      return {
        _id: user._id,
        username: user.username,
        email: user.email,
        role: user.role || 'user',
        balance: {
          available: availableBalance,
          frozen: frozenBalance,
          total: availableBalance + frozenBalance
        },
        status: user.status || { active: true, betLocked: false, withdrawLocked: false },
        verification: user.verification || { verified: false },
        bank: user.bank || { name: '', accountNumber: '', accountHolder: '' },
        createdAt: user.createdAt,
        lastLogin: user.lastLogin
      };
    });

    return NextResponse.json({
      users: usersWithBalance
    });
    
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 