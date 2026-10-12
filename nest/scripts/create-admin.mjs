// Tạo (hoặc nâng quyền) tài khoản Admin đầu tiên.
// Chạy trong thư mục nest/:
//   npm run create-admin -- --email admin@example.com --phone 0900000000 --name "Quản trị viên" --password "MatKhauManh@123"
// Hoặc không truyền --password: script sẽ hỏi (không hiện lên màn hình lịch sử lệnh).
import { createInterface } from 'node:readline/promises';
import bcrypt from 'bcrypt';
import mysql from 'mysql2/promise';

try {
  process.loadEnvFile('.env');
} catch {
  console.error('Không đọc được file .env trong thư mục hiện tại. Hãy chạy lệnh trong thư mục nest/.');
  process.exit(1);
}

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : undefined;
}

async function ask(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim();
}

const email = (arg('email') ?? (await ask('Email Admin: '))).toLowerCase();
const phone = arg('phone') ?? (await ask('Số điện thoại (10-11 số): '));
const name = arg('name') ?? (await ask('Họ và tên: '));
const password = arg('password') ?? (await ask('Mật khẩu (>= 8 ký tự): '));

if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Email không hợp lệ');
if (!/^[0-9]{10,11}$/.test(phone)) throw new Error('Số điện thoại phải có 10-11 chữ số');
if (!name) throw new Error('Họ và tên không được trống');
if (password.length < 8 || Buffer.byteLength(password) > 72) {
  throw new Error('Mật khẩu phải từ 8 ký tự và tối đa 72 byte');
}

const connection = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD ?? '',
  database: process.env.DB_NAME,
});

try {
  await connection.beginTransaction();

  const [roleRows] = await connection.execute(
    "SELECT role_id, role_name FROM roles WHERE role_name IN ('Admin','Staff')",
  );
  const roleId = (name) => roleRows.find((r) => r.role_name === name)?.role_id;
  if (!roleId('Admin') || !roleId('Staff')) {
    throw new Error('Bảng roles chưa có Admin/Staff. Hãy chạy football_pitch_db.sql trước.');
  }

  const [existing] = await connection.execute(
    'SELECT user_id FROM users WHERE email = ? OR phone_number = ? LIMIT 1',
    [email, phone],
  );

  let userId;
  if (existing.length > 0) {
    userId = existing[0].user_id;
    const hash = await bcrypt.hash(password, 10);
    await connection.execute(
      'UPDATE users SET full_name = ?, email = ?, phone_number = ?, password_hash = ?, is_active = TRUE WHERE user_id = ?',
      [name, email, phone, hash, userId],
    );
    console.log(`Tài khoản đã tồn tại (user_id=${userId}): cập nhật mật khẩu và nâng quyền Admin.`);
  } else {
    const hash = await bcrypt.hash(password, 10);
    const [result] = await connection.execute(
      'INSERT INTO users (full_name, phone_number, email, password_hash) VALUES (?, ?, ?, ?)',
      [name, phone, email, hash],
    );
    userId = result.insertId;
  }

  await connection.execute(
    'INSERT IGNORE INTO employees (user_id, employee_code, position) VALUES (?, ?, ?)',
    [userId, `NV${String(userId).padStart(3, '0')}`, 'Quản trị hệ thống'],
  );
  for (const role of ['Admin', 'Staff']) {
    await connection.execute('INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [
      userId,
      roleId(role),
    ]);
  }

  await connection.commit();
  console.log(`Xong. Đăng nhập bằng email ${email} (user_id=${userId}).`);
} catch (error) {
  await connection.rollback();
  console.error('Lỗi:', error.message);
  process.exitCode = 1;
} finally {
  await connection.end();
}
