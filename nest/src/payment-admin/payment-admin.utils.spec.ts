import { describe, expect, it } from 'vitest';

import {
    allowedActions,
    buildCsv,
    computeInvoiceStatus,
    csvText,
    epochToIso,
    issueLabel,
    ledgerCode,
    methodLabel,
} from './payment-admin.utils.js';

describe('ledgerCode', () => {
    it('đệm 0 cho đủ 4 chữ số và đúng tiền tố', () => {
        expect(ledgerCode('payment', 501)).toBe('TT0501');
        expect(ledgerCode('refund', 7)).toBe('HT0007');
        expect(ledgerCode('transfer', 12345)).toBe('CK12345');
    });
});

describe('methodLabel', () => {
    it('phân biệt VietQR, tiền mặt và chuyển khoản thủ công', () => {
        expect(methodLabel('payment', 'Banking', 'Deposit')).toBe('VietQR');
        expect(methodLabel('payment', 'Cash', 'Balance')).toBe('Tiền mặt');
        expect(methodLabel('payment', 'Banking', 'Balance')).toBe('Chuyển khoản');
        expect(methodLabel('refund', 'Banking', 'Refund')).toBe('Chuyển khoản thủ công');
    });
});

describe('computeInvoiceStatus', () => {
    it('không có tiền thu -> Unpaid', () => {
        expect(computeInvoiceStatus(740000, 0, 0)).toBe('Unpaid');
    });

    it('thu một phần / đủ', () => {
        expect(computeInvoiceStatus(740000, 222000, 0)).toBe('PartiallyPaid');
        expect(computeInvoiceStatus(740000, 740000, 0)).toBe('Paid');
    });

    it('hoàn hết số đã thu -> Refunded, hoàn một phần -> PartiallyRefunded', () => {
        expect(computeInvoiceStatus(740000, 222000, 222000)).toBe('Refunded');
        expect(computeInvoiceStatus(740000, 740000, 222000)).toBe('PartiallyRefunded');
    });
});

describe('allowedActions', () => {
    it('thiếu cọc nhưng đơn còn chờ cọc -> ghi nhận bổ sung', () => {
        expect(allowedActions('AmountTooSmall', true, 'Pending')).toEqual([
            'apply_to_booking',
            'dismiss',
        ]);
    });

    it('tiền về đơn đã hủy -> hoàn tiền', () => {
        expect(allowedActions('BookingNotPending', true, 'Cancelled')).toEqual([
            'request_refund',
            'dismiss',
        ]);
    });

    it('thiếu cọc nhưng đơn đã hủy -> hoàn tiền thay vì bổ sung', () => {
        expect(allowedActions('AmountTooSmall', true, 'Cancelled')).toEqual([
            'request_refund',
            'dismiss',
        ]);
    });

    it('không tìm ra khoản cọc của đơn -> chỉ được bỏ qua', () => {
        expect(allowedActions('NoBookingCode', false, null)).toEqual(['dismiss']);
        expect(allowedActions('BookingNotPending', false, 'Cancelled')).toEqual(['dismiss']);
    });
});

describe('issueLabel', () => {
    it('hiển thị số tiền thiếu và đơn đã hủy', () => {
        expect(issueLabel('AmountTooSmall', 'Pending', -55000)).toContain('Thiếu');
        expect(issueLabel('BookingNotPending', 'Cancelled', null)).toBe('Chuyển khoản đơn đã hủy');
    });
});

describe('epochToIso', () => {
    it('đổi epoch giây sang ISO và giữ null', () => {
        expect(epochToIso(0)).toBe('1970-01-01T00:00:00.000Z');
        expect(epochToIso('1760000000')).toBe('2025-10-09T08:53:20.000Z');
        expect(epochToIso(null)).toBeNull();
    });
});

describe('CSV', () => {
    it('bọc nháy kép, nhân đôi nháy kép và chặn công thức Excel', () => {
        expect(csvText('Trần "Huy"')).toBe('"Trần ""Huy"""');
        expect(csvText('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
        expect(csvText('+84123')).toBe(`"'+84123"`);
        expect(csvText(null)).toBe('""');
    });

    it('có BOM và dùng xuống dòng CRLF', () => {
        const csv = buildCsv(['A', 'B'], [['"1"', '-222000']]);
        expect(csv.startsWith('\uFEFF')).toBe(true);
        expect(csv).toBe('\uFEFF"A","B"\r\n"1",-222000\r\n');
    });
});
