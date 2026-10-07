// Các hàm thuần (không đụng DB) cho đánh giá sau trận, dễ viết unit test.

export const MAX_COMMENT_LENGTH = 1000;

/**
 * Che bớt tên khách khi hiển thị công khai:
 * "Nguyễn Văn Khách" -> "N. V. Khách" (tên gọi nằm cuối trong tiếng Việt).
 */
export function maskReviewerName(fullName: string | null | undefined): string {
    const words = (fullName ?? '').trim().split(/\s+/).filter(Boolean);

    if (words.length === 0) {
        return 'Khách hàng';
    }

    if (words.length === 1) {
        return words[0];
    }

    const initials = words
        .slice(0, -1)
        .map((word) => `${Array.from(word)[0].toUpperCase()}.`);

    return [...initials, words[words.length - 1]].join(' ');
}

/** Cắt khoảng trắng thừa; chuỗi rỗng coi như không có nhận xét. */
export function normalizeComment(
    value: string | null | undefined,
): string | null {
    const trimmed = value?.trim();
    return trimmed ? trimmed : null;
}

/**
 * Lý do chưa được đánh giá theo trạng thái đơn.
 * Trả về null nếu đơn đã hoàn thành (được phép đánh giá).
 */
export function reviewBlockReason(status: string): string | null {
    switch (status) {
        case 'Completed':
            return null;
        case 'Cancelled':
        case 'NoShow':
            return 'Đơn đã hủy hoặc không đến sân nên không thể đánh giá';
        default:
            return 'Bạn chỉ đánh giá được sau khi trận đấu kết thúc';
    }
}

export interface RatingAggregateRow {
    review_count: string | number | null;
    average: string | number | null;
    star_1: string | number | null;
    star_2: string | number | null;
    star_3: string | number | null;
    star_4: string | number | null;
    star_5: string | number | null;
}

export interface RatingSummary {
    average: number; // làm tròn 1 chữ số thập phân, 0 nếu chưa có đánh giá
    review_count: number;
    distribution: Record<'1' | '2' | '3' | '4' | '5', number>;
}

export function buildRatingSummary(
    row: RatingAggregateRow | undefined,
): RatingSummary {
    const count = Number(row?.review_count ?? 0);
    const average = Number(row?.average ?? 0);

    return {
        average: count > 0 ? Math.round(average * 10) / 10 : 0,
        review_count: count,
        distribution: {
            '1': Number(row?.star_1 ?? 0),
            '2': Number(row?.star_2 ?? 0),
            '3': Number(row?.star_3 ?? 0),
            '4': Number(row?.star_4 ?? 0),
            '5': Number(row?.star_5 ?? 0),
        },
    };
}
