import { describe, expect, it } from 'vitest';

import {
    buildRatingSummary,
    maskReviewerName,
    normalizeComment,
    reviewBlockReason,
} from './reviews.utils.js';

describe('reviews.utils', () => {
    it('che tên khách, giữ tên gọi ở cuối', () => {
        expect(maskReviewerName('Nguyễn Văn Khách')).toBe('N. V. Khách');
        expect(maskReviewerName('  trần   thị mai ')).toBe('T. T. mai');
        expect(maskReviewerName('Khách')).toBe('Khách');
    });

    it('tên trống thì hiện "Khách hàng"', () => {
        expect(maskReviewerName('')).toBe('Khách hàng');
        expect(maskReviewerName('   ')).toBe('Khách hàng');
        expect(maskReviewerName(null)).toBe('Khách hàng');
    });

    it('chuẩn hóa nhận xét: cắt khoảng trắng, rỗng thành null', () => {
        expect(normalizeComment('  Sân đẹp  ')).toBe('Sân đẹp');
        expect(normalizeComment('   ')).toBeNull();
        expect(normalizeComment(undefined)).toBeNull();
    });

    it('chỉ cho đánh giá đơn đã hoàn thành', () => {
        expect(reviewBlockReason('Completed')).toBeNull();
        expect(reviewBlockReason('Confirmed')).toContain('sau khi trận đấu');
        expect(reviewBlockReason('Pending')).toContain('sau khi trận đấu');
        expect(reviewBlockReason('Cancelled')).toContain('không thể đánh giá');
        expect(reviewBlockReason('NoShow')).toContain('không thể đánh giá');
    });

    it('tổng hợp điểm: làm tròn 1 số thập phân, đổi chuỗi sang số', () => {
        const summary = buildRatingSummary({
            review_count: '3',
            average: '4.3333',
            star_1: '0',
            star_2: '0',
            star_3: '1',
            star_4: '0',
            star_5: '2',
        });

        expect(summary.average).toBe(4.3);
        expect(summary.review_count).toBe(3);
        expect(summary.distribution).toEqual({
            '1': 0,
            '2': 0,
            '3': 1,
            '4': 0,
            '5': 2,
        });
    });

    it('chưa có đánh giá thì trung bình bằng 0', () => {
        const summary = buildRatingSummary({
            review_count: 0,
            average: null,
            star_1: null,
            star_2: null,
            star_3: null,
            star_4: null,
            star_5: null,
        });

        expect(summary.average).toBe(0);
        expect(summary.review_count).toBe(0);
        expect(buildRatingSummary(undefined).review_count).toBe(0);
    });
});
