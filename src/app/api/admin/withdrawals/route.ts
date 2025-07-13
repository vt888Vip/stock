import { NextRequest, NextResponse } from 'next/server';
import { getMongoDb } from '@/lib/db';
import { ObjectId } from 'mongodb';
import { verifyToken } from '@/lib/auth';

// API để admin lấy danh sách yêu cầu rút tiền
export async function GET(req: NextRequest) {
  try {
    // Xác thực admin
    const token = req.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ message: 'Bạn cần đăng nhập' }, { status: 401 });
    }

    const { userId, isValid } = await verifyToken(token);
    if (!isValid || !userId) {
      return NextResponse.json({ message: 'Token không hợp lệ' }, { status: 401 });
    }

    // Kiểm tra quyền admin
    const db = await getMongoDb();
    const user = await db.collection('users').findOne({ _id: new ObjectId(userId) });
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ message: 'Không có quyền truy cập' }, { status: 403 });
    }

    // Lấy danh sách yêu cầu rút tiền
    const withdrawals = await db.collection('withdrawals')
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    return NextResponse.json({
      success: true,
      withdrawals
    });

  } catch (error) {
    console.error('Error fetching withdrawals:', error);
    return NextResponse.json({ message: 'Đã xảy ra lỗi khi lấy danh sách yêu cầu rút tiền' }, { status: 500 });
  }
}

// API để admin xử lý yêu cầu rút tiền
export async function POST(req: NextRequest) {
  try {
    // Xác thực admin
    const token = req.headers.get('authorization')?.split(' ')[1];
    if (!token) {
      return NextResponse.json({ message: 'Bạn cần đăng nhập' }, { status: 401 });
    }

    const { userId, isValid } = await verifyToken(token);
    if (!isValid || !userId) {
      return NextResponse.json({ message: 'Token không hợp lệ' }, { status: 401 });
    }

    // Kiểm tra quyền admin
    const db = await getMongoDb();
    const admin = await db.collection('users').findOne({ _id: new ObjectId(userId) });
    if (!admin || admin.role !== 'admin') {
      return NextResponse.json({ message: 'Không có quyền truy cập' }, { status: 403 });
    }

    // Parse request body
    const { withdrawalId, action, notes } = await req.json();

    if (!withdrawalId || !action) {
      return NextResponse.json({ message: 'Thiếu thông tin cần thiết' }, { status: 400 });
    }

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ message: 'Hành động không hợp lệ' }, { status: 400 });
    }

    // Lấy thông tin yêu cầu rút tiền
    const withdrawal = await db.collection('withdrawals').findOne({ withdrawalId });
    if (!withdrawal) {
      return NextResponse.json({ message: 'Không tìm thấy yêu cầu rút tiền' }, { status: 404 });
    }

    if (withdrawal.status !== 'Chờ duyệt') {
      return NextResponse.json({ message: 'Yêu cầu rút tiền đã được xử lý' }, { status: 400 });
    }

    // Cập nhật trạng thái yêu cầu rút tiền
    const updateData: any = {
      status: action === 'approve' ? 'Đã duyệt' : 'Từ chối',
      notes: notes || '',
      updatedAt: new Date(),
      processedBy: admin.username,
      processedAt: new Date()
    };

    await db.collection('withdrawals').updateOne(
      { withdrawalId },
      { $set: updateData }
    );

    // Nếu từ chối, hoàn lại số dư cho user
    if (action === 'reject') {
      await db.collection('users').updateOne(
        { _id: withdrawal.user },
        { $inc: { balance: withdrawal.amount } }
      );
    }

    return NextResponse.json({
      success: true,
      message: action === 'approve' ? 'Đã duyệt yêu cầu rút tiền' : 'Đã từ chối yêu cầu rút tiền'
    });

  } catch (error) {
    console.error('Error processing withdrawal:', error);
    return NextResponse.json({ message: 'Đã xảy ra lỗi khi xử lý yêu cầu rút tiền' }, { status: 500 });
  }
}
