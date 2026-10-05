// Tiện ích thời gian dùng chung. Mọi nghiệp vụ đặt sân tính theo giờ Việt Nam,
// không phụ thuộc múi giờ của máy chủ/container (thường là UTC).

export const TIME_ZONE = 'Asia/Ho_Chi_Minh';

export interface VietnamNow {
    date: string; // YYYY-MM-DD
    time: string; // HH:mm:ss
    minutes: number; // số phút kể từ 00:00
}

export function getVietnamNow(now: Date = new Date()): VietnamNow {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
    }).formatToParts(now);

    const get = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((part) => part.type === type)?.value ?? '00';

    return {
        date: `${get('year')}-${get('month')}-${get('day')}`,
        time: `${get('hour')}:${get('minute')}:${get('second')}`,
        minutes: Number(get('hour')) * 60 + Number(get('minute')),
    };
}
