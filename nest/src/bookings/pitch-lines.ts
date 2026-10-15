// Tách tiền sân của một đơn thành các dòng theo khung giá (vd 18:00-19:00 x 300.000,
// 19:00-20:00 x 350.000) để hiển thị ở màn chi tiết booking. Hàm thuần, dễ test.

export interface PriceSlotLike {
    start_time: string;
    end_time: string;
    price_per_hour: string | number;
}

export interface PitchLine {
    start_time: string; // HH:mm
    end_time: string; // HH:mm
    hours: number;
    price_per_hour: number;
    amount: number;
}

// "18:00", "18:00:00" hoặc "24:00" -> số phút
function toMinutes(time: string): number {
    const match = /^(\d{1,2}):([0-5]\d)(?::[0-5]\d)?$/.exec(time);

    if (!match) {
        throw new RangeError(`Giờ không hợp lệ: ${time}`);
    }

    return Number(match[1]) * 60 + Number(match[2]);
}

function format(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * Chia khoảng [start, end) theo các khung giá. Trả về null (để giao diện gộp thành
 * một dòng) nếu bảng giá hiện tại không còn khớp với số tiền đã lưu trên đơn, ví dụ
 * quản lý đã đổi giá sau khi khách đặt sân.
 */
export function splitPitchPrice(
    slots: PriceSlotLike[],
    startTime: string,
    endTime: string,
    storedTotal: number,
): PitchLine[] | null {
    const start = toMinutes(startTime);
    const end = toMinutes(endTime);

    if (end <= start) {
        return null;
    }

    const sorted = [...slots].sort(
        (a, b) => toMinutes(a.start_time) - toMinutes(b.start_time),
    );

    const lines: PitchLine[] = [];
    let cursor = start;

    for (const slot of sorted) {
        const from = Math.max(start, toMinutes(slot.start_time));
        const to = Math.min(end, toMinutes(slot.end_time));

        if (to <= from) {
            continue;
        }

        // Có khoảng hở hoặc khung giá chồng nhau: không tin được bảng giá
        if (from !== cursor) {
            return null;
        }

        const price = Number(slot.price_per_hour);
        const previous = lines[lines.length - 1];
        const minutes = to - from;

        if (previous && previous.price_per_hour === price) {
            // Hai khung liền nhau cùng giá thì gộp thành một dòng
            const mergedMinutes = (previous.hours * 60) + minutes;
            previous.end_time = format(to);
            previous.hours = mergedMinutes / 60;
            previous.amount = round2((mergedMinutes / 60) * price);
        } else {
            lines.push({
                start_time: format(from),
                end_time: format(to),
                hours: minutes / 60,
                price_per_hour: price,
                amount: round2((minutes / 60) * price),
            });
        }

        cursor = to;
    }

    if (cursor !== end || lines.length === 0) {
        return null;
    }

    const sum = round2(lines.reduce((total, line) => total + line.amount, 0));

    return Math.abs(sum - storedTotal) <= 0.01 ? lines : null;
}
