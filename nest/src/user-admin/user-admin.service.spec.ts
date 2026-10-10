import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
} from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { MailService } from '../auth/mail.service.js';
import { DatabaseService } from '../database/database.service.js';
import {
    escapeLike,
    nextEmployeeCode,
    normalizePaging,
    UserAdminService,
} from './user-admin.service.js';

describe('tiện ích thuần', () => {
    it('normalizePaging giới hạn page/limit', () => {
        expect(normalizePaging()).toEqual({ page: 1, limit: 10, offset: 0 });
        expect(normalizePaging(3, 20)).toEqual({ page: 3, limit: 20, offset: 40 });
        expect(normalizePaging(-5, 999).limit).toBe(50);
        expect(normalizePaging(0, 0)).toMatchObject({ page: 1, limit: 10 });
    });

    it('escapeLike chặn ký tự đại diện', () => {
        expect(escapeLike('50%_a\\')).toBe('50\\%\\_a\\\\');
    });

    it('nextEmployeeCode sinh mã NV tiếp theo', () => {
        expect(nextEmployeeCode(0)).toBe('NV001');
        expect(nextEmployeeCode(3)).toBe('NV004');
        expect(nextEmployeeCode(120)).toBe('NV121');
    });
});

interface Options {
    actorIsAdmin?: boolean;
    target?: Record<string, unknown> | null;
    admins?: { user_id: number; is_active: number }[];
    isStaffMember?: boolean;
    duplicateEmail?: boolean;
}

function setup(options: Options = {}) {
    const {
        actorIsAdmin = true,
        target = { user_id: 5, is_active: 1, customer_id: 5, is_staff: 0, notes: null },
        admins = [
            { user_id: 1, is_active: 1 },
            { user_id: 2, is_active: 1 },
        ],
        isStaffMember = true,
        duplicateEmail = false,
    } = options;

    const execute = vi.fn(async (sql: string, _params?: unknown[]) => {
        if (sql.includes("r.role_name = 'Admin' AND u.is_active = 1")) {
            return [actorIsAdmin ? [{ ok: 1 }] : [], []];
        }
        if (sql.includes("WHERE r.role_name = 'Admin'") && sql.includes('FOR UPDATE')) {
            return [admins, []];
        }
        if (sql.includes('LEFT JOIN customers c') && sql.includes('FOR UPDATE')) {
            return [target ? [target] : [], []];
        }
        if (sql.includes('SELECT 1 AS ok FROM users u')) {
            return [isStaffMember ? [{ ok: 1 }] : [], []];
        }
        if (sql.includes('SELECT role_id, role_name FROM roles')) {
            return [[{ role_id: 1, role_name: 'Admin' }, { role_id: 2, role_name: 'Staff' }], []];
        }
        if (sql.includes('MAX(CAST(SUBSTRING')) return [[{ max_no: 3 }], []];
        if (sql.includes('FROM users WHERE email')) {
            return [duplicateEmail ? [{ email: 'a@b.com', phone_number: 'x' }] : [], []];
        }
        if (sql.startsWith('SELECT 1 FROM employees')) return [[], []];
        if (sql.includes('INSERT INTO users')) return [{ insertId: 9, affectedRows: 1 }, []];
        return [{ affectedRows: 1 }, []];
    });

    const staffRow = (id: number, admin: number) => ({
        user_id: id,
        employee_code: `NV00${id}`,
        full_name: `Nhân viên ${id}`,
        email: `nv${id}@x.com`,
        phone_number: '0900000000',
        position: 'Trực sân',
        is_active: 1,
        is_admin: admin,
    });

    const query = vi.fn(async (sql: string) => {
        if (sql.includes('COUNT(*) AS n')) return [{ n: admins.filter((a) => a.is_active).length }];
        if (sql.includes('IS_STAFF') || sql.includes('LEFT JOIN employees')) {
            return [staffRow(1, 1), staffRow(2, 0)];
        }
        if (sql.trim().startsWith('SELECT COUNT(*) AS total')) return [{ total: 126 }];
        if (sql.includes('FROM user_admin_history')) return [];
        return [];
    });

    const database = {
        query,
        transaction: vi.fn(async (callback: (connection: unknown) => unknown) => callback({ execute })),
    } as unknown as DatabaseService;

    const mail = { sendStaffInvite: vi.fn(async () => undefined) };
    const service = new UserAdminService(database, mail as unknown as MailService);

    // getCustomer / getStaff chỉ là đọc lại sau khi ghi: không phải mục tiêu của test này
    vi.spyOn(service, 'getCustomer').mockResolvedValue({ user_id: 5 } as never);
    vi.spyOn(service, 'getStaff').mockResolvedValue({
        user_id: 9, full_name: 'A', email: 'a@b.com', is_active: true, role_label: 'Nhân viên',
    } as never);

    const wrote = (prefix: string) =>
        execute.mock.calls.some(([sql]) => String(sql).startsWith(prefix));
    const historyAction = () =>
        (execute.mock.calls.find(([sql]) => String(sql).startsWith('INSERT INTO user_admin_history'))?.[1] as unknown[])?.[1];

    return { service, execute, mail, wrote, historyAction };
}

describe('UserAdminService - khách hàng', () => {
    it('listCustomers trả phân trang kiểu "Hiển thị 1-4 trong 126"', async () => {
        const { service } = setup();
        const result = await service.listCustomers({ limit: 4 });

        expect(result.pagination).toMatchObject({ page: 1, limit: 4, total: 126, from: 1, to: 0 });
        expect(result.pagination.total_pages).toBe(32);
    });

    it('khóa tài khoản bắt buộc có lý do', async () => {
        const { service } = setup();
        await expect(service.changeCustomerStatus(1, 5, false)).rejects.toBeInstanceOf(BadRequestException);
        await expect(service.changeCustomerStatus(1, 5, false, '  ')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('khóa thành công: cập nhật users và ghi lịch sử Lock', async () => {
        const { service, wrote, historyAction } = setup();
        await service.changeCustomerStatus(1, 5, false, 'Bom sân nhiều lần');

        expect(wrote('UPDATE users SET is_active')).toBe(true);
        expect(historyAction()).toBe('Lock');
    });

    it('mở khóa không cần lý do, ghi Unlock', async () => {
        const { service, historyAction } = setup({
            target: { user_id: 5, is_active: 0, customer_id: 5, is_staff: 0, notes: null },
        });
        await service.changeCustomerStatus(1, 5, true);
        expect(historyAction()).toBe('Unlock');
    });

    it('báo 409 khi trạng thái không đổi', async () => {
        const { service } = setup();
        await expect(service.changeCustomerStatus(1, 5, true)).rejects.toBeInstanceOf(ConflictException);
    });

    it('không cho khóa tài khoản nhân sự ở màn Khách hàng', async () => {
        const { service } = setup({
            target: { user_id: 5, is_active: 1, customer_id: 5, is_staff: 1, notes: null },
        });
        await expect(service.changeCustomerStatus(1, 5, false, 'x')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('báo 404 khi không có khách / không có hồ sơ khách hàng', async () => {
        await expect(setup({ target: null }).service.changeCustomerStatus(1, 5, false, 'x'))
            .rejects.toBeInstanceOf(NotFoundException);
        await expect(
            setup({ target: { user_id: 5, is_active: 1, customer_id: null, is_staff: 0, notes: null } })
                .service.changeCustomerStatus(1, 5, false, 'x'),
        ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('người thao tác đã mất quyền Admin (token cũ) bị chặn', async () => {
        const { service, wrote } = setup({ actorIsAdmin: false });
        await expect(service.changeCustomerStatus(1, 5, false, 'x')).rejects.toBeInstanceOf(ForbiddenException);
        expect(wrote('UPDATE users')).toBe(false);
    });

    it('lưu ghi chú: ghi lịch sử; nội dung không đổi thì bỏ qua', async () => {
        const changed = setup();
        await changed.service.updateCustomerNote(1, 5, 'Khách quen');
        expect(changed.wrote('UPDATE customers SET notes')).toBe(true);
        expect(changed.historyAction()).toBe('NoteUpdate');

        const same = setup({
            target: { user_id: 5, is_active: 1, customer_id: 5, is_staff: 0, notes: 'Khách quen' },
        });
        await same.service.updateCustomerNote(1, 5, ' Khách quen ');
        expect(same.wrote('UPDATE customers SET notes')).toBe(false);
    });
});

describe('UserAdminService - nhân viên & vai trò', () => {
    it('listStaff: Admin duy nhất đang hoạt động bị đánh dấu là Admin cuối cùng', async () => {
        const { service } = setup({ admins: [{ user_id: 1, is_active: 1 }] });
        const result = await service.listStaff();
        const admin = result.staff.find((s) => s.user_id === 1)!;

        expect(admin.role).toBe('Admin');
        expect(admin.is_last_admin).toBe(true);
        expect(admin.can_revoke_admin).toBe(false);
        expect(result.staff.find((s) => s.user_id === 2)).toMatchObject({
            role_label: 'Nhân viên',
            can_grant_admin: true,
        });
    });

    it('cấp Admin: thêm vai trò và ghi GrantAdmin', async () => {
        const { service, wrote, historyAction } = setup({
            target: { user_id: 5, is_active: 1, customer_id: null, is_staff: 1, notes: null },
        });
        await service.changeStaffRole(1, 5, 'Admin');

        expect(wrote('INSERT IGNORE INTO user_roles')).toBe(true);
        expect(historyAction()).toBe('GrantAdmin');
    });

    it('không cấp Admin cho người đã là Admin hoặc tài khoản bị khóa', async () => {
        const already = setup({ admins: [{ user_id: 5, is_active: 1 }, { user_id: 1, is_active: 1 }] });
        await expect(already.service.changeStaffRole(1, 5, 'Admin')).rejects.toBeInstanceOf(ConflictException);

        const locked = setup({
            target: { user_id: 5, is_active: 0, customer_id: null, is_staff: 1, notes: null },
        });
        await expect(locked.service.changeStaffRole(1, 5, 'Admin')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('thu hồi Admin: xóa vai trò Admin, giữ Staff, ghi RevokeAdmin', async () => {
        const { service, wrote, historyAction } = setup({
            target: { user_id: 2, is_active: 1, customer_id: null, is_staff: 1, notes: null },
        });
        await service.changeStaffRole(1, 2, 'Staff');

        expect(wrote('DELETE FROM user_roles')).toBe(true);
        expect(wrote('INSERT IGNORE INTO user_roles')).toBe(true);
        expect(historyAction()).toBe('RevokeAdmin');
    });

    it('KHÔNG cho thu hồi Admin cuối cùng', async () => {
        const { service, wrote } = setup({
            admins: [{ user_id: 1, is_active: 1 }],
            target: { user_id: 1, is_active: 1, customer_id: null, is_staff: 1, notes: null },
        });
        await expect(service.changeStaffRole(1, 1, 'Staff')).rejects.toBeInstanceOf(ConflictException);
        expect(wrote('DELETE FROM user_roles')).toBe(false);
    });

    it('Admin đang bị khóa không được tính vào số Admin hoạt động', async () => {
        const { service } = setup({
            admins: [{ user_id: 1, is_active: 1 }, { user_id: 2, is_active: 0 }],
            target: { user_id: 1, is_active: 1, customer_id: null, is_staff: 1, notes: null },
        });
        await expect(service.changeStaffRole(1, 1, 'Staff')).rejects.toBeInstanceOf(ConflictException);
    });

    it('báo 404 khi người được đổi vai trò không phải nhân sự', async () => {
        const { service } = setup({ isStaffMember: false });
        await expect(service.changeStaffRole(1, 5, 'Admin')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('tạo nhân viên: tự sinh mã NV004, gán Staff, ghi lịch sử, gửi email', async () => {
        const { service, execute, mail, historyAction } = setup();
        const result = await service.createStaff(1, {
            full_name: 'Nguyễn Văn A',
            email: 'A@B.com',
            role: 'Staff',
        });

        const employeeInsert = execute.mock.calls.find(([sql]) => String(sql).startsWith('INSERT INTO employees'));
        expect((employeeInsert![1] as unknown[])[1]).toBe('NV004');

        const roleInserts = execute.mock.calls.filter(([sql]) => String(sql).startsWith('INSERT INTO user_roles'));
        expect(roleInserts).toHaveLength(1); // chỉ Staff

        const userInsert = execute.mock.calls.find(([sql]) => String(sql).startsWith('INSERT INTO users'));
        expect((userInsert![1] as unknown[])[1]).toBe('NV004'); // SĐT tạm = mã nhân viên
        expect((userInsert![1] as unknown[])[2]).toBe('a@b.com'); // email chuẩn hóa chữ thường

        expect(historyAction()).toBe('CreateStaff');
        expect(mail.sendStaffInvite).toHaveBeenCalledWith('a@b.com', 'Nguyễn Văn A', 'Nhân viên');
        expect(result.email_sent).toBe(true);
    });

    it('tạo Admin: gán thêm vai trò Admin', async () => {
        const { service, execute } = setup();
        await service.createStaff(1, { full_name: 'B', email: 'b@b.com', role: 'Admin' });
        const roleInserts = execute.mock.calls.filter(([sql]) => String(sql).startsWith('INSERT INTO user_roles'));
        expect(roleInserts).toHaveLength(2);
    });

    it('tạo nhân viên trùng email báo 409', async () => {
        const { service } = setup({ duplicateEmail: true });
        await expect(service.createStaff(1, { full_name: 'A', email: 'a@b.com', role: 'Staff' }))
            .rejects.toBeInstanceOf(ConflictException);
    });

    it('gửi email lỗi vẫn tạo được tài khoản, trả email_sent = false', async () => {
        const { service, mail } = setup();
        mail.sendStaffInvite.mockRejectedValueOnce(new Error('SMTP down'));
        const result = await service.createStaff(1, { full_name: 'A', email: 'a@b.com', role: 'Staff' });
        expect(result.email_sent).toBe(false);
    });
});
