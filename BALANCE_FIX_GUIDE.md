# 🔧 Hướng dẫn sửa lỗi Balance

## 🚨 Vấn đề đã được sửa

### **Lỗi 1: Số dư không cập nhật real-time**
- ✅ **Nguyên nhân**: Logic cập nhật UI không đồng bộ
- ✅ **Giải pháp**: Cập nhật lịch sử trước, sau đó mới cập nhật số dư với force sync

### **Lỗi 2: Balance sync sai (ăn 500k thay vì 100k)**
- ✅ **Nguyên nhân**: Logic `processWinTrade` không chính xác
- ✅ **Giải pháp**: Sửa logic để `available += (tradeAmount + profit)` và `frozen -= tradeAmount`

## 🛠️ Cách sử dụng

### **1. Sử dụng Script (Khuyến nghị)**

```bash
# Kiểm tra và sửa balance
npm run fix-balance

# Hoặc
node scripts/test-balance.js
```

Script sẽ:
- Tìm tất cả users có balance không hợp lệ
- Hiển thị danh sách chi tiết
- Hỏi xác nhận trước khi sửa
- Sửa balance tự động
- Kiểm tra lại sau khi sửa

### **2. Sử dụng Admin Dashboard**

1. Đăng nhập vào admin dashboard
2. Chọn tab **"Sửa Balance"**
3. Nhấn **"Kiểm tra Balance không hợp lệ"**
4. Xem danh sách users có vấn đề
5. Nhấn **"Sửa"** cho từng user

### **3. Sử dụng API trực tiếp**

```bash
# Kiểm tra users có balance không hợp lệ
GET /api/admin/fix-balance

# Sửa balance cho user cụ thể
POST /api/admin/fix-balance
{
  "userId": "user_id_here"
}
```

## 🔍 Các loại lỗi balance

### **1. Balance âm**
```javascript
// Lỗi
balance: {
  available: -50000,  // ❌ Âm
  frozen: -100000     // ❌ Âm
}

// Sửa thành
balance: {
  available: 0,       // ✅ Không âm
  frozen: 0           // ✅ Không âm
}
```

### **2. Balance định dạng cũ**
```javascript
// Lỗi (kiểu cũ)
balance: 1000000      // ❌ Number

// Sửa thành (kiểu mới)
balance: {
  available: 1000000, // ✅ Object
  frozen: 0
}
```

### **3. Balance không nhất quán**
```javascript
// Lỗi - logic không đúng
// Khi thắng: chỉ cộng profit, không trả tiền gốc
available += profit        // ❌ Sai
frozen -= tradeAmount      // ❌ Sai

// Sửa thành - logic đúng
available += (tradeAmount + profit)  // ✅ Trả gốc + lợi nhuận
frozen -= tradeAmount                // ✅ Trừ tiền đóng băng
```

## 📊 Monitoring

### **Logs quan trọng**

```javascript
// Khi đặt lệnh
console.log(`🚀 [PLACE TRADE] User ${username} đặt lệnh ${direction} - ${amount} VND`);

// Khi thắng
console.log(`✅ [BALANCE WIN] User ${userId}: available +${tradeAmount + profit} (gốc + lợi nhuận), frozen -${tradeAmount} (trả gốc)`);

// Khi thua
console.log(`❌ [BALANCE LOSE] User ${userId}: frozen -${tradeAmount} (mất tiền gốc)`);

// Khi sync balance
console.log(`🔄 [SYNC] Force sync balance cho user ${username}`);
```

### **Kiểm tra real-time**

1. Mở Developer Tools (F12)
2. Xem Console logs
3. Theo dõi các log có tag `[BALANCE]`, `[SYNC]`, `[UI]`

## 🚀 Cải tiến đã thực hiện

### **1. Logic Balance chính xác**
- ✅ Sử dụng MongoDB transactions để tránh race condition
- ✅ Logic thắng/thua rõ ràng và nhất quán
- ✅ Validation balance sau mỗi thao tác

### **2. UI Updates đồng bộ**
- ✅ Cập nhật lịch sử trước, số dư sau
- ✅ Force sync để đảm bảo cập nhật
- ✅ Thông báo thành công/lỗi cho user

### **3. Admin Tools**
- ✅ Tab "Sửa Balance" trong admin dashboard
- ✅ API endpoints để kiểm tra và sửa
- ✅ Script tự động sửa hàng loạt

### **4. Monitoring & Debug**
- ✅ Logs chi tiết cho mọi thao tác
- ✅ Validation balance real-time
- ✅ Error handling và recovery

## ⚠️ Lưu ý quan trọng

1. **Backup database** trước khi chạy script sửa balance
2. **Test trên môi trường dev** trước khi áp dụng production
3. **Monitor logs** sau khi deploy để đảm bảo không có lỗi
4. **Kiểm tra balance** định kỳ để phát hiện sớm vấn đề

## 🎯 Kết quả mong đợi

Sau khi áp dụng các sửa đổi:

- ✅ Số dư cập nhật real-time sau 12 giây
- ✅ Balance chính xác, không bị ăn sai tiền
- ✅ Không còn race condition
- ✅ Admin có tools để quản lý balance
- ✅ Logs rõ ràng để debug

## 📞 Hỗ trợ

Nếu gặp vấn đề:

1. Kiểm tra logs trong console
2. Chạy script `fix-balance` để sửa tự động
3. Sử dụng admin dashboard để sửa thủ công
4. Liên hệ developer nếu cần hỗ trợ thêm
