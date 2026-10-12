/**
 * Chuyển lỗi MySQL "thô" thành thông báo tiếng Việt dễ hiểu cho người dùng / lập trình viên.
 * Trả về null nếu không phải lỗi CSDL đã biết.
 */
export interface MappedDbError {
    status: number;
    message: string;
}

interface MysqlLikeError {
    code?: string;
    errno?: number;
    sqlMessage?: string;
}

const CONNECTION_CODES = new Set([
    'ECONNREFUSED',
    'ENOTFOUND',
    'ETIMEDOUT',
    'EHOSTUNREACH',
    'PROTOCOL_CONNECTION_LOST',
    'ER_ACCESS_DENIED_ERROR',
    'ER_BAD_DB_ERROR',
    'ER_CON_COUNT_ERROR',
]);

export function mapDbError(error: unknown): MappedDbError | null {
    if (!error || typeof error !== 'object') return null;
    const err = error as MysqlLikeError;
    const code = err.code;
    if (!code) return null;

    if (code === 'ER_DUP_ENTRY') {
        const text = err.sqlMessage ?? '';
        if (/phone/i.test(text)) {
            return { status: 409, message: 'Số điện thoại đã được sử dụng' };
        }
        if (/email/i.test(text)) {
            return { status: 409, message: 'Email đã được sử dụng' };
        }
        return { status: 409, message: 'Dữ liệu đã tồn tại, vui lòng kiểm tra lại' };
    }

    if (CONNECTION_CODES.has(code)) {
        return {
            status: 503,
            message:
                'Máy chủ không kết nối được cơ sở dữ liệu. Hãy kiểm tra MySQL đã chạy và DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME trong nest/.env.',
        };
    }

    if (code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_FIELD_ERROR') {
        return {
            status: 500,
            message:
                'Cơ sở dữ liệu chưa đúng phiên bản (thiếu bảng/cột). Hãy chạy lại football_pitch_db.sql (đã gộp migration) hoặc các file trong db/migrations.',
        };
    }

    return null;
}
