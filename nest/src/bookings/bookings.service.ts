
import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { ResultSetHeader, RowDataPacket } from 'mysql2';
import { DatabaseService } from '../database/database.service.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';

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
    start_time: string;
    end_time: string;
    price_per_hour: string | number;
}

interface TimeRow extends RowDataPacket {
    start_time: string;
    end_time: string;
}

@Injectable()
export class BookingsService {
    constructor(
        private readonly databaseService: DatabaseService,
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

    // Lấy ngày hiện tại theo đồng hồ của máy chạy NestJS.
    private getToday(): string {
        const now = new Date();

        return [
            now.getFullYear(),
            String(now.getMonth() + 1).padStart(2, '0'),
            String(now.getDate()).padStart(2, '0'),
        ].join('-');
    }

    // Kiểm tra ngày và giờ đặt sân có nằm trong tương lai.
    private validateFutureBooking(
        bookingDate: string,
        startMinutes: number,
    ): void {
        const today = this.getToday();
        const now = new Date();
        const currentMinutes =
            now.getHours() * 60 + now.getMinutes();

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

    private validateInput(dto: CreateBookingDto): void {
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

    // Tính tiền theo các khung giá mà khoảng đặt sân đi qua.
    private async calculatePrice(
        connection: import('mysql2/promise').PoolConnection,
        categoryId: number,
        startTime: string,
        endTime: string,
    ): Promise<number> {
        const start = this.toMinutes(startTime);
        const end = this.toMinutes(endTime);

        const [slots] = await connection.execute<PriceSlotRow[]>(
            `SELECT start_time, end_time, price_per_hour
             FROM price_slots
             WHERE category_id = ?
               AND start_time < ?
               AND end_time > ?
             ORDER BY start_time ASC`,
            [categoryId, endTime, startTime],
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

        const priceSlots =
            await this.databaseService.query<PriceSlotRow[]>(
                `SELECT start_time, end_time, price_per_hour
                 FROM price_slots
                 WHERE category_id = ?
                 ORDER BY start_time ASC`,
                [pitch.category_id],
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

        const now = new Date();
        const currentMinutes =
            now.getHours() * 60 + now.getMinutes();
        const today = this.getToday();

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
            total_slots: slots.length,
            available_slots: slots.filter(
                (slot) => slot.available,
            ).length,
            slots,
        };
    }

    // Tạo đơn đặt sân hiện có.
    async create(customerId: number, dto: CreateBookingDto) {
        this.validateInput(dto);

        const start = this.toMinutes(dto.start_time);
        const end = this.toMinutes(dto.end_time);

        const customer = await this.databaseService.query<
            RowDataPacket[]
        >(
            `SELECT user_id
             FROM customers
             WHERE user_id = ?`,
            [customerId],
        );

        if (customer.length === 0) {
            throw new BadRequestException(
                'Tài khoản chưa có hồ sơ khách hàng.',
            );
        }

        this.validateFutureBooking(dto.booking_date, start);

        return this.databaseService.transaction(async (connection) => {
            const [pitches] = await connection.execute<PitchRow[]>(
                `SELECT pitch_id, category_id, status
                 FROM pitches
                 WHERE pitch_id = ?
                 FOR UPDATE`,
                [dto.pitch_id],
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
                [
                    dto.pitch_id,
                    dto.booking_date,
                    dto.end_time,
                    dto.start_time,
                ],
            );

            if (overlaps.length > 0) {
                throw new ConflictException(
                    'Sân đã có đơn đặt trùng khung giờ.',
                );
            }

            const totalPrice = await this.calculatePrice(
                connection,
                pitch.category_id,
                dto.start_time,
                dto.end_time,
            );

            await connection.query(
                'SET @app_user_id = ?',
                [customerId],
            );

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
                    totalPrice,
                    dto.customer_note ?? null,
                ],
            );

            return {
                message: 'Tạo đơn đặt sân thành công.',
                booking: {
                    booking_id: result.insertId,
                    customer_id: customerId,
                    pitch_id: dto.pitch_id,
                    booking_date: dto.booking_date,
                    start_time: dto.start_time,
                    end_time: dto.end_time,
                    total_pitch_price: totalPrice,
                    status: 'Pending',
                    customer_note: dto.customer_note ?? null,
                },
            };
        });
    }
}