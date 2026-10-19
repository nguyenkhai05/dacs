Đặt Sân Nhanh — Hệ thống đặt sân thể thao trực tuyến
Dự án gồm giao diện người dùng viết bằng React + TypeScript + Vite và API viết bằng NestJS, sử dụng MySQL để lưu dữ liệu. README này hướng dẫn thiết lập và chạy dự án trên máy cá nhân.
Lưu ý: Backend cần MySQL đang hoạt động và có dữ liệu/schema của dự án. Việc đổi DB_PORT trong .env chỉ thay đổi cổng mà backend kết nối tới; nó không khởi động MySQL và cũng không thay thế bước tạo database.

1. Công nghệ sử dụng

- Node.js và npm
- NestJS (backend/API)
- React, TypeScript, Vite (frontend)
- MySQL và thư viện mysql2
- JWT để xác thực; bcrypt để băm mật khẩu

2. Cấu trúc thư mục
   dacs-main/
   ├── db/
   │ └── migrations/ # Migration dùng khi nâng cấp database thêm sau football_pitch_db.sql
   ├── frontend/ # Giao diện React + Vite
   │ ├── src/
   │ ├── .env  
   │ └── package.json
   ├── nest/ # Backend NestJS
   │ ├── src/
   │ ├── scripts/ # Script tạo tài khoản Admin
   │ ├── .env  
   │ └── package.json
   ├── football_pitch_db.sql # Schema + dữ liệu mẫu để cài
   └── README.md
3. Yêu cầu trước khi chạy
4. Node.js phiên bản 22 trở lên được khuyến nghị. Kiểm tra bằng:
   node -v
   npm -v
5. MySQL đang chạy trên máy hoặc trên máy chủ mà máy bạn có thể truy cập. Bạn cần biết host, cổng, tên database, username và password.
6. Git nếu muốn clone repository.
7. Trình duyệt hiện đại để mở frontend.
   Không cần cài Nest CLI toàn cục: các lệnh npm run sẽ sử dụng công cụ được cài trong dependencies của dự án.
8. Lấy mã nguồn
   Nếu clone từ Git:
   git clone <https://github.com/nguyenkhai05/dacs.git>
   cd dacs-main
   Nếu tải ZIP, giải nén rồi mở terminal tại thư mục gốc dacs-main/ — nơi có football_pitch_db.sql, frontend/ và nest/.
9. Chuẩn bị MySQL
   Cài đặt database mới
   Tạo database/schema MySQL mà bạn muốn dùng. Sau đó, từ thư mục gốc dự án, nạp file SQL đi kèm. Ví dụ nếu MySQL chạy trên máy và tài khoản là root:
   mysql -u root -p < football_pitch_db.sql
   Nhập mật khẩu MySQL khi được hỏi. Nếu máy bạn không nhận lệnh mysql, hãy mở MySQL Workbench hoặc công cụ quản trị MySQL khác, chọn đúng kết nối và chạy nội dung file football_pitch_db.sql.

Nếu MySQL chạy ở host/cổng khác, hãy chỉ định thông tin kết nối tương ứng cho lệnh mysql hoặc chọn đúng kết nối trong Workbench(hoặc hệ quản trị khác). Không cần chạy các migration riêng lẻ để cài mới nếu file football_pitch_db.sql đã là bản schema gộp được cung cấp trong repository.
Nếu đã có database từ phiên bản cũ
Sao lưu database trước khi thay đổi. Thư mục db/migrations/ dành cho việc nâng cấp schema cũ; không chạy tùy tiện tất cả migration trên một database mới đã được nạp từ file SQL gộp. Đọc nội dung migration và xác định phiên bản database trước khi áp dụng.
Các bước sau đây giả định MySQL đã chạy, database đã được nạp và thông tin kết nối là chính xác.

6. Cấu hình backend NestJS
   Mở terminal tại thư mục gốc rồi chuyển vào backend:
   cd nest
   nội dung file.env bên dưới và thay các giá trị bằng thông tin thực tế:
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=mat_khau_mysql_cua_ban
   DB_NAME=football_pitch_db

JWT_SECRET=THAY_BANG_CHUOI_BI_MAT_DUOC_TAO_O_BUOC_6_1
PORT=3000

CORS_ORIGIN=http://localhost:5173

PAYMENT_BANK_ID=
PAYMENT_BANK_NAME=
PAYMENT_ACCOUNT_NUMBER=
PAYMENT_ACCOUNT_NAME=
PAYMENT_WEBHOOK_SECRET=
Quan trọng: DB_NAME phải khớp tên database bạn thực sự đã tạo/nạp SQL. Nếu tên schema trong MySQL khác football_pitch_db, hãy sửa lại giá trị này. DB_PORT phải là cổng MySQL thực tế; nếu bạn đã đổi cổng thì ghi cổng mới tại đây. DB_HOST=127.0.0.1 phù hợp khi MySQL có thể truy cập qua loopback trên cùng máy. Nếu MySQL ở máy khác, dùng hostname/IP tương ứng.

Các biến thanh toán có thể để trống khi chỉ thử những phần không cần tích hợp ngân hàng. Chức năng QR/chuyển khoản và webhook không thể kiểm thử đầy đủ nếu chưa cấu hình thông tin thanh toán hợp lệ.
6.1. Tạo JWT_SECRET
JWT_SECRET là khóa bí mật backend dùng để ký/kiểm tra JSON Web Token. Không dùng một chuỗi dễ đoán như secret, 123456 hoặc giá trị ví dụ bên trên.

Trong terminal, chạy lệnh sau bằng Node.js:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
Lệnh tạo ra 32 byte ngẫu nhiên và in thành chuỗi hexadecimal 64 ký tự. Sao chép kết quả và dán vào JWT*SECRET trong nest/.env, ví dụ:
JWT_SECRET=dan_chuoi_ngau_nhien_vua_tao_vao_day
Dòng ví dụ trên chỉ minh họa vị trí cần điền, không dùng nguyên văn. Giữ giá trị này riêng tư, không commit lên Git. Nếu thay khóa, các token đã được ký bằng khóa cũ thường sẽ không còn hợp lệ và người dùng có thể phải đăng nhập lại.
6.2. Cài dependencies backend
Vẫn ở thư mục nest/, chạy:
npm install
Nếu repository có package-lock.json và bạn muốn cài đúng dependency đã khóa, có thể dùng npm ci thay cho npm install trên một môi trường sạch.
6.3. Tạo tài khoản Admin đầu tiên
Đảm bảo database đã được nạp và các biến DB*\* trong nest/.env đúng. Chạy lệnh từ chính thư mục nest/:
node scripts/create-admin.mjs
Script sẽ hỏi email, số điện thoại, họ tên và mật khẩu. Mật khẩu cần tối thiểu 8 ký tự; hãy dùng mật khẩu riêng để thử nghiệm. Script tạo tài khoản hoặc cập nhật tài khoản trùng email/số điện thoại và gán vai trò Admin/Staff.

Nếu cần truyền thông tin trực tiếp, script hỗ trợ các tham số như sau (tránh dùng cách này trên máy dùng chung vì mật khẩu có thể lưu trong lịch sử lệnh):
node scripts/create-admin.mjs --email admin@example.com --phone 0900000000 --name "Quan tri vien"
Khi không truyền --password, script sẽ hỏi mật khẩu tương tác. Không nên đặt mật khẩu thật trong dòng lệnh.
6.4. Chạy backend
npm run start:dev
Mặc định API chạy tại http://localhost:3000. Giữ terminal này mở trong khi sử dụng ứng dụng. Để dừng server, nhấn Ctrl+C.

Mở đường dẫn kiểm tra sức khỏe:

- http://localhost:3000/health
  Endpoint này giúp kiểm tra tình trạng backend và kết nối/dữ liệu database. Nếu backend báo lỗi database, kiểm tra MySQL và các biến DB\_\* trước khi tiếp tục.

7. Cấu hình và chạy frontend React
   Mở terminal thứ hai, chuyển về thư mục gốc dự án nếu cần, sau đó:
   cd frontend
   Tạo file frontend/.env với nội dung:
   VITE*API_URL=http://localhost:3000
   VITE_API_URL là địa chỉ backend mà frontend gọi. Nếu backend chạy ở cổng khác, cập nhật URL cho khớp. Biến có tiền tố VITE* được đưa vào mã frontend khi build, vì vậy không đặt secret, mật khẩu hay JWT secret trong file này.

Cài dependencies:
npm install
Chạy máy chủ phát triển:
npm run dev
Vite thường hiển thị địa chỉ như http://localhost:5173. Mở địa chỉ mà terminal in ra trong trình duyệt. Giữ terminal này mở khi thử ứng dụng. Dừng bằng Ctrl+C. 8. Thử nghiệm ứng dụng

1. Xác nhận MySQL đang chạy và database đã được nạp.
2. Chạy backend trong terminal thứ nhất và kiểm tra http://localhost:3000/health.
3. Chạy frontend trong terminal thứ hai và mở địa chỉ Vite, mặc định http://localhost:5173.
4. Thử xem trang chủ/danh sách sân, mở chi tiết sân và xem đánh giá.
5. Thử đăng ký tài khoản khách hàng rồi đăng nhập. Nếu đăng ký/đăng nhập lỗi, xem phần xử lý sự cố bên dưới và log backend.
6. Dùng tài khoản Admin đã tạo ở bước 6.3 để kiểm tra các màn quản trị có trong phiên bản hiện tại.
7. Các thao tác đặt sân, thanh toán, webhook, gửi email và hoàn tiền có thể cần dữ liệu phù hợp hoặc cấu hình tích hợp bổ sung; không xem việc giao diện hiển thị là bằng chứng rằng thanh toán thật đã được thực hiện.
8. Lệnh hữu ích
   Backend (nest/)
   npm run start:dev # chạy phát triển, tự khởi động lại khi sửa code
   npm run build # build backend
   npm run start:prod # chạy bản build (sau khi build)
   npm test # chạy unit test
   npm run test:e2e # chạy end-to-end test
   npm run lint # kiểm tra lint
   Frontend (frontend/)
   npm run dev # chạy Vite dev server
   npm run build # kiểm tra TypeScript và build frontend
   npm run preview # xem thử bản build cục bộ
   npm test # chạy test một lần
   npm run test:watch # chạy test theo dõi thay đổi
9. Xử lý sự cố thường gặp
   Không mở được http://localhost:3000/health

- Kiểm tra terminal backend còn chạy hay đã thoát do lỗi.
- Kiểm tra PORT trong nest/.env và URL đang mở.
- Nếu log nói thiếu JWT_SECRET, tạo secret theo mục 6.1.
- Nếu cổng đã được chương trình khác sử dụng, đổi PORT và cập nhật VITE_API_URL ở frontend cho khớp.
  Backend không kết nối được MySQL
- Xác nhận MySQL thực sự đang chạy; đổi DB_PORT trong .env không tự khởi động MySQL.
- Kiểm tra DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME.
- Đảm bảo người dùng MySQL có quyền truy cập schema đã chọn.
- Kiểm tra đã nạp đúng football_pitch_db.sql vào đúng database chưa.
  Trang frontend mở được nhưng không lấy được dữ liệu
- Kiểm tra backend đang chạy.
- Kiểm tra frontend/.env có VITE_API_URL=http://localhost:3000 và đúng cổng backend.
- Sau khi sửa .env, dừng rồi chạy lại npm run dev để Vite đọc cấu hình mới.
- Mở Developer Tools của trình duyệt (F12), xem tab Console và Network để đọc lỗi API/CORS. Ở chế độ phát triển, backend cho phép origin localhost; nếu frontend chạy ở hostname/cổng khác, kiểm tra CORS_ORIGIN.
  Báo thiếu bảng/cột hoặc thiếu vai trò
- Đảm bảo bạn đã nạp đúng file SQL gộp của dự án vào đúng schema.
- Nếu đang dùng database cũ, xác định migration nào còn thiếu và sao lưu trước khi nâng cấp.
- Nếu log báo thiếu Admin, Staff hoặc Customer, kiểm tra dữ liệu bảng roles trong database.
  Đăng nhập báo sai thông tin hoặc bị giới hạn
- Kiểm tra email/số điện thoại và mật khẩu.
- Script tạo Admin phải chạy thành công trên đúng database.
- Đăng nhập sai nhiều lần có thể bị giới hạn tạm thời; chờ hết thời gian giới hạn rồi thử lại.
