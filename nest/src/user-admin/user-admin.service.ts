import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'node:crypto';
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';

import { MailService } from '../auth/mail.service.js';
import { DatabaseService } from '../database/database.service.js';
import { buildTransferContent } from '../payments/payments.utils.js';
import {
    ACTIVE_BOOKING_STATUSES,
    isDuplicateEntry,
} from '../pitch-admin/pitch-admin.utils.js';
import {
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    type CreateStaffDto,
    type ListCustomersQueryDto,
    type StaffRole,
} from './dto/user-admin.dto.js';

const RECENT_BOOKINGS_LIMIT = 5;
const HISTORY_LIMIT = 10;

export const ROLE_LABELS: Record<StaffRole, string> = {
    Admin: 'Admin',
    Staff: 'Nhân viên',
};

// Khách hàng = có hồ sơ customers và KHÔNG mang vai trò Admin/Staff.
// Tài khoản nhân sự không được khóa/sửa ở màn Khách hàng.
const NOT_STAFF = `NOT EXISTS (
    SELECT 1 FROM user_roles ur_s
    JOIN roles r_s ON r_s.role_id = ur_s.role_id
    WHERE ur_s.user_id = u.user_id AND r_s.role_name IN ('Admin', 'Staff')
)`;

const IS_ADMIN = `EXISTS (
    SELECT 1 FROM user_roles ur_a
    JOIN roles r_a ON r_a.role_id = ur_a.role_id
    WHERE ur_a.user_id = u.user_id AND r_a.role_name = 'Admin'
)`;

const IS_STAFF_MEMBER = `EXISTS (
    SELECT 1 FROM user_roles ur_m
    JOIN roles r_m ON r_m.role_id = ur_m.role_id
    WHERE ur_m.user_id = u.user_id AND r_m.role_name IN ('Admin', 'Staff')
)`;

interface CustomerRow extends RowDataPacket {
    user_id: number;
    full_name: string;
    email: string | null;
    phone_number: string;
    is_active: number;
    created_at?: Date | string;
    notes?: string | null;
    total_bookings: string | number | null;
    cancelled_count: string | number | null;
    no_show_count: string | number | null;
    upcoming_count?: string | number | null;
}

interface RecentBookingRow extends RowDataPacket {
    booking_id: number;
    booking_date: string;
    start_time: string;
    end_time: string;
    status: string;
    pitch_name: string;
    services_count: string | number;
    refund_successful: string | number;
    refund_pending: string | number;
    refunded_at: Date | string | null;
}

interface AccountHistoryRow extends RowDataPacket {
    history_id: number;
    action: string;
    reason: string | null;
    performed_by: number | null;
    performed_by_name: string | null;
    created_at: Date | string;
}

interface StaffRow extends RowDataPacket {
    user_id: number;
    employee_code: string | null;
    full_name: string;
    email: string | null;
    phone_number: string;
    position: string | null;
    is_active: number;
    is_admin: number;
}

interface LockedUserRow extends RowDataPacket {
    user_id: number;
    is_active: number;
    customer_id: number | null;
    is_staff: number;
    notes: string | null;
}

export type AdminHistoryAction =
    | 'Lock'
    | 'Unlock'
    | 'NoteUpdate'
    | 'GrantAdmin'
    | 'RevokeAdmin'
    | 'CreateStaff';

/** Chuẩn hóa page/limit; limit mặc định 10, tối đa 50. */
export function normalizePaging(page?: number, limit?: number) {
    const safeLimit = Math.min(
        Math.max(Math.trunc(Number(limit) || DEFAULT_PAGE_SIZE), 1),
        MAX_PAGE_SIZE,
    );
    const safePage = Math.max(Math.trunc(Number(page) || 1), 1);

    return { page: safePage, limit: safeLimit, offset: (safePage - 1) * safeLimit };
}

/** Escape ký tự đặc biệt của LIKE để "50%" không bị coi là ký tự đại diện. */
export const escapeLike = (value: string): string => value.replace(/[\\%_]/g, '\\$&');

/** "NV003" → "NV004". Mã không đúng dạng NV + số thì bị bỏ qua khi tìm số lớn nhất. */
export function nextEmployeeCode(currentMax: number): string {
    return `NV${String(Math.max(0, Math.trunc(currentMax)) + 1).padStart(3, '0')}`;
}

@Injectable()
export class UserAdminService {
    private readonly logger = new Logger(UserAdminService.name);

    constructor(
        private readonly database: DatabaseService,
        private readonly mail: MailService,
    ) { }

    // =================================================================
    // KHÁCH HÀNG
    // =================================================================

    // Bảng "Khách hàng": tìm theo tên/SĐT/email + lọc trạng thái + phân trang
    async listCustomers(query: ListCustomersQueryDto) {
        const clauses: string[] = [NOT_STAFF];
        const params: (string | number)[] = [];

        if (query.status) {
            clauses.push('u.is_active = ?');
            params.push(query.status === 'active' ? 1 : 0);
        }

        if (query.q) {
            const like = `%${escapeLike(query.q)}%`;
            clauses.push('(u.full_name LIKE ? OR u.phone_number LIKE ? OR u.email LIKE ?)');
            params.push(like, like, like);
        }

        const where = `WHERE ${clauses.join(' AND ')}`;
        const { page, limit, offset } = normalizePaging(query.page, query.limit);

        const [countRows, rows] = await Promise.all([
            this.database.query<RowDataPacket[]>(
                `SELECT COUNT(*) AS total
                 FROM users u
                 JOIN customers c ON c.user_id = u.user_id
                 ${where}`,
                params,
            ),
            this.database.query<CustomerRow[]>(
                `SELECT u.user_id, u.full_name, u.email, u.phone_number, u.is_active,
                        COALESCE(b.total, 0) AS total_bookings,
                        COALESCE(b.cancelled, 0) AS cancelled_count,
                        COALESCE(b.no_show, 0) AS no_show_count
                 FROM users u
                 JOIN customers c ON c.user_id = u.user_id
                 LEFT JOIN (
                    SELECT customer_id,
                           COUNT(*) AS total,
                           SUM(status = 'Cancelled') AS cancelled,
                           SUM(status = 'NoShow') AS no_show
                    FROM bookings
                    GROUP BY customer_id
                 ) b ON b.customer_id = u.user_id
                 ${where}
                 ORDER BY u.created_at DESC, u.user_id DESC
                 LIMIT ${limit} OFFSET ${offset}`,
                params,
            ),
        ]);

        const total = Number(countRows[0]?.total ?? 0);

        return {
            customers: rows.map((row) => this.toCustomerItem(row)),
            pagination: {
                page,
                limit,
                total,
                total_pages: Math.max(Math.ceil(total / limit), 1),
                from: total === 0 ? 0 : offset + 1,
                to: Math.min(offset + rows.length, total),
            },
        };
    }

    // Khối "Chi tiết khách" + "Ghi chú & trạng thái tài khoản"
    async getCustomer(id: number) {
        const rows = await this.database.query<CustomerRow[]>(
            `SELECT u.user_id, u.full_name, u.email, u.phone_number, u.is_active,
                    u.created_at, c.notes,
                    (SELECT COUNT(*) FROM bookings b WHERE b.customer_id = u.user_id) AS total_bookings,
                    (SELECT COUNT(*) FROM bookings b
                      WHERE b.customer_id = u.user_id AND b.status = 'Cancelled') AS cancelled_count,
                    (SELECT COUNT(*) FROM bookings b
                      WHERE b.customer_id = u.user_id AND b.status = 'NoShow') AS no_show_count,
                    (SELECT COUNT(*) FROM bookings b
                      WHERE b.customer_id = u.user_id
                        AND b.status IN (${ACTIVE_BOOKING_STATUSES})) AS upcoming_count
             FROM users u
             JOIN customers c ON c.user_id = u.user_id
             WHERE u.user_id = ? AND ${NOT_STAFF}
             LIMIT 1`,
            [id],
        );

        const row = rows[0];

        if (!row) {
            throw new NotFoundException('Không tìm thấy khách hàng.');
        }

        const [bookings, history] = await Promise.all([
            this.database.query<RecentBookingRow[]>(
                `SELECT b.booking_id,
                        DATE_FORMAT(b.booking_date, '%Y-%m-%d') AS booking_date,
                        TIME_FORMAT(b.start_time, '%H:%i') AS start_time,
                        TIME_FORMAT(b.end_time, '%H:%i') AS end_time,
                        b.status, p.pitch_name,
                        (SELECT COUNT(*) FROM booking_services bs
                          WHERE bs.booking_id = b.booking_id) AS services_count,
                        (SELECT COALESCE(SUM(r.amount), 0)
                           FROM payment_refunds r
                           JOIN payments pay ON pay.payment_id = r.payment_id
                           JOIN invoices i ON i.invoice_id = pay.invoice_id
                          WHERE i.booking_id = b.booking_id AND r.status = 'Successful') AS refund_successful,
                        (SELECT COALESCE(SUM(r.amount), 0)
                           FROM payment_refunds r
                           JOIN payments pay ON pay.payment_id = r.payment_id
                           JOIN invoices i ON i.invoice_id = pay.invoice_id
                          WHERE i.booking_id = b.booking_id AND r.status = 'Pending') AS refund_pending,
                        (SELECT MAX(r.processed_at)
                           FROM payment_refunds r
                           JOIN payments pay ON pay.payment_id = r.payment_id
                           JOIN invoices i ON i.invoice_id = pay.invoice_id
                          WHERE i.booking_id = b.booking_id AND r.status = 'Successful') AS refunded_at
                 FROM bookings b
                 JOIN pitches p ON p.pitch_id = b.pitch_id
                 WHERE b.customer_id = ?
                 ORDER BY b.booking_date DESC, b.start_time DESC, b.booking_id DESC
                 LIMIT ${RECENT_BOOKINGS_LIMIT}`,
                [id],
            ),
            this.accountHistory(id),
        ]);

        return {
            ...this.toCustomerItem(row),
            created_at: row.created_at,
            note: row.notes ?? '',
            upcoming_bookings: Number(row.upcoming_count ?? 0),
            recent_bookings: bookings.map((booking) => ({
                booking_id: Number(booking.booking_id),
                booking_code: buildTransferContent(Number(booking.booking_id)),
                booking_date: booking.booking_date,
                start_time: booking.start_time,
                end_time: booking.end_time,
                pitch_name: booking.pitch_name,
                status: booking.status,
                services_count: Number(booking.services_count),
                refund_amount: Number(booking.refund_successful),
                refund_pending_amount: Number(booking.refund_pending),
                refunded_at: booking.refunded_at,
            })),
            account_history: history,
        };
    }

    // "Lưu ghi chú" - ghi chú nội bộ, khách không nhìn thấy
    async updateCustomerNote(actorId: number, id: number, note: string) {
        await this.database.transaction(async (connection) => {
            await this.assertActorIsAdmin(connection, actorId);
            const target = await this.lockUser(connection, id);
            this.assertCustomer(target);

            const next = note.trim() === '' ? null : note.trim();

            if ((target.notes ?? null) === next) {
                return;
            }

            await connection.execute('UPDATE customers SET notes = ? WHERE user_id = ?', [next, id]);
            await this.writeHistory(connection, id, 'NoteUpdate', null, actorId);
        });

        return this.getCustomer(id);
    }

    // "Khóa tài khoản" / "Mở khóa". Không xóa booking hay giao dịch của khách.
    async changeCustomerStatus(
        actorId: number,
        id: number,
        isActive: boolean,
        reason?: string,
    ) {
        const cleanReason = reason?.trim() || null;

        if (!isActive && !cleanReason) {
            throw new BadRequestException('Vui lòng nhập lý do khóa tài khoản.');
        }

        await this.database.transaction(async (connection) => {
            await this.assertActorIsAdmin(connection, actorId);
            const target = await this.lockUser(connection, id);
            this.assertCustomer(target);

            if (Boolean(target.is_active) === isActive) {
                throw new ConflictException(
                    isActive ? 'Tài khoản đang hoạt động.' : 'Tài khoản đã bị khóa trước đó.',
                );
            }

            await connection.execute('UPDATE users SET is_active = ? WHERE user_id = ?', [
                isActive ? 1 : 0,
                id,
            ]);
            await this.writeHistory(connection, id, isActive ? 'Unlock' : 'Lock', cleanReason, actorId);
        });

        return this.getCustomer(id);
    }

    // =================================================================
    // NHÂN VIÊN & VAI TRÒ
    // =================================================================

    async listStaff() {
        const rows = await this.staffRows();
        const activeAdmins = rows.filter((row) => row.is_admin && row.is_active).length;

        return {
            summary: {
                total: rows.length,
                admin_count: rows.filter((row) => row.is_admin).length,
                active_admin_count: activeAdmins,
            },
            staff: rows.map((row) => this.toStaffItem(row, activeAdmins)),
        };
    }

    async createStaff(actorId: number, dto: CreateStaffDto) {
        const email = dto.email.toLowerCase();

        // Mật khẩu ngẫu nhiên không ai biết: nhân viên tự đặt qua "Quên mật khẩu"
        const passwordHash = await bcrypt.hash(randomBytes(24).toString('hex'), 10);

        const userId = await this.database.transaction(async (connection) => {
            await this.assertActorIsAdmin(connection, actorId);

            const employeeCode = dto.employee_code ?? (await this.generateEmployeeCode(connection));
            const phone = dto.phone_number ?? employeeCode;

            await this.assertStaffIdentityFree(connection, email, phone, employeeCode);

            const [roleRows] = await connection.execute<RowDataPacket[]>(
                `SELECT role_id, role_name FROM roles WHERE role_name IN ('Admin', 'Staff')`,
            );
            const roleId = (name: string) =>
                roleRows.find((row) => row.role_name === name)?.role_id as number | undefined;

            const staffRoleId = roleId('Staff');
            const adminRoleId = roleId('Admin');

            if (!staffRoleId) {
                throw new BadRequestException('Hệ thống chưa có vai trò Staff.');
            }

            try {
                const [user] = await connection.execute<ResultSetHeader>(
                    `INSERT INTO users (full_name, phone_number, email, password_hash)
                     VALUES (?, ?, ?, ?)`,
                    [dto.full_name, phone, email, passwordHash],
                );

                await connection.execute(
                    `INSERT INTO employees (user_id, employee_code, position, hire_date)
                     VALUES (?, ?, ?, CURDATE())`,
                    [user.insertId, employeeCode, dto.position ?? null],
                );

                // Nhân sự luôn giữ vai trò Staff; Admin là quyền cấp thêm
                await connection.execute(
                    'INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)',
                    [user.insertId, staffRoleId],
                );

                if (dto.role === 'Admin') {
                    if (!adminRoleId) {
                        throw new BadRequestException('Hệ thống chưa có vai trò Admin.');
                    }

                    await connection.execute(
                        'INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)',
                        [user.insertId, adminRoleId],
                    );
                }

                await this.writeHistory(
                    connection,
                    user.insertId,
                    'CreateStaff',
                    `Vai trò: ${ROLE_LABELS[dto.role]}`,
                    actorId,
                );

                return user.insertId;
            } catch (error) {
                if (isDuplicateEntry(error)) {
                    throw new ConflictException('Email, số điện thoại hoặc mã nhân viên đã tồn tại.');
                }

                throw error;
            }
        });

        // Gửi mail sau khi commit: lỗi SMTP không làm mất tài khoản vừa tạo
        const emailSent = await this.sendInvite(email, dto.full_name, ROLE_LABELS[dto.role]);

        return { ...(await this.getStaff(userId)), email_sent: emailSent };
    }

    // "Cấp Admin" (role = Admin) / "Thu hồi" (role = Staff)
    async changeStaffRole(actorId: number, id: number, role: StaffRole) {
        await this.database.transaction(async (connection) => {
            await this.assertActorIsAdmin(connection, actorId);

            // Khóa toàn bộ dòng vai trò Admin: hai lần thu hồi đồng thời không
            // thể cùng xóa nốt hai Admin cuối cùng.
            const [admins] = await connection.execute<RowDataPacket[]>(
                `SELECT ur.user_id, u.is_active
                 FROM user_roles ur
                 JOIN roles r ON r.role_id = ur.role_id
                 JOIN users u ON u.user_id = ur.user_id
                 WHERE r.role_name = 'Admin'
                 FOR UPDATE`,
            );

            const target = await this.lockUser(connection, id);

            if (!target || !(await this.isStaffMember(connection, id))) {
                throw new NotFoundException('Không tìm thấy nhân viên.');
            }

            const targetIsAdmin = admins.some((row) => Number(row.user_id) === id);
            const activeAdmins = admins.filter((row) => row.is_active).length;

            const [roleRows] = await connection.execute<RowDataPacket[]>(
                `SELECT role_id, role_name FROM roles WHERE role_name IN ('Admin', 'Staff')`,
            );
            const adminRoleId = roleRows.find((row) => row.role_name === 'Admin')?.role_id;
            const staffRoleId = roleRows.find((row) => row.role_name === 'Staff')?.role_id;

            if (!adminRoleId || !staffRoleId) {
                throw new BadRequestException('Hệ thống chưa có đủ vai trò Admin/Staff.');
            }

            if (role === 'Admin') {
                if (targetIsAdmin) {
                    throw new ConflictException('Nhân viên này đã là Admin.');
                }

                if (!target.is_active) {
                    throw new BadRequestException('Không thể cấp Admin cho tài khoản đang bị khóa.');
                }

                await connection.execute(
                    'INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)',
                    [id, adminRoleId],
                );
                await this.writeHistory(connection, id, 'GrantAdmin', null, actorId);
                return;
            }

            if (!targetIsAdmin) {
                throw new ConflictException('Nhân viên này không có quyền Admin để thu hồi.');
            }

            if (target.is_active && activeAdmins <= 1) {
                throw new ConflictException(
                    'Không thể thu hồi quyền của Admin cuối cùng. Hãy cấp Admin cho người khác trước.',
                );
            }

            await connection.execute(
                'DELETE FROM user_roles WHERE user_id = ? AND role_id = ?',
                [id, adminRoleId],
            );
            // Giữ lại vai trò Staff để nhân viên vẫn đăng nhập được màn vận hành
            await connection.execute(
                'INSERT IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)',
                [id, staffRoleId],
            );
            await this.writeHistory(connection, id, 'RevokeAdmin', null, actorId);
        });

        return this.getStaff(id);
    }

    // Gửi lại email hướng dẫn đặt mật khẩu
    async resendInvite(id: number) {
        const staff = await this.getStaff(id);

        if (!staff.email) {
            throw new BadRequestException('Nhân viên chưa có email đăng nhập.');
        }

        if (!staff.is_active) {
            throw new BadRequestException('Tài khoản đang bị khóa.');
        }

        const emailSent = await this.sendInvite(staff.email, staff.full_name, staff.role_label);

        return { email_sent: emailSent };
    }

    async getStaff(id: number) {
        const rows = await this.staffRows(id);
        const row = rows[0];

        if (!row) {
            throw new NotFoundException('Không tìm thấy nhân viên.');
        }

        const [{ n }] = await this.database.query<{ n: string | number }[]>(
            `SELECT COUNT(*) AS n
             FROM users u
             WHERE u.is_active = 1 AND ${IS_ADMIN}`,
        );

        return this.toStaffItem(row, Number(n));
    }

    // ------------------------------------------------------------------

    private async staffRows(id?: number): Promise<StaffRow[]> {
        return this.database.query<StaffRow[]>(
            `SELECT u.user_id, e.employee_code, u.full_name, u.email, u.phone_number,
                    e.position, u.is_active,
                    ${IS_ADMIN} AS is_admin
             FROM users u
             LEFT JOIN employees e ON e.user_id = u.user_id
             WHERE ${IS_STAFF_MEMBER}
             ${id === undefined ? '' : 'AND u.user_id = ?'}
             ORDER BY (e.employee_code IS NULL), e.employee_code ASC, u.user_id ASC`,
            id === undefined ? [] : [id],
        );
    }

    private toStaffItem(row: StaffRow, activeAdminCount: number) {
        const isAdmin = Boolean(row.is_admin);
        const isActive = Boolean(row.is_active);
        const role: StaffRole = isAdmin ? 'Admin' : 'Staff';
        const isLastAdmin = isAdmin && isActive && activeAdminCount <= 1;

        return {
            user_id: Number(row.user_id),
            employee_code: row.employee_code,
            full_name: row.full_name,
            email: row.email,
            phone_number: row.phone_number,
            position: row.position,
            is_active: isActive,
            role,
            role_label: ROLE_LABELS[role],
            is_last_admin: isLastAdmin,
            can_grant_admin: !isAdmin && isActive,
            can_revoke_admin: isAdmin && !isLastAdmin,
        };
    }

    private toCustomerItem(row: CustomerRow) {
        return {
            user_id: Number(row.user_id),
            full_name: row.full_name,
            email: row.email,
            phone_number: row.phone_number,
            is_active: Boolean(row.is_active),
            status: row.is_active ? 'active' : 'locked',
            total_bookings: Number(row.total_bookings ?? 0),
            cancelled_count: Number(row.cancelled_count ?? 0),
            no_show_count: Number(row.no_show_count ?? 0),
        };
    }

    private async accountHistory(userId: number) {
        const rows = await this.database.query<AccountHistoryRow[]>(
            `SELECT h.history_id, h.action, h.reason, h.performed_by,
                    actor.full_name AS performed_by_name, h.created_at
             FROM user_admin_history h
             LEFT JOIN users actor ON actor.user_id = h.performed_by
             WHERE h.user_id = ?
             ORDER BY h.created_at DESC, h.history_id DESC
             LIMIT ${HISTORY_LIMIT}`,
            [userId],
        );

        return rows.map((row) => ({
            history_id: Number(row.history_id),
            action: row.action,
            reason: row.reason,
            performed_by: row.performed_by,
            performed_by_name: row.performed_by_name,
            created_at: row.created_at,
        }));
    }

    // Quyền nằm trong JWT nên có thể cũ tới 1 giờ: thao tác ghi luôn kiểm tra lại DB
    private async assertActorIsAdmin(connection: PoolConnection, actorId: number): Promise<void> {
        const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT 1
             FROM user_roles ur
             JOIN roles r ON r.role_id = ur.role_id
             JOIN users u ON u.user_id = ur.user_id
             WHERE ur.user_id = ? AND r.role_name = 'Admin' AND u.is_active = 1
             LIMIT 1`,
            [actorId],
        );

        if (!rows[0]) {
            throw new ForbiddenException('Bạn không còn quyền Admin để thực hiện thao tác này.');
        }
    }

    private async lockUser(connection: PoolConnection, id: number): Promise<LockedUserRow> {
        const [rows] = await connection.execute<LockedUserRow[]>(
            `SELECT u.user_id, u.is_active, c.user_id AS customer_id, c.notes,
                    ${IS_STAFF_MEMBER} AS is_staff
             FROM users u
             LEFT JOIN customers c ON c.user_id = u.user_id
             WHERE u.user_id = ?
             FOR UPDATE`,
            [id],
        );

        if (!rows[0]) {
            throw new NotFoundException('Không tìm thấy tài khoản.');
        }

        return rows[0];
    }

    private assertCustomer(target: LockedUserRow): void {
        if (target.customer_id === null) {
            throw new NotFoundException('Không tìm thấy khách hàng.');
        }

        if (target.is_staff) {
            throw new ForbiddenException(
                'Đây là tài khoản nhân sự, không thể thao tác ở màn Khách hàng.',
            );
        }
    }

    private async isStaffMember(connection: PoolConnection, id: number): Promise<boolean> {
        const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT 1 AS ok FROM users u WHERE u.user_id = ? AND ${IS_STAFF_MEMBER}`,
            [id],
        );

        return rows.length > 0;
    }

    private async generateEmployeeCode(connection: PoolConnection): Promise<string> {
        const [rows] = await connection.execute<RowDataPacket[]>(
            `SELECT COALESCE(MAX(CAST(SUBSTRING(employee_code, 3) AS UNSIGNED)), 0) AS max_no
             FROM employees
             WHERE employee_code REGEXP '^NV[0-9]+$'`,
        );

        return nextEmployeeCode(Number(rows[0]?.max_no ?? 0));
    }

    // Báo lỗi rõ từng trường thay vì một câu "trùng dữ liệu" chung chung
    private async assertStaffIdentityFree(
        connection: PoolConnection,
        email: string,
        phone: string,
        employeeCode: string,
    ): Promise<void> {
        const [users] = await connection.execute<RowDataPacket[]>(
            'SELECT email, phone_number FROM users WHERE email = ? OR phone_number = ?',
            [email, phone],
        );

        if (users.some((row) => String(row.email).toLowerCase() === email)) {
            throw new ConflictException('Email đã được sử dụng.');
        }

        if (users.some((row) => row.phone_number === phone)) {
            throw new ConflictException('Số điện thoại đã được sử dụng.');
        }

        const [codes] = await connection.execute<RowDataPacket[]>(
            'SELECT 1 FROM employees WHERE employee_code = ? LIMIT 1',
            [employeeCode],
        );

        if (codes[0]) {
            throw new ConflictException('Mã nhân viên đã tồn tại.');
        }
    }

    private async writeHistory(
        connection: PoolConnection,
        userId: number,
        action: AdminHistoryAction,
        reason: string | null,
        actorId: number,
    ): Promise<void> {
        await connection.execute(
            `INSERT INTO user_admin_history (user_id, action, reason, performed_by)
             VALUES (?, ?, ?, ?)`,
            [userId, action, reason, actorId],
        );
    }

    private async sendInvite(email: string, fullName: string, roleLabel: string): Promise<boolean> {
        try {
            await this.mail.sendStaffInvite(email, fullName, roleLabel);
            return true;
        } catch (error) {
            this.logger.error(`Gửi email mời nhân viên thất bại: ${(error as Error).message}`);
            return false;
        }
    }
}
