
import {
    BadRequestException,
    ConflictException,
    ForbiddenException,
    Injectable,
    InternalServerErrorException,
    NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';
import { dayTypeCandidates, selectEffectiveSlots, type DayType } from '../common/pricing.util.js';
import { getVietnamNow } from '../common/time.util.js';
import { DatabaseService } from '../database/database.service.js';
import { buildTransferContent } from '../payments/payments.utils.js';
import {
    calculateRefund,
    parseDepositPercent,
    parseHoldMinutes,
    round2,
} from './booking-policy.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';
import type {
    BookingServiceItemDto,
    QuoteBookingDto,
} from './dto/quote-booking.dto.js';

interface AvailabilityPitchRow extends RowDataPacket {
    pitch_id: number;
    pitch_name: string;
    category_id: number | null;
    status: string;
}

interface AvailabilityBookingRow extends RowDataPacket {
    start_time: string;
    end_time: string;
}

interface PitchRow extends RowDataPacket {
    pitch_id: number;
    category_id: number | null;
    status: string;
}

interface PriceSlotRow extends RowDataPacket {
    day_type: DayType;
    start_time: string;
    end_time: string;
    price_per_hour: string | number;
    // 1 nếu ngày đang xét nằm trong bảng holidays (cột này giống nhau ở mọi dòng)
    is_holiday?: number | string | null;
}

interface TimeRow extends RowDataPacket {
    start_time: string;
    end_time: string;
}

interface ServiceRow extends RowDataPacket {
    service_id: number;
    service_name: string;
    unit: string;
    price: string | number;
    stock_quantity: number;
    is_active: number;
}

export interface ServiceLine {
    service_id: number;
    service_name: string;
    unit: string;
    quantity: number;
    unit_price: number;
    line_total: number;
}

export interface PreparedBooking {
    pitch: PitchRow;
    pitchPrice: number;
    lines: ServiceLine[];
    servicesTotal: number;
    total: number;
}

const MAX_SERVICE_QUANTITY = 99;

@Injectable()
export class BookingsService {
    constructor(
        private readonly databaseService: DatabaseService,
        private readonly config: ConfigService,
    ) { }

    // Chuyển giờ HH:mm hoặc HH:mm:ss thành số phút.
    private toMinutes(time: string): number {
        const match =
            /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(time);

        if (!match) {
            throw new BadRequestException(
                'Giờ phải có định dạng HH:mm hoặc HH:mm:ss.',
            );
        }

        return (
            Number(match[1]) * 60 +
            Number(match[2]) +
            Number(match[3] ?? 0) / 60
        );
    }

    // Kiểm tra ngày có đúng định dạng và là ngày hợp lệ.
    private validateDate(dateString: string): void {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
            throw new BadRequestException(
                'Ngày phải có định dạng YYYY-MM-DD.',
            );
        }

        const date = new Date(`${dateString}T00:00:00Z`);

        if (
            Number.isNaN(date.getTime()) ||
            date.toISOString().slice(0, 10) !== dateString
        ) {
            throw new BadRequestException('Ngày không hợp lệ.');
        }
    }

    // Ngày hiện tại theo giờ Việt Nam (không phụ thuộc múi giờ máy chủ).
    private getToday(): string {
        return getVietnamNow().date;
    }

    // Kiểm tra ngày và giờ đặt sân có nằm trong tương lai.
    private validateFutureBooking(
        bookingDate: string,
        startMinutes: number,
    ): void {
        const { date: today, minutes: currentMinutes } = getVietnamNow();

        if (
            bookingDate < today ||
            (
                bookingDate === today &&
                startMinutes <= currentMinutes
            )
        ) {
            throw new BadRequestException(
                'Thời gian đặt sân phải ở trong tương lai.',
            );
        }
    }

    private validateInput(
        dto: QuoteBookingDto & { customer_note?: string },
    ): void {
        if (
            !Number.isSafeInteger(dto.pitch_id) ||
            dto.pitch_id <= 0
        ) {
            throw new BadRequestException(
                'pitch_id không hợp lệ.',
            );
        }

        this.validateDate(dto.booking_date);

        const start = this.toMinutes(dto.start_time);
        const end = this.toMinutes(dto.end_time);

        if (end <= start) {
            throw new BadRequestException(
                'Giờ kết thúc phải sau giờ bắt đầu trong cùng ngày.',
            );
        }

        if (
            dto.customer_note !== undefined &&
            (
                typeof dto.customer_note !== 'string' ||
                dto.customer_note.length > 5000
            )
        ) {
            throw new BadRequestException(
                'Ghi chú không hợp lệ.',
            );
        }
    }

    // Lấy bộ khung giá có hiệu lực của loại sân trong một ngày
    // (thứ trong tuần / ngày lễ - xem common/pricing.util.ts).
    private async loadEffectiveSlots(
        run: (sql: string, params: (string | number)[]) => Promise<PriceSlotRow[]>,
        categoryId: number,
        date: string,
    ): Promise<{ slots: PriceSlotRow[]; isHoliday: boolean }> {
        const rows = await run(
            `SELECT day_type, start_time, end_time, price_per_hour,
                    EXISTS (SELECT 1 FROM holidays WHERE holiday_date = ?) AS is_holiday
             FROM price_slots
             WHERE category_id = ?
             ORDER BY start_time ASC`,
            [date, categoryId],
        );

        const isHoliday = rows.some((row) => Number(row.is_holiday) === 1);
        const slots = selectEffectiveSlots(
            rows,
            dayTypeCandidates(date, isHoliday),
        );

        return { slots, isHoliday };
    }

    // Tính tiền theo các khung giá mà khoảng đặt sân đi qua.
    private async calculatePrice(
        connection: import('mysql2/promise').PoolConnection,
        categoryId: number,
        date: string,
        startTime: string,
        endTime: string,
    ): Promise<number> {
        const start = this.toMinutes(startTime);
        const end = this.toMinutes(endTime);

        const { slots } = await this.loadEffectiveSlots(
            async (sql, params) => {
                const [rows] = await connection.execute<PriceSlotRow[]>(
                    sql,
                    params,
                );
                return rows;
            },
            categoryId,
            date,
        );

        let cursor = start;
        let total = 0;

        for (const slot of slots) {
            const slotStart = this.toMinutes(slot.start_time);
            const slotEnd = this.toMinutes(slot.end_time);

            const overlapStart = Math.max(start, slotStart);
            const overlapEnd = Math.min(end, slotEnd);

            if (overlapEnd <= overlapStart) {
                continue;
            }

            if (overlapStart > cursor) {
                throw new BadRequestException(
                    'Khung giờ đặt sân chưa có bảng giá đầy đủ.',
                );
            }

            if (overlapStart < cursor) {
                throw new BadRequestException(
                    'Các khung giá bị chồng lấn.',
                );
            }

            const minutes = overlapEnd - overlapStart;
            const hourlyPrice = Number(slot.price_per_hour);

            if (
                !Number.isFinite(hourlyPrice) ||
                hourlyPrice < 0
            ) {
                throw new BadRequestException(
                    'Giá sân không hợp lệ.',
                );
            }

            total += (minutes / 60) * hourlyPrice;
            cursor = overlapEnd;

            if (cursor >= end) {
                break;
            }
        }

        if (cursor < end) {
            throw new BadRequestException(
                'Khung giờ đặt sân chưa có bảng giá đầy đủ.',
            );
        }

        return Math.round((total + Number.EPSILON) * 100) / 100;
    }

    // API kiểm tra các khung giờ một tiếng còn trống.
    async getAvailability(
        pitchIdInput: string,
        date: string,
    ) {
        const pitchId = Number(pitchIdInput);

        if (
            !Number.isSafeInteger(pitchId) ||
            pitchId <= 0
        ) {
            throw new BadRequestException(
                'pitch_id không hợp lệ.',
            );
        }

        this.validateDate(date);

        if (date < this.getToday()) {
            throw new BadRequestException(
                'Không thể kiểm tra lịch cho ngày đã qua.',
            );
        }

        const pitches =
            await this.databaseService.query<AvailabilityPitchRow[]>(
                `SELECT pitch_id, pitch_name, category_id, status
                 FROM pitches
                 WHERE pitch_id = ?`,
                [pitchId],
            );

        const pitch = pitches[0];

        if (!pitch) {
            throw new NotFoundException('Không tìm thấy sân.');
        }

        if (pitch.status !== 'Available') {
            throw new BadRequestException(
                'Sân hiện không khả dụng.',
            );
        }

        if (pitch.category_id === null) {
            throw new BadRequestException(
                'Sân chưa được phân loại để tính giá.',
            );
        }

        const { slots: priceSlots, isHoliday } =
            await this.loadEffectiveSlots(
                (sql, params) =>
                    this.databaseService.query<PriceSlotRow[]>(sql, params),
                pitch.category_id,
                date,
            );

        const bookings =
            await this.databaseService.query<AvailabilityBookingRow[]>(
                `SELECT start_time, end_time
                 FROM bookings
                 WHERE pitch_id = ?
                   AND booking_date = ?
                   AND status IN (
                       'Pending', 'Confirmed', 'CheckedIn', 'Playing'
                   )`,
                [pitchId, date],
            );

        const slots: {
            start_time: string;
            end_time: string;
            price_per_hour: number;
            available: boolean;
        }[] = [];

        const { date: today, minutes: currentMinutes } = getVietnamNow();

        const formatTime = (minutes: number): string => {
            const hours = Math.floor(minutes / 60);
            const mins = minutes % 60;

            return (
                `${String(hours).padStart(2, '0')}:` +
                `${String(mins).padStart(2, '0')}`
            );
        };

        for (const priceSlot of priceSlots) {
            const priceStart = this.toMinutes(priceSlot.start_time);
            const priceEnd = this.toMinutes(priceSlot.end_time);
            const price = Number(priceSlot.price_per_hour);

            if (
                !Number.isFinite(price) ||
                price < 0 ||
                priceEnd <= priceStart
            ) {
                throw new BadRequestException(
                    'Khung giá sân không hợp lệ.',
                );
            }

            // Chỉ tạo khung một tiếng nằm trọn trong khung giá.
            for (
                let start = priceStart;
                start + 60 <= priceEnd;
                start += 60
            ) {
                const end = start + 60;

                const isBooked = bookings.some((booking) => {
                    const bookingStart = this.toMinutes(
                        booking.start_time,
                    );
                    const bookingEnd = this.toMinutes(
                        booking.end_time,
                    );

                    return (
                        bookingStart < end &&
                        bookingEnd > start
                    );
                });

                const isPast =
                    date === today &&
                    start <= currentMinutes;

                slots.push({
                    start_time: formatTime(start),
                    end_time: formatTime(end),
                    price_per_hour: price,
                    available: !isBooked && !isPast,
                });
            }
        }

        return {
            pitch_id: pitch.pitch_id,
            pitch_name: pitch.pitch_name,
            category_id: pitch.category_id,
            booking_date: date,
            // Loại ngày quyết định bảng giá: Holiday / Weekend / Weekday / All
            pricing_day_type: priceSlots[0]?.day_type ?? null,
            is_holiday: isHoliday,
            total_slots: slots.length,
            available_slots: slots.filter(
                (slot) => slot.available,
            ).length,
            slots,
        };
    }

    // ---------------------------------------------------------------
    // Cấu hình tiền cọc / giữ chỗ (đọc mỗi lần để app vẫn khởi động khi thiếu)
    // ---------------------------------------------------------------

    private get depositPercent(): number {
        try {
            return parseDepositPercent(
                this.config.get<string>('DEPOSIT_PERCENT'),
            );
        } catch (error) {
            throw new InternalServerErrorException((error as Error).message);
        }
    }

    private get holdMinutes(): number {
        try {
            return parseHoldMinutes(
                this.config.get<string>('PAYMENT_HOLD_MINUTES'),
            );
        } catch (error) {
            throw new InternalServerErrorException((error as Error).message);
        }
    }

    // ---------------------------------------------------------------
    // Dịch vụ đi kèm
    // ---------------------------------------------------------------

    // Gộp các dòng trùng service_id thành một (cộng số lượng).
    private mergeServiceItems(
        items: BookingServiceItemDto[],
    ): Map<number, number> {
        const merged = new Map<number, number>();

        for (const item of items) {
            const quantity = (merged.get(item.service_id) ?? 0) + item.quantity;

            if (quantity > MAX_SERVICE_QUANTITY) {
                throw new BadRequestException(
                    `Số lượng mỗi dịch vụ tối đa ${MAX_SERVICE_QUANTITY}.`,
                );
            }

            merged.set(item.service_id, quantity);
        }

        return merged;
    }

    /**
     * Đọc các dịch vụ khách chọn, kiểm tra còn kinh doanh và đủ tồn kho.
     * lock = true (khi tạo đơn): khóa dòng theo thứ tự service_id để hai đơn
     * cùng mua một món không bị deadlock hay bán lố tồn kho.
     */
    private async loadServiceLines(
        connection: PoolConnection,
        items: BookingServiceItemDto[],
        lock: boolean,
    ): Promise<ServiceLine[]> {
        const merged = this.mergeServiceItems(items);

        if (merged.size === 0) {
            return [];
        }

        const ids = [...merged.keys()].sort((a, b) => a - b);
        const placeholders = ids.map(() => '?').join(', ');

        const [rows] = await connection.execute<ServiceRow[]>(
            `SELECT service_id, service_name, unit, price, stock_quantity, is_active
             FROM services
             WHERE service_id IN (${placeholders})
             ORDER BY service_id ASC
             ${lock ? 'FOR UPDATE' : ''}`,
            ids,
        );

        const byId = new Map(rows.map((row) => [Number(row.service_id), row]));
        const lines: ServiceLine[] = [];

        for (const id of ids) {
            const row = byId.get(id);
            const quantity = merged.get(id) as number;

            if (!row) {
                throw new BadRequestException(
                    `Dịch vụ #${id} không tồn tại.`,
                );
            }

            if (!row.is_active) {
                throw new BadRequestException(
                    `Dịch vụ "${row.service_name}" hiện không kinh doanh.`,
                );
            }

            if (Number(row.stock_quantity) < quantity) {
                throw new ConflictException(
                    `Dịch vụ "${row.service_name}" chỉ còn ${Number(row.stock_quantity)} ${row.unit}.`,
                );
            }

            const unitPrice = Number(row.price);

            lines.push({
                service_id: id,
                service_name: row.service_name,
                unit: row.unit,
                quantity,
                unit_price: unitPrice,
                line_total: round2(quantity * unitPrice),
            });
        }

        return lines;
    }

    /**
     * Kiểm tra sân + khung giờ + dịch vụ và tính tiền. Dùng chung cho
     * "tính tiền thử" (lock = false) và "tạo đơn" (lock = true).
     */
    async prepare(
        connection: PoolConnection,
        dto: QuoteBookingDto,
        lock: boolean,
    ): Promise<PreparedBooking> {
        const [pitches] = await connection.execute<PitchRow[]>(
            `SELECT pitch_id, category_id, status
             FROM pitches
             WHERE pitch_id = ?
             ${lock ? 'FOR UPDATE' : ''}`,
            [dto.pitch_id],
        );

        const pitch = pitches[0];

        if (!pitch) {
            throw new NotFoundException('Không tìm thấy sân.');
        }

        if (pitch.status !== 'Available') {
            throw new BadRequestException('Sân hiện không khả dụng.');
        }

        if (pitch.category_id === null) {
            throw new BadRequestException(
                'Sân chưa được phân loại để tính giá.',
            );
        }

        const [overlaps] = await connection.execute<TimeRow[]>(
            `SELECT start_time, end_time
             FROM bookings
             WHERE pitch_id = ?
               AND booking_date = ?
               AND status IN (
                   'Pending', 'Confirmed', 'CheckedIn', 'Playing'
               )
               AND start_time < ?
               AND end_time > ?
             LIMIT 1`,
            [dto.pitch_id, dto.booking_date, dto.end_time, dto.start_time],
        );

        if (overlaps.length > 0) {
            throw new ConflictException(
                'Sân đã có đơn đặt trùng khung giờ.',
            );
        }

        const pitchPrice = await this.calculatePrice(
            connection,
            pitch.category_id,
            dto.booking_date,
            dto.start_time,
            dto.end_time,
        );

        const lines = await this.loadServiceLines(
            connection,
            dto.services ?? [],
            lock,
        );
        const servicesTotal = round2(
            lines.reduce((sum, line) => sum + line.line_total, 0),
        );

        return {
            pitch,
            pitchPrice,
            lines,
            servicesTotal,
            total: round2(pitchPrice + servicesTotal),
        };
    }

    buildAmounts(prepared: PreparedBooking) {
        const depositPercent = this.depositPercent;
        const deposit = calculateRefund(prepared.total, depositPercent);

        return {
            pitch_total: prepared.pitchPrice,
            services_total: prepared.servicesTotal,
            total_amount: prepared.total,
            deposit_percent: depositPercent,
            deposit_amount: deposit,
            remaining_amount: round2(prepared.total - deposit),
        };
    }

    // ---------------------------------------------------------------
    // Màn 07: tính tiền thử (chưa tạo đơn, không giữ sân)
    // ---------------------------------------------------------------

    async quote(dto: QuoteBookingDto) {
        this.validateInput(dto);

        this.validateFutureBooking(
            dto.booking_date,
            this.toMinutes(dto.start_time),
        );

        const prepared = await this.databaseService.transaction(
            (connection) => this.prepare(connection, dto, false),
        );

        return {
            pitch_id: dto.pitch_id,
            booking_date: dto.booking_date,
            start_time: dto.start_time,
            end_time: dto.end_time,
            services: prepared.lines,
            ...this.buildAmounts(prepared),
        };
    }

    // ---------------------------------------------------------------
    // Màn 07: tạo đơn đặt sân (kèm dịch vụ đi kèm)
    // ---------------------------------------------------------------

    async create(customerId: number, dto: CreateBookingDto) {
        this.validateInput(dto);

        const start = this.toMinutes(dto.start_time);

        const customer = await this.databaseService.query<
            RowDataPacket[]
        >(
            `SELECT c.user_id, u.is_active
             FROM customers c
             JOIN users u ON u.user_id = c.user_id
             WHERE c.user_id = ?`,
            [customerId],
        );

        if (customer.length === 0) {
            throw new BadRequestException(
                'Tài khoản chưa có hồ sơ khách hàng.',
            );
        }

        // Tài khoản bị Admin khóa (màn Người dùng) không được đặt thêm sân,
        // kể cả khi token đăng nhập cũ còn hạn.
        if (customer[0].is_active === 0 || customer[0].is_active === false) {
            throw new ForbiddenException(
                'Tài khoản của bạn đã bị khóa. Vui lòng liên hệ quản lý để được hỗ trợ.',
            );
        }

        this.validateFutureBooking(dto.booking_date, start);

        // Đọc cấu hình trước khi mở transaction để lỗi cấu hình không giữ khóa
        const holdMinutes = this.holdMinutes;
        void this.depositPercent; // kiểm tra cấu hình cọc hợp lệ

        return this.databaseService.transaction(async (connection) => {
            const prepared = await this.prepare(connection, dto, true);

            await connection.query(
                'SET @app_user_id = ?',
                [customerId],
            );

            let bookingId: number;

            try {
                const [result] = await connection.execute<ResultSetHeader>(
                    `INSERT INTO bookings (
                        customer_id,
                        pitch_id,
                        booking_date,
                        start_time,
                        end_time,
                        total_pitch_price,
                        status,
                        customer_note
                    ) VALUES (?, ?, ?, ?, ?, ?, 'Pending', ?)`,
                    [
                        customerId,
                        dto.pitch_id,
                        dto.booking_date,
                        dto.start_time,
                        dto.end_time,
                        prepared.pitchPrice,
                        dto.customer_note ?? null,
                    ],
                );

                bookingId = result.insertId;
            } finally {
                await connection
                    .query('SET @app_user_id = NULL')
                    .catch(() => undefined);
            }

            // Chốt dịch vụ: lưu giá tại thời điểm đặt và giữ hàng trong kho
            for (const line of prepared.lines) {
                await connection.execute(
                    `INSERT INTO booking_services
                        (booking_id, service_id, quantity, unit_price)
                     VALUES (?, ?, ?, ?)`,
                    [bookingId, line.service_id, line.quantity, line.unit_price],
                );

                const [stock] = await connection.execute<ResultSetHeader>(
                    `UPDATE services
                     SET stock_quantity = stock_quantity - ?
                     WHERE service_id = ? AND stock_quantity >= ?`,
                    [line.quantity, line.service_id, line.quantity],
                );

                if (stock.affectedRows !== 1) {
                    throw new ConflictException(
                        `Dịch vụ "${line.service_name}" vừa hết hàng, vui lòng chọn lại.`,
                    );
                }
            }

            return {
                message: 'Tạo đơn đặt sân thành công.',
                booking: {
                    booking_id: bookingId,
                    booking_code: buildTransferContent(bookingId),
                    customer_id: customerId,
                    pitch_id: dto.pitch_id,
                    booking_date: dto.booking_date,
                    start_time: dto.start_time,
                    end_time: dto.end_time,
                    total_pitch_price: prepared.pitchPrice,
                    status: 'Pending',
                    customer_note: dto.customer_note ?? null,
                    services: prepared.lines,
                    ...this.buildAmounts(prepared),
                    hold_minutes: holdMinutes,
                },
            };
        });
    }
}
