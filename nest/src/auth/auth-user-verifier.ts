import { Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service.js';

export interface FreshUserState {
    is_active: boolean;
    roles: string[];
}

const CACHE_MS = 15_000;

/**
 * Đọc trạng thái MỚI NHẤT của người dùng (còn hoạt động? vai trò hiện tại?) mỗi khi có request,
 * để việc khóa tài khoản / đổi quyền có hiệu lực gần như ngay thay vì chờ JWT hết hạn.
 * Cache ngắn (15 giây) để không truy vấn CSDL cho từng request.
 */
@Injectable()
export class AuthUserVerifier {
    private readonly cache = new Map<number, { at: number; state: FreshUserState | null }>();

    constructor(private readonly database: DatabaseService) { }

    async load(userId: number): Promise<FreshUserState | null> {
        const hit = this.cache.get(userId);
        if (hit && Date.now() - hit.at < CACHE_MS) {
            return hit.state;
        }

        const rows = await this.database.query<
            { is_active: number | boolean; role_name: string | null }[]
        >(
            `
            SELECT u.is_active, r.role_name
            FROM users u
            LEFT JOIN user_roles ur ON ur.user_id = u.user_id
            LEFT JOIN roles r ON r.role_id = ur.role_id
            WHERE u.user_id = ?
            `,
            [userId],
        );

        const state: FreshUserState | null =
            rows.length === 0
                ? null
                : {
                    is_active: Boolean(Number(rows[0].is_active)),
                    roles: rows
                        .map((row) => row.role_name)
                        .filter((name): name is string => Boolean(name)),
                };

        this.cache.set(userId, { at: Date.now(), state });
        return state;
    }

    /** Gọi khi vừa đổi quyền/khóa tài khoản để lần request kế tiếp đọc lại. */
    invalidate(userId: number): void {
        this.cache.delete(userId);
    }
}
