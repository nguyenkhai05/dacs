
import {
    Injectable,
    OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import mysql, { Pool, PoolConnection } from 'mysql2/promise';

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