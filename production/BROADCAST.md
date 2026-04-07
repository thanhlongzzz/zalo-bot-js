# Hướng dẫn Broadcast tin nhắn Zalo Bot

Tài liệu này hướng dẫn cách sử dụng endpoint `/broadcast` để gửi tin nhắn thông báo cho người dùng theo từng chủ đề (topics).

## 1. Cách đăng ký (Dành cho User)

User có thể đăng ký nhận tin nhắn thông qua các lệnh chat trực tiếp với Bot:

- `/follow`: Đăng ký nhận thông báo chung (topic: `all`).
- `/follow-[topic]`: Đăng ký nhận thông báo theo chủ đề cụ thể.
  - Ví dụ: `/follow-gold` để nhận tin về giá vàng.
  - Ví dụ: `/follow-weather` để nhận tin thời tiết.

## 2. Cách gửi Broadcast (Dành cho Admin/Hệ thống)

Bạn có thể gửi yêu cầu POST tới server của Bot (mặc định port 3000).

### Endpoint
`POST http://localhost:3000/broadcast`

### Body (JSON)
| Trường | Kiểu dữ liệu | Mô tả | Mặc định |
| :--- | :--- | :--- | :--- |
| `message` | `string` | Nội dung tin nhắn cần gửi | (Bắt buộc) |
| `topic` | `string` | Tên chủ đề cần gửi tới. Nếu bỏ trống sẽ gửi tới những người sub `all`. | `all` |

### Ví dụ sử dụng cURL

#### Gửi thông báo giá vàng:
```bash
curl -X POST http://localhost:3000/broadcast \
     -H "Content-Type: application/json" \
     -d '{
       "message": "Giá vàng SJC hôm nay tăng lên 90 triệu đồng/lượng!",
       "topic": "gold"
     }'
```

#### Gửi thông báo cho tất cả người theo dõi chung:
```bash
curl -X POST http://localhost:3000/broadcast \
     -H "Content-Type: application/json" \
     -d '{
       "message": "Chúc các bạn một ngày làm việc hiệu quả!",
       "topic": "all"
     }'
```

## 3. Quản lý dữ liệu

Tất cả thông tin user (Display Name, Chat ID, Topics) được lưu trữ tại file:
`db.json` trong thư mục gốc của backend.

Dữ liệu có dạng:
```json
{
  "users": {
    "123456789": {
      "chatId": "123456789",
      "displayName": "Long Nguyen",
      "topics": ["all", "gold"],
      "lastSeen": "2026-04-07T..."
    }
  }
}
```
