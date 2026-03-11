# Báo cáo Phân tích Debug - Dự án algo-trader

## Tổng quan
Trong quá trình kiểm tra mã nguồn của ứng dụng `algo-trader`, các công cụ phân tích đã phát hiện một số rủi ro về lỗi chạy thi (race conditions), lỗi tràn bộ nhớ / rate-limit do quá tải tác vụ không đồng bộ (asynchronous overlap) và các trường hợp nghẽn kết nối mạng (network timeout/hang).

## Chi tiết các vấn đề (Edge Cases & Runtime Errors)

### 1. Vấn đề "Race Condition" trong quá trình thực thi giao dịch (BotEngine.ts)
- **Tình trạng:** Trong phương thức `onCandle()` của `BotEngine`, nếu hai luồng tín hiệu (candle signal) được kích hoạt liên tiếp nhau quá nhanh, quá trình `executeTrade` mất một khoảng thời gian chờ I/O mạng (thông qua API sàn giao dịch). Biến trạng thái `this.openPosition` chỉ được thiết lập sau khi API thành công.
- **Rủi ro:** Khi tín hiệu thứ 2 đến trong lúc lệnh 1 chưa xong, bot sẽ ghi nhận `!this.openPosition` là `true` và kích hoạt lệnh mua thứ hai. Dẫn đến sai kích thước vốn hoặc bị từ chối lệnh do thiếu số dư.
- **Khắc phục:** Thêm biến khoá Mutual Exclusion (Mutex lock) `this.isTrading`. Nếu đang giao dịch, hệ thống sẽ bỏ qua (skip) các tín hiệu mới cho đến khi giao dịch hiện tại hoàn tất hoặc bị lỗi. Bọc lệnh `await` với `try/finally` để đảm bảo luôn giải phóng khoá.

### 2. Vấn đề "Polling Overlap" và "Thundering Herd" (LiveDataProvider.ts)
- **Tình trạng:** Lớp `LiveDataProvider` sử dụng `setInterval` để gọi hàm bất đồng bộ `poll()` sau mỗi N mili-giây.
- **Rủi ro:** Nếu sàn giao dịch phản hồi quá chậm (API endpoint bị chậm) hoặc do Rate-Limit từ CCXT kích hoạt cơ chế wait, hàm `poll()` có thể tiêu tốn thời gian thực thi dài hơn thời gian `interval`. Điều này khiến `setInterval` đẩy thêm nhiều tác vụ `poll()` mới vào hàng đợi Node.js Event Loop một cách mất kiểm soát. Kết quả là rate limit bị quá tải ngay lập tức, và ứng dụng sẽ bị treo CPU/Memory. Ngoài ra, việc khởi tạo "seed" (getHistory 1 candle đầu) trong hàm `start()` cũng chưa có `try/catch`, nếu API tạm rớt mạng lúc bot vừa khởi động, chương trình sẽ sập (Unhandled Rejection).
- **Khắc phục:** Thêm cờ `isPolling` (tương tự mutex lock) trong bộ xử lý của `setInterval`. Nếu lượt trước chưa chạy xong, lượt hiện tại sẽ chỉ ghi log báo bỏ qua (skip tick). Ngoài ra, thêm `try/catch` cho hàm mồi (seed candle).

### 3. Vấn đề nghẽn vô thời hạn (Silent Network Hang) (ExchangeClient.ts)
- **Tình trạng:** Khởi tạo `ccxt.Exchange` hiện tại không truyền vào cấu hình `timeout`.
- **Rủi ro:** Khi xảy ra hiện tượng "half-open connection" (TCP connection bị sập một nửa từ phía server) hoặc sàn giao dịch ngừng phản hồi (blackhole routing), hàm `fetchOHLCV` hoặc `createOrder` sẽ chờ đợi vô hạn (không có lỗi báo ra, cũng không ném ngoại lệ). Toàn bộ hệ thống bot sẽ đóng băng tĩnh lặng (silent fail).
- **Khắc phục:** Cấu hình tham số `timeout: 30000` (30 giây) mặc định vào constructor cấu hình của `ExchangeClient`. Các lệnh bất đồng bộ sẽ chủ động ném `RequestTimeout` error sau 30 giây để tiến trình có thể catch và thử lại.

## Kết luận
Sau khi phân tích, 3 lỗ hổng này đã được giải quyết ở 3 files. Các chỉnh sửa đều được thực hiện dưới dạng bảo vệ trạng thái nội bộ bằng cờ cấm tái truy nhập (reentrancy guard) và bổ sung các cơ chế bắt lỗi an toàn (safe try/catch và timeout config).
