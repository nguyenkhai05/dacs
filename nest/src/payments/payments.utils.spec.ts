import { describe, expect, it } from 'vitest';

import {
    buildTransferContent,
    buildVietQrUrl,
    calculateDeposit,
    extractBookingId,
} from './payments.utils.js';

describe('payments.utils', () => {
    it('tạo nội dung chuyển khoản DS + id', () => {
        expect(buildTransferContent(1048)).toBe('DS1048');
    });

    it('tính cọc 30% và làm tròn tới đồng', () => {
        expect(calculateDeposit(250000, 30)).toBe(75000);
        expect(calculateDeposit(100001, 30)).toBe(30000);
    });

    it('tìm mã đơn trong nội dung do ngân hàng gửi về', () => {
        expect(extractBookingId('DS1048')).toBe(1048);
        expect(extractBookingId('ds 1048')).toBe(1048);
        expect(extractBookingId('MBVCB.123456.DS1048.CT tu NGUYEN VAN A')).toBe(1048);
        expect(extractBookingId('Chuyen tien DS77 dat san')).toBe(77);
    });

    it('không nhận nhầm nội dung không có mã đơn', () => {
        expect(extractBookingId('chuyen tien tra no')).toBeNull();
        expect(extractBookingId('ADS1048')).toBeNull();
        expect(extractBookingId('DS')).toBeNull();
        expect(extractBookingId('DS0')).toBeNull();
    });

    it('tạo link VietQR có số tiền, nội dung và tên tài khoản', () => {
        const url = new URL(
            buildVietQrUrl({
                bankId: 'MB',
                accountNumber: '0868104888',
                accountName: 'CONG TY DAT SAN',
                template: 'compact2',
                amount: 75000,
                content: 'DS1048',
            }),
        );

        expect(url.origin + url.pathname).toBe(
            'https://img.vietqr.io/image/MB-0868104888-compact2.png',
        );
        expect(url.searchParams.get('amount')).toBe('75000');
        expect(url.searchParams.get('addInfo')).toBe('DS1048');
        expect(url.searchParams.get('accountName')).toBe('CONG TY DAT SAN');
    });
});
