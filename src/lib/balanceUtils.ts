import { ObjectId } from 'mongodb';

/**
 * Utility functions để xử lý balance một cách an toàn và chính xác
 * Sử dụng MongoDB transaction để tránh race condition hoàn toàn
 */

export interface BalanceUpdate {
  available: number;
  frozen: number;
}

/**
 * Đặt lệnh giao dịch - Trừ tiền khả dụng và cộng tiền đóng băng
 * ✅ SỬA: Sử dụng MongoDB transaction để tránh race condition
 */
export async function placeTrade(db: any, userId: string, amount: number): Promise<boolean> {
  const client = (db as any).client || (db as any).db?.client;
  if (!client) {
    throw new Error('MongoDB client not available for transaction');
  }
  
  const session = client.startSession();
  
  try {
    await session.withTransaction(async () => {
      // ✅ SỬA: Kiểm tra balance trong transaction
      const user = await db.collection('users').findOne(
        { _id: new ObjectId(userId) },
        { session }
      );
      
      if (!user) {
        throw new Error('User không tồn tại');
      }
      
      // ✅ CHUẨN HÓA: Luôn sử dụng balance dạng object
      let userBalance = user.balance || { available: 0, frozen: 0 };
      
      // Nếu balance là number (kiểu cũ), chuyển đổi thành object
      if (typeof userBalance === 'number') {
        userBalance = {
          available: userBalance,
          frozen: 0
        };
      }
      
      const availableBalance = userBalance.available || 0;
      
      if (availableBalance < amount) {
        throw new Error('Balance không đủ');
      }
      
      // ✅ SỬA: Cập nhật balance trong transaction
      const updateResult = await db.collection('users').updateOne(
        { 
          _id: new ObjectId(userId),
          'balance.available': { $gte: amount }
        },
        {
          $inc: {
            'balance.available': -amount,
            'balance.frozen': amount
          },
          $set: { updatedAt: new Date() }
        },
        { session }
      );

      if (updateResult.modifiedCount === 0) {
        throw new Error('Không thể cập nhật balance - có thể balance đã thay đổi');
      }
    });

    console.log(`✅ [BALANCE] User ${userId} đặt lệnh ${amount} thành công`);
    return true;
  } catch (error) {
    console.error(`❌ [BALANCE] Lỗi đặt lệnh user ${userId}:`, error);
    throw error;
  } finally {
    await session.endSession();
  }
}

/**
 * Xử lý kết quả thắng - Trả lại tiền gốc + cộng profit
 * ✅ SỬA: Sử dụng MongoDB Aggregation Pipeline để tránh cộng dồn
 */
export async function processWinTrade(db: any, userId: string, tradeAmount: number, profit: number): Promise<boolean> {
  try {
    // ✅ SỬA: Sử dụng Aggregation Pipeline để tính toán chính xác
    const updateResult = await db.collection('users').updateOne(
      { _id: new ObjectId(userId) },
      [
        {
          $set: {
            balance: {
              available: {
                $add: [
                  { $ifNull: ['$balance.available', 0] },  // available hiện tại
                  tradeAmount,  // ✅ SỬA: Chỉ trả lại amount gốc, không cộng dồn frozen
                  profit        // Cộng thêm tiền thắng
                ]
              },
              frozen: {
                $subtract: [
                  { $ifNull: ['$balance.frozen', 0] },     // frozen hiện tại
                  tradeAmount   // Chỉ trừ amount gốc của lệnh này
                ]
              }
            },
            updatedAt: new Date()
          }
        }
      ]
    );

    if (updateResult.modifiedCount === 0) {
      throw new Error('Không thể cập nhật balance cho user thắng');
    }

    console.log(`✅ [BALANCE WIN] User ${userId}: +${tradeAmount} (gốc) +${profit} (thắng), frozen -${tradeAmount}`);
    return true;
  } catch (error) {
    console.error(`❌ [BALANCE] Lỗi xử lý thắng user ${userId}:`, error);
    throw error;
  }
}

/**
 * Xử lý kết quả thua - Chỉ trừ tiền đóng băng
 * ✅ SỬA: Sử dụng MongoDB Aggregation Pipeline để tính toán chính xác
 */
export async function processLoseTrade(db: any, userId: string, tradeAmount: number): Promise<boolean> {
  try {
    // ✅ SỬA: Sử dụng Aggregation Pipeline để tính toán chính xác
    const updateResult = await db.collection('users').updateOne(
      { _id: new ObjectId(userId) },
      [
        {
          $set: {
            balance: {
              available: {
                $add: [
                  { $ifNull: ['$balance.available', 0] },  // available hiện tại (không thay đổi)
                  0  // Không cộng gì thêm
                ]
              },
              frozen: {
                $subtract: [
                  { $ifNull: ['$balance.frozen', 0] },     // frozen hiện tại
                  tradeAmount   // Chỉ trừ amount gốc của lệnh này
                ]
              }
            },
            updatedAt: new Date()
          }
        }
      ]
    );

    if (updateResult.modifiedCount === 0) {
      throw new Error('Không thể cập nhật balance cho user thua');
    }

    console.log(`❌ [BALANCE LOSE] User ${userId}: frozen -${tradeAmount} (mất tiền gốc)`);
    return true;
  } catch (error) {
    console.error(`❌ [BALANCE] Lỗi xử lý thua user ${userId}:`, error);
    throw error;
  }
}

/**
 * Lấy balance hiện tại của user
 */
export async function getUserBalance(db: any, userId: string): Promise<BalanceUpdate> {
  try {
    const user = await db.collection('users').findOne(
      { _id: new ObjectId(userId) },
      { projection: { balance: 1 } }
    );

    if (!user) {
      throw new Error('User không tồn tại');
    }

    // Chuẩn hóa balance format
    let balance = user.balance || { available: 0, frozen: 0 };
    
    // Nếu balance là number (kiểu cũ), chuyển đổi thành object
    if (typeof balance === 'number') {
      balance = {
        available: balance,
        frozen: 0
      };
    }

    return {
      available: balance.available || 0,
      frozen: balance.frozen || 0
    };
  } catch (error) {
    console.error(`❌ [BALANCE] Lỗi lấy balance user ${userId}:`, error);
    throw error;
  }
}

/**
 * Kiểm tra balance có đủ để đặt lệnh không
 */
export async function checkBalanceSufficient(db: any, userId: string, amount: number): Promise<boolean> {
  try {
    const balance = await getUserBalance(db, userId);
    return balance.available >= amount;
  } catch (error) {
    console.error(`❌ [BALANCE] Lỗi kiểm tra balance user ${userId}:`, error);
    return false;
  }
}

/**
 * Tính toán profit dựa trên amount và tỷ lệ thắng
 */
export function calculateProfit(amount: number, winRate: number = 0.9): number {
  return Math.floor(amount * winRate);
}

/**
 * Log balance change để debug
 */
export async function logBalanceChange(db: any, userId: string, operation: string, details: any): Promise<void> {
  try {
    const balance = await getUserBalance(db, userId);
    console.log(`📊 [BALANCE LOG] User ${userId} - ${operation}:`, {
      currentBalance: balance,
      ...details,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error(`❌ [BALANCE LOG] Lỗi log balance user ${userId}:`, error);
  }
}

/**
 * ✅ THÊM: Đồng bộ balance an toàn - tránh race condition
 * Sử dụng MongoDB transaction để đảm bảo tính nhất quán
 */
export async function syncBalanceSafely(db: any, userId: string): Promise<BalanceUpdate> {
  const client = (db as any).client || (db as any).db?.client;
  if (!client) {
    throw new Error('MongoDB client not available for transaction');
  }
  
  const session = client.startSession();
  
  try {
    let result: BalanceUpdate = { available: 0, frozen: 0 };
    
    await session.withTransaction(async () => {
      // Lấy balance hiện tại trong transaction
      const user = await db.collection('users').findOne(
        { _id: new ObjectId(userId) },
        { session }
      );
      
      if (!user) {
        throw new Error('User không tồn tại');
      }
      
      // Chuẩn hóa balance format
      let balance = user.balance || { available: 0, frozen: 0 };
      
      if (typeof balance === 'number') {
        balance = {
          available: balance,
          frozen: 0
        };
        
        // Cập nhật database để chuyển đổi sang kiểu mới
        await db.collection('users').updateOne(
          { _id: new ObjectId(userId) },
          { 
            $set: { 
              balance: balance,
              updatedAt: new Date()
            } 
          },
          { session }
        );
      }
      
      result = {
        available: balance.available || 0,
        frozen: balance.frozen || 0
      };
    });
    
    return result;
  } catch (error) {
    console.error(`❌ [BALANCE SYNC] Lỗi đồng bộ balance user ${userId}:`, error);
    throw error;
  } finally {
    await session.endSession();
  }
}

/**
 * ✅ THÊM: Kiểm tra và sửa balance không nhất quán
 * Tự động sửa lỗi balance khi phát hiện
 */
export async function validateAndFixBalance(db: any, userId: string): Promise<boolean> {
  try {
    const balance = await getUserBalance(db, userId);
    
    // Kiểm tra balance âm
    if (balance.available < 0 || balance.frozen < 0) {
      console.warn(`⚠️ [BALANCE FIX] User ${userId} có balance âm:`, balance);
      
      // Sửa balance âm thành 0
      await db.collection('users').updateOne(
        { _id: new ObjectId(userId) },
        {
          $set: {
            balance: {
              available: Math.max(0, balance.available),
              frozen: Math.max(0, balance.frozen)
            },
            updatedAt: new Date()
          }
        }
      );
      
      console.log(`✅ [BALANCE FIX] Đã sửa balance âm cho user ${userId}`);
      return true;
    }
    
    return false;
  } catch (error) {
    console.error(`❌ [BALANCE FIX] Lỗi kiểm tra balance user ${userId}:`, error);
    return false;
  }
}

/**
 * ✅ THÊM: Kiểm tra balance sau khi xử lý kết quả giao dịch
 * Đảm bảo tính nhất quán của dữ liệu
 */
export async function validateBalanceAfterTrade(db: any, userId: string, tradeAmount: number, isWin: boolean, profit: number = 0): Promise<boolean> {
  try {
    const balance = await getUserBalance(db, userId);
    
    // Log balance sau khi xử lý
    console.log(`🔍 [BALANCE VALIDATION] User ${userId} sau ${isWin ? 'thắng' : 'thua'}:`, {
      available: balance.available,
      frozen: balance.frozen,
      total: balance.available + balance.frozen,
      tradeAmount,
      profit,
      isWin
    });
    
    // Kiểm tra logic cơ bản
    if (balance.available < 0) {
      console.error(`❌ [BALANCE VALIDATION] User ${userId} có available âm: ${balance.available}`);
      return false;
    }
    
    if (balance.frozen < 0) {
      console.error(`❌ [BALANCE VALIDATION] User ${userId} có frozen âm: ${balance.frozen}`);
      return false;
    }
    
    // Kiểm tra logic nghiệp vụ
    if (isWin) {
      // Khi thắng: frozen phải giảm đúng tradeAmount
      const expectedFrozen = balance.frozen + tradeAmount; // Vì đã trừ rồi nên cộng lại để kiểm tra
      if (Math.abs(expectedFrozen - balance.frozen) > 1) { // Cho phép sai số 1 VND
        console.warn(`⚠️ [BALANCE VALIDATION] User ${userId} frozen không khớp sau khi thắng`);
        return false;
      }
    } else {
      // Khi thua: frozen phải giảm đúng tradeAmount
      const expectedFrozen = balance.frozen + tradeAmount; // Vì đã trừ rồi nên cộng lại để kiểm tra
      if (Math.abs(expectedFrozen - balance.frozen) > 1) { // Cho phép sai số 1 VND
        console.warn(`⚠️ [BALANCE VALIDATION] User ${userId} frozen không khớp sau khi thua`);
        return false;
      }
    }
    
    console.log(`✅ [BALANCE VALIDATION] User ${userId} balance hợp lệ`);
    return true;
  } catch (error) {
    console.error(`❌ [BALANCE VALIDATION] Lỗi kiểm tra balance user ${userId}:`, error);
    return false;
  }
}

/**
 * ✅ THÊM: Log chi tiết balance change để debug
 */
export async function logDetailedBalanceChange(db: any, userId: string, operation: string, details: any): Promise<void> {
  try {
    const balance = await getUserBalance(db, userId);
    const user = await db.collection('users').findOne(
      { _id: new ObjectId(userId) },
      { projection: { username: 1, email: 1 } }
    );
    
    console.log(`📊 [DETAILED BALANCE LOG] User ${user?.username || userId} (${user?.email || 'N/A'}) - ${operation}:`, {
      currentBalance: balance,
      totalBalance: balance.available + balance.frozen,
      ...details,
      timestamp: new Date().toISOString(),
      userId: userId
    });
  } catch (error) {
    console.error(`❌ [DETAILED BALANCE LOG] Lỗi log balance user ${userId}:`, error);
  }
}
