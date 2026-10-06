import type { PoolConnection } from 'mysql2/promise';

/**
 * Trả lại tồn kho các dịch vụ đi kèm của một đơn bị hủy.
 * Gọi trong transaction, và chỉ gọi khi đơn VỪA chuyển sang Cancelled
 * (kiểm tra affectedRows của câu UPDATE) để không cộng kho hai lần.
 */
export async function restoreServiceStock(
    connection: PoolConnection,
    bookingId: number,
): Promise<void> {
    await connection.execute(
        `
        UPDATE services s
        JOIN (
            SELECT service_id, SUM(quantity) AS qty
            FROM booking_services
            WHERE booking_id = ?
            GROUP BY service_id
        ) bs ON bs.service_id = s.service_id
        SET s.stock_quantity = s.stock_quantity + bs.qty
        `,
        [bookingId],
    );
}
