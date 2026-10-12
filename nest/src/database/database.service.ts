
import {
    Injectable,
    OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import mysql, { Pool, PoolConnection } from 'mysql2/promise';

const DB_TIMEZONE = '+07:00';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
    private readonly pool: Pool;

    constructor(private readonly configService: ConfigService) {
        const host = this.configService.get<string>('DB_HOST');
        const user = this.configService.get<string>('DB_USER');
        const password = this.configService.get<string>('DB_PASSWORD') ?? '';
        const database = this.configService.get<string>('DB_NAME');
        const port = Number(
            this.configService.get<string>('DB_PORT') ?? 3306,
        );

        if (
            !host ||
            !user ||
            !database ||
            !Number.isInteger(port) ||
            port < 1 ||
            port > 65535
        ) {
            throw new Error(
                'Cấu hình MySQL không hợp lệ. Vui lòng kiểm tra DB_HOST, DB_PORT, DB_USER và DB_NAME trong file .env.',
            );
        }

        this.pool = mysql.createPool({
            host,
            port,
            user,
            password,
            database,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0,
            // Không để request treo vô hạn khi MySQL không tới được.
            connectTimeout: 10_000,
            // Nghiệp vụ tính theo giờ Việt Nam: đồng bộ múi giờ giữa Node và MySQL.
            timezone: DB_TIMEZONE,
        });

        // Mỗi kết nối mới dùng cùng múi giờ để NOW()/CURRENT_TIMESTAMP khớp với code.
        this.pool.on('connection', (connection) => {
            connection.query(`SET time_zone = '${DB_TIMEZONE}'`);
        });
    }

    async query<T = unknown>(
        sql: string,
        values: any[] = [],
    ): Promise<T> {
        const [rows] = await this.pool.execute(sql, values);
        return rows as T;
    }

    async transaction<T>(
        callback: (connection: PoolConnection) => Promise<T>,
    ): Promise<T> {
        const connection = await this.pool.getConnection();

        try {
            await connection.beginTransaction();

            const result = await callback(connection);

            await connection.commit();

            return result;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }

    async onModuleDestroy(): Promise<void> {
        await this.pool.end();
    }
}