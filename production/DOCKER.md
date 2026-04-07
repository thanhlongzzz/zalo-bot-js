# Hướng dẫn Chạy Zalo Bot với Docker

Tài liệu này hướng dẫn cách build và triển khai Zalo Bot bằng Docker và Docker Compose.

## 1. Cấu trúc Docker

Dự án bao gồm 2 file cấu hình chính:
- `Dockerfile`: Định nghĩa cách build môi trường Node.js và ứng dụng.
- `docker-compose.yaml`: Quản lý container, cổng kết nối (port) và lưu trữ dữ liệu (volumes).

## 2. Các tham số cấu hình

Trước khi chạy, hãy đảm bảo file `.env` ở thư mục gốc có tối thiểu các thông tin:
```env
ZALO_BOT_TOKEN=your_token_here
USE_WEBHOOK=false
PORT=5005
```

## 3. Cách triển khai

### Bước 1: Build và khởi chạy container
Tại thư mục gốc của dự án, chạy lệnh:
```bash
docker compose up -d --build
```
- `-d`: Chạy ở chế độ nền (detached mode).
- `--build`: Build lại image mới từ source code hiện tại.

### Bước 2: Kiểm tra trạng thái
```bash
docker compose ps
```

### Bước 3: Xem log của ứng dụng
```bash
docker compose logs -f zalo-bot
```

## 4. Quản lý Dữ liệu và Port

- **Port mapping**: Ứng dụng bên trong container chạy tại cổng `5005` và được map ra ngoài tại cổng `5005`. Bạn có thể thay đổi trong `docker-compose.yaml`.
- **Dữ liệu vĩnh viễn (Persistence)**:
  - File `db.json` được mount từ máy host vào container. Toàn bộ thông tin user và topic sẽ không bị mất khi bạn dừng hoặc xóa container.
- **Cấu hình nhanh**:
  - File `.env` được mount trực tiếp. Nếu bạn thay đổi Token hoặc các tham số khác, bạn chỉ cần khởi động lại container: `docker compose restart`.

## 5. Dừng ứng dụng
Để dừng và xóa container:
```bash
docker compose down
```
*(Lưu ý: lệnh này không xóa file dữ liệu `db.json` vì nó đã được mount ra ngoài).*
