import { describe, expect, it, vi } from 'vitest';

import { PaymentAdminController } from './payment-admin.controller.js';
import type { PaymentAdminService } from './payment-admin.service.js';

const staff = { sub: 3, email: 'admin@x.vn', roles: ['Admin'] };

describe('PaymentAdminController', () => {
  it('xác nhận hoàn cọc lấy người thao tác từ JWT, không từ body', async () => {
    const confirmRefund = vi.fn().mockResolvedValue({ ok: true });
    const controller = new PaymentAdminController({ confirmRefund } as unknown as PaymentAdminService);
    const dto = { transaction_code: 'ACB20261005' };

    await controller.confirmRefund(7, dto, staff);

    expect(confirmRefund).toHaveBeenCalledWith(7, dto, staff);
  });

  it('xuất CSV trả file đính kèm', async () => {
    const exportTransactions = vi
      .fn()
      .mockResolvedValue({ filename: 'giao-dich-2026-10-05.csv', csv: '\uFEFF"A"\r\n' });
    const controller = new PaymentAdminController({ exportTransactions } as unknown as PaymentAdminService);

    const file = await controller.exportTransactions({ date: '2026-10-05' });

    expect(file.getHeaders().disposition).toContain('giao-dich-2026-10-05.csv');
  });
});
