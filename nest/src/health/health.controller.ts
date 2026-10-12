import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';

import { mapDbError } from '../common/db-error.util.js';
import { DatabaseService } from '../database/database.service.js';

/** GET /health: kiểm tra nhanh backend + MySQL + dữ liệu vai trò (dùng khi "đăng ký không được"). */
@Controller('health')
export class HealthController {
    constructor(private readonly database: DatabaseService) { }

    @Get()
    async check() {
        try {
            const roles = await this.database.query<{ role_name: string }[]>(
                'SELECT role_name FROM roles',
            );
            const names = roles.map((r) => r.role_name);
            const missingRoles = ['Admin', 'Staff', 'Customer'].filter(
                (r) => !names.includes(r),
            );
            return {
                status: missingRoles.length === 0 ? 'ok' : 'degraded',
                database: 'connected',
                missing_roles: missingRoles,
                hint:
                    missingRoles.length > 0
                        ? 'Bảng roles thiếu dữ liệu: chạy lại phần INSERT roles trong football_pitch_db.sql.'
                        : undefined,
            };
        } catch (error) {
            const mapped = mapDbError(error);
            throw new ServiceUnavailableException(
                mapped?.message ??
                    'Không đọc được CSDL. Hãy kiểm tra đã chạy football_pitch_db.sql chưa.',
            );
        }
    }
}
