import {
    ArgumentsHost,
    Catch,
    ExceptionFilter,
    HttpException,
    HttpStatus,
    Logger,
} from '@nestjs/common';

import { mapDbError } from './db-error.util.js';

/**
 * Bắt mọi lỗi không phải HttpException (lỗi MySQL, lỗi bất ngờ...)
 * để: (1) ghi log đầy đủ ở terminal backend, (2) trả JSON có thông báo rõ ràng
 * thay vì "Internal server error" chung chung.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
    private readonly logger = new Logger('Exception');

    catch(exception: unknown, host: ArgumentsHost) {
        const response = host.switchToHttp().getResponse();

        if (exception instanceof HttpException) {
            const status = exception.getStatus();
            const body = exception.getResponse();
            response
                .status(status)
                .json(typeof body === 'string' ? { statusCode: status, message: body } : body);
            return;
        }

        const mapped = mapDbError(exception);
        const status = mapped?.status ?? HttpStatus.INTERNAL_SERVER_ERROR;
        const message = mapped?.message ?? 'Lỗi máy chủ. Vui lòng thử lại sau.';

        this.logger.error(
            exception instanceof Error ? exception.stack ?? exception.message : String(exception),
        );

        response.status(status).json({
            statusCode: status,
            error: status === 503 ? 'Service Unavailable' : 'Error',
            message,
        });
    }
}
