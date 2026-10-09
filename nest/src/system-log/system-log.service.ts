import { BadRequestException, Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service.js';
import { buildTransferContent } from '../payments/payments.utils.js';
import type { ChangeType, SystemLogQueryDto } from './dto/system-log-query.dto.js';


// ------------------------------------------------------------------
// Nhãn tiếng Việt cho UI
// ------------------------------------------------------------------

const BOOKING_STATUS_LABEL: Record<string, string> = {
    Pending: 'Chờ cọc',
    Confirmed: 'Đã xác nhận',
    CheckedIn: 'Đã check-in',
    Playing: 'Đang đá',
    Completed: 'Hoàn thành',
    Cancelled: 'Đã hủy',
    NoShow: 'Vắng mặt',
};

const PITCH_STATUS_LABEL: Record<string, string> = {
    Available: 'Hoạt động',
    Maintenance: 'Bảo trì',
    Inactive: 'Ngưng hoạt động',
};

const DAY_TYPE_LABEL: Record<string, string> = {
    All: 'Mọi ngày',
    Weekday: 'Ngày thường',
    Weekend: 'Cuối tuần',
    Holiday: 'Ngày lễ',
};

function formatVnd(amount: number | string | null | undefined): string {
    if (amount === null || amount === undefined) return '—';
    const n = Number(amount);
    if (!Number.isFinite(n)) return '—';
    return `${n.toLocaleString('vi-VN')} ₫`;
}

function labelBookingStatus(status: string | null | undefined): string {
    if (!status) return '—';
    return BOOKING_STATUS_LABEL[status] ?? status;
}

function labelPitchStatus(status: string | null | undefined): string {
    if (!status) return '—';
    return PITCH_STATUS_LABEL[status] ?? status;
}

function toHHmm(value: string | null | undefined): string {
    if (!value) return '';
    return String(value).slice(0, 5);
}

// ------------------------------------------------------------------
// Kiểu hàng thô từ UNION
// ------------------------------------------------------------------

interface RawLogRow {
    source: ChangeType;
    history_id: number;
    changed_at: Date | string;
    changed_by: number | null;
    // booking
    booking_id: number | null;
    old_status: string | null;
    new_status: string | null;
    reason: string | null;
    // pitch
    pitch_id: number | null;
    pitch_name: string | null;
    old_pitch_name: string | null;
    new_pitch_name: string | null;
    old_pitch_status: string | null;
    new_pitch_status: string | null;
    old_notes: string | null;
    new_notes: string | null;
    old_category_name: string | null;
    new_category_name: string | null;
    // price
    price_slot_id: number | null;
    old_price: number | string | null;
    new_price: number | string | null;
    slot_start: string | null;
    slot_end: string | null;
    day_type: string | null;
    category_name: string | null;
    // actor
    actor_name: string | null;
    employee_code: string | null;
    position: string | null;
    is_admin: number | null;
}

export interface SystemLogActor {
    user_id: number | null;
    display_name: string;
}

export interface SystemLogItem {
    id: string;
    changed_at: string;
    actor: SystemLogActor;
    change_type: ChangeType;
    /** Dòng chính: mã đơn / tên sân / khung giá */
    target: string;
    /** Mô tả thao tác phụ (vd. "Tạo booking", "Bảo trì sân", "Sửa giá 19–22h") */
    action: string;
    old_value: string;
    new_value: string;
}

export interface SystemLogListResult {
    items: SystemLogItem[];
    total: number;
    page: number;
    limit: number;
    total_pages: number;
}

export interface SystemLogActorOption {
    user_id: number;
    display_name: string;
}

@Injectable()
export class SystemLogService {
    constructor(private readonly database: DatabaseService) {}

    // ---------------------------------------------------------------
    // Danh sách nhật ký (hợp nhất 3 bảng history)
    // ---------------------------------------------------------------

    async list(query: SystemLogQueryDto): Promise<SystemLogListResult> {
        const page = Math.max(1, Math.floor(query.page ?? 1));
        const limit = Math.min(100, Math.max(1, Math.floor(query.limit ?? 20)));
        const offset = (page - 1) * limit;


        if (query.from && query.to && query.from > query.to) {
            throw new BadRequestException(
                'from không được lớn hơn to',
            );
        }

        const { sql, params } = this.buildUnionSql(query);

        const countRows = await this.database.query<{ total: number }[]>(
            `SELECT COUNT(*) AS total FROM (${sql}) AS unified`,
            params,
        );
        const total = Number(countRows[0]?.total ?? 0);

        // mysql2 không bind được LIMIT/OFFSET qua placeholder → nội suy số đã validate.
        const rows = await this.database.query<RawLogRow[]>(
            `
            SELECT * FROM (${sql}) AS unified
            ORDER BY changed_at DESC, history_id DESC
            LIMIT ${limit} OFFSET ${offset}
            `,
            params,
        );


        const items = rows.map((row) => this.mapRow(row));

        return {
            items,
            total,
            page,
            limit,
            total_pages: total === 0 ? 0 : Math.ceil(total / limit),
        };
    }

    // ---------------------------------------------------------------
    // Danh sách người đã từng thao tác (cho filter dropdown)
    // ---------------------------------------------------------------

    async listActors(): Promise<SystemLogActorOption[]> {
        const rows = await this.database.query<
            {
                user_id: number;
                full_name: string;
                employee_code: string | null;
                position: string | null;
                is_admin: number;
            }[]
        >(
            `
            SELECT DISTINCT
                u.user_id,
                u.full_name,
                e.employee_code,
                e.position,
                EXISTS (
                    SELECT 1 FROM user_roles ur
                    JOIN roles r ON r.role_id = ur.role_id
                    WHERE ur.user_id = u.user_id AND r.role_name = 'Admin'
                ) AS is_admin
            FROM (
                SELECT changed_by AS uid FROM booking_status_history WHERE changed_by IS NOT NULL
                UNION
                SELECT changed_by FROM pitch_history WHERE changed_by IS NOT NULL
                UNION
                SELECT changed_by FROM price_slot_history WHERE changed_by IS NOT NULL
            ) AS actors
            JOIN users u ON u.user_id = actors.uid
            LEFT JOIN employees e ON e.user_id = u.user_id
            ORDER BY u.full_name ASC
            `,
        );

        return rows.map((row) => ({
            user_id: row.user_id,
            display_name: this.buildActorName(
                row.full_name,
                row.employee_code,
                row.position,
                Boolean(row.is_admin),
            ),
        }));
    }

    // ------------------------------------------------------------------
    // SQL UNION
    // ------------------------------------------------------------------

    private buildUnionSql(query: SystemLogQueryDto): {
        sql: string;
        params: unknown[];
    } {
        const changeType = query.change_type;
        const parts: string[] = [];
        const params: unknown[] = [];

        const actorFilter = query.actor_id
            ? 'AND h.changed_by = ?'
            : '';
        // changed_at lưu theo session timezone (thường UTC hoặc server).
        // So sánh theo khoảng ngày VN: [from 00:00, to+1 00:00).
        // Dùng CONVERT_TZ nếu cột là TIMESTAMP; an toàn hơn so sánh DATE(CONVERT_TZ(...)).
        const dateFilterSql = this.buildDateFilterSql(query);

        if (!changeType || changeType === 'booking') {
            parts.push(`
                SELECT
                    'booking' AS source,
                    h.history_id,
                    h.changed_at,
                    h.changed_by,
                    h.booking_id,
                    h.old_status,
                    h.new_status,
                    h.reason,
                    NULL AS pitch_id,
                    NULL AS pitch_name,
                    NULL AS old_pitch_name,
                    NULL AS new_pitch_name,
                    NULL AS old_pitch_status,
                    NULL AS new_pitch_status,
                    NULL AS old_notes,
                    NULL AS new_notes,
                    NULL AS old_category_name,
                    NULL AS new_category_name,
                    NULL AS price_slot_id,
                    NULL AS old_price,
                    NULL AS new_price,
                    NULL AS slot_start,
                    NULL AS slot_end,
                    NULL AS day_type,
                    NULL AS category_name,
                    u.full_name AS actor_name,
                    e.employee_code,
                    e.position,
                    EXISTS (
                        SELECT 1 FROM user_roles ur
                        JOIN roles r ON r.role_id = ur.role_id
                        WHERE ur.user_id = h.changed_by AND r.role_name = 'Admin'
                    ) AS is_admin
                FROM booking_status_history h
                LEFT JOIN users u ON u.user_id = h.changed_by
                LEFT JOIN employees e ON e.user_id = h.changed_by
                WHERE 1=1
                ${actorFilter}
                ${dateFilterSql.sql}
            `);
            if (query.actor_id) params.push(query.actor_id);
            params.push(...dateFilterSql.params);
        }

        if (!changeType || changeType === 'pitch') {
            parts.push(`
                SELECT
                    'pitch' AS source,
                    h.history_id,
                    h.changed_at,
                    h.changed_by,
                    NULL AS booking_id,
                    NULL AS old_status,
                    NULL AS new_status,
                    NULL AS reason,
                    h.pitch_id,
                    p.pitch_name,
                    h.old_pitch_name,
                    h.new_pitch_name,
                    h.old_status AS old_pitch_status,
                    h.new_status AS new_pitch_status,
                    h.old_notes,
                    h.new_notes,
                    oc.category_name AS old_category_name,
                    nc.category_name AS new_category_name,
                    NULL AS price_slot_id,
                    NULL AS old_price,
                    NULL AS new_price,
                    NULL AS slot_start,
                    NULL AS slot_end,
                    NULL AS day_type,
                    NULL AS category_name,
                    u.full_name AS actor_name,
                    e.employee_code,
                    e.position,
                    EXISTS (
                        SELECT 1 FROM user_roles ur
                        JOIN roles r ON r.role_id = ur.role_id
                        WHERE ur.user_id = h.changed_by AND r.role_name = 'Admin'
                    ) AS is_admin
                FROM pitch_history h
                LEFT JOIN pitches p ON p.pitch_id = h.pitch_id
                LEFT JOIN pitch_categories oc ON oc.category_id = h.old_category_id
                LEFT JOIN pitch_categories nc ON nc.category_id = h.new_category_id
                LEFT JOIN users u ON u.user_id = h.changed_by
                LEFT JOIN employees e ON e.user_id = h.changed_by
                WHERE 1=1
                ${actorFilter}
                ${dateFilterSql.sql}
            `);
            if (query.actor_id) params.push(query.actor_id);
            params.push(...dateFilterSql.params);
        }

        if (!changeType || changeType === 'price') {
            parts.push(`
                SELECT
                    'price' AS source,
                    h.history_id,
                    h.changed_at,
                    h.changed_by,
                    NULL AS booking_id,
                    NULL AS old_status,
                    NULL AS new_status,
                    NULL AS reason,
                    NULL AS pitch_id,
                    NULL AS pitch_name,
                    NULL AS old_pitch_name,
                    NULL AS new_pitch_name,
                    NULL AS old_pitch_status,
                    NULL AS new_pitch_status,
                    NULL AS old_notes,
                    NULL AS new_notes,
                    NULL AS old_category_name,
                    NULL AS new_category_name,
                    h.price_slot_id,
                    h.old_price,
                    h.new_price,
                    ps.start_time AS slot_start,
                    ps.end_time AS slot_end,
                    ps.day_type,
                    pc.category_name,
                    u.full_name AS actor_name,
                    e.employee_code,
                    e.position,
                    EXISTS (
                        SELECT 1 FROM user_roles ur
                        JOIN roles r ON r.role_id = ur.role_id
                        WHERE ur.user_id = h.changed_by AND r.role_name = 'Admin'
                    ) AS is_admin
                FROM price_slot_history h
                LEFT JOIN price_slots ps ON ps.price_slot_id = h.price_slot_id
                LEFT JOIN pitch_categories pc ON pc.category_id = ps.category_id
                LEFT JOIN users u ON u.user_id = h.changed_by
                LEFT JOIN employees e ON e.user_id = h.changed_by
                WHERE 1=1
                ${actorFilter}
                ${dateFilterSql.sql}
            `);
            if (query.actor_id) params.push(query.actor_id);
            params.push(...dateFilterSql.params);
        }

        if (parts.length === 0) {
            // Không bao giờ xảy ra vì change_type đã validate
            return { sql: 'SELECT 1 AS history_id WHERE 0', params: [] };
        }

        return { sql: parts.join('\nUNION ALL\n'), params };
    }

    private buildDateFilterSql(query: SystemLogQueryDto): {
        sql: string;
        params: unknown[];
    } {
        if (!query.from && !query.to) {
            return { sql: '', params: [] };
        }

        // TIMESTAMP lưu UTC (MySQL mặc định). Hiển thị theo Asia/Ho_Chi_Minh.
        // Lọc theo ngày VN: CONVERT_TZ(changed_at, '+00:00', '+07:00') nằm trong [from, to+1).
        // Nếu server đã set time_zone = '+07:00' thì CONVERT_TZ vẫn an toàn khi nguồn là UTC.
        // Fallback: DATE(changed_at) nếu CONVERT_TZ không khả dụng (hiếm).
        const clauses: string[] = [];
        const params: unknown[] = [];

        if (query.from) {
            clauses.push(
                `DATE(CONVERT_TZ(h.changed_at, @@session.time_zone, '+07:00')) >= ?`,
            );
            params.push(query.from);
        }
        if (query.to) {
            clauses.push(
                `DATE(CONVERT_TZ(h.changed_at, @@session.time_zone, '+07:00')) <= ?`,
            );
            params.push(query.to);
        }

        return {
            sql: clauses.length ? `AND ${clauses.join(' AND ')}` : '',
            params,
        };
    }

    // ------------------------------------------------------------------
    // Map row → item UI
    // ------------------------------------------------------------------

    private mapRow(row: RawLogRow): SystemLogItem {
        const actorName = this.buildActorName(
            row.actor_name,
            row.employee_code,
            row.position,
            Boolean(row.is_admin),
        );

        const actor: SystemLogActor = {
            user_id: row.changed_by,
            display_name: row.changed_by == null ? 'Hệ thống' : actorName,
        };

        const changedAt =
            row.changed_at instanceof Date
                ? row.changed_at.toISOString()
                : String(row.changed_at);

        if (row.source === 'booking') {
            return this.mapBooking(row, actor, changedAt);
        }
        if (row.source === 'pitch') {
            return this.mapPitch(row, actor, changedAt);
        }
        return this.mapPrice(row, actor, changedAt);
    }

    private mapBooking(
        row: RawLogRow,
        actor: SystemLogActor,
        changedAt: string,
    ): SystemLogItem {
        const code = row.booking_id
            ? buildTransferContent(row.booking_id)
            : '—';

        let action = 'Cập nhật trạng thái';
        if (!row.old_status && row.reason) {
            action = row.reason; // vd. "Tao booking" từ trigger
        } else if (row.reason) {
            action = row.reason;
        } else if (row.new_status === 'Cancelled') {
            action = 'Hủy booking';
        } else if (row.new_status === 'Confirmed') {
            action = 'Xác nhận booking';
        }

        // Chuẩn hóa reason tiếng Việt nếu trigger ghi tiếng Anh không dấu
        if (action === 'Tao booking') {
            action = 'Tạo booking';
        }

        return {
            id: `booking-${row.history_id}`,
            changed_at: changedAt,
            actor,
            change_type: 'booking',
            target: code,
            action,
            old_value: labelBookingStatus(row.old_status),
            new_value: labelBookingStatus(row.new_status),
        };
    }

    private mapPitch(
        row: RawLogRow,
        actor: SystemLogActor,
        changedAt: string,
    ): SystemLogItem {
        const name =
            row.new_pitch_name ||
            row.old_pitch_name ||
            row.pitch_name ||
            (row.pitch_id ? `Sân #${row.pitch_id}` : '—');

        // Xác định loại thay đổi nổi bật
        let action = 'Cập nhật sân';
        let oldValue = '—';
        let newValue = '—';

        if (
            row.old_pitch_status !== row.new_pitch_status &&
            (row.old_pitch_status != null || row.new_pitch_status != null)
        ) {
            action =
                row.new_pitch_status === 'Maintenance'
                    ? 'Bảo trì sân'
                    : row.new_pitch_status === 'Available'
                      ? 'Mở lại sân'
                      : 'Đổi trạng thái sân';
            oldValue = labelPitchStatus(row.old_pitch_status);
            newValue = labelPitchStatus(row.new_pitch_status);
        } else if (
            row.old_notes !== row.new_notes &&
            (row.old_notes != null || row.new_notes != null)
        ) {
            action = 'Cập nhật ghi chú';
            oldValue = row.old_notes?.trim() || '—';
            newValue = row.new_notes?.trim() || '—';
        } else if (
            row.old_pitch_name !== row.new_pitch_name &&
            (row.old_pitch_name != null || row.new_pitch_name != null)
        ) {
            action = 'Đổi tên sân';
            oldValue = row.old_pitch_name || '—';
            newValue = row.new_pitch_name || '—';
        } else if (
            row.old_category_name !== row.new_category_name &&
            (row.old_category_name != null || row.new_category_name != null)
        ) {
            action = 'Đổi loại sân';
            oldValue = row.old_category_name || '—';
            newValue = row.new_category_name || '—';
        } else {
            // Fallback: ghép các field đổi
            const partsOld: string[] = [];
            const partsNew: string[] = [];
            if (row.old_pitch_name !== row.new_pitch_name) {
                partsOld.push(row.old_pitch_name || '—');
                partsNew.push(row.new_pitch_name || '—');
            }
            if (row.old_pitch_status !== row.new_pitch_status) {
                partsOld.push(labelPitchStatus(row.old_pitch_status));
                partsNew.push(labelPitchStatus(row.new_pitch_status));
            }
            if (row.old_notes !== row.new_notes) {
                partsOld.push(row.old_notes || '—');
                partsNew.push(row.new_notes || '—');
            }
            oldValue = partsOld.join(' · ') || '—';
            newValue = partsNew.join(' · ') || '—';
        }

        return {
            id: `pitch-${row.history_id}`,
            changed_at: changedAt,
            actor,
            change_type: 'pitch',
            target: name,
            action,
            old_value: oldValue,
            new_value: newValue,
        };
    }

    private mapPrice(
        row: RawLogRow,
        actor: SystemLogActor,
        changedAt: string,
    ): SystemLogItem {
        const start = toHHmm(row.slot_start);
        const end = toHHmm(row.slot_end);
        const timeRange =
            start && end ? `${start.replace(/^0/, '')}–${end.replace(/^0/, '')}` : '';
        // "19:00" → "19–22h" style gần Figma
        const timeLabel =
            start && end
                ? `${parseInt(start, 10)}–${parseInt(end, 10)}h`
                : '';

        const dayLabel = row.day_type
            ? DAY_TYPE_LABEL[row.day_type] ?? row.day_type
            : '';
        const category = row.category_name || 'Sân';

        const targetParts = [category];
        if (timeLabel) targetParts.push(timeLabel);
        if (dayLabel && dayLabel !== 'Mọi ngày') targetParts.push(dayLabel);

        return {
            id: `price-${row.history_id}`,
            changed_at: changedAt,
            actor,
            change_type: 'price',
            target: targetParts.join(' · ') || `Khung giá #${row.price_slot_id}`,
            action: timeRange
                ? `Sửa giá ${timeLabel}`
                : 'Sửa giá',
            old_value: `${formatVnd(row.old_price)} / giờ`,
            new_value: `${formatVnd(row.new_price)} / giờ`,
        };
    }

    private buildActorName(
        fullName: string | null | undefined,
        employeeCode: string | null | undefined,
        position: string | null | undefined,
        isAdmin: boolean,
    ): string {
        if (!fullName) return 'Hệ thống';

        if (employeeCode) {
            // Ưu tiên chức danh nếu có (vd. "Thu Ngân - NV002")
            if (position) {
                return `${position} - ${employeeCode}`;
            }
            return `${fullName} - ${employeeCode}`;
        }

        if (isAdmin) {
            return `${fullName} - Admin`;
        }

        return fullName;
    }
}
