import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { AllExceptionsFilter } from './all-exceptions.filter.js';
import { mapDbError } from './db-error.util.js';

function run(exception: unknown) {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ status }) }),
  };
  new AllExceptionsFilter().catch(exception, host as never);
  return { status, json };
}

describe('mapDbError', () => {
  it('ER_DUP_ENTRY theo SĐT/email trả 409', () => {
    expect(mapDbError({ code: 'ER_DUP_ENTRY', sqlMessage: "Duplicate entry for key 'users.phone_number'" }))
      .toEqual({ status: 409, message: 'Số điện thoại đã được sử dụng' });
    expect(mapDbError({ code: 'ER_DUP_ENTRY', sqlMessage: "Duplicate entry for key 'users.email'" })?.message)
      .toBe('Email đã được sử dụng');
  });

  it('lỗi kết nối trả 503', () => {
    expect(mapDbError({ code: 'ECONNREFUSED' })?.status).toBe(503);
  });

  it('thiếu bảng/cột trả 500 kèm gợi ý migration', () => {
    expect(mapDbError({ code: 'ER_BAD_FIELD_ERROR' })?.message).toContain('migration');
  });

  it('lỗi lạ trả null', () => {
    expect(mapDbError(new Error('x'))).toBeNull();
  });
});

describe('AllExceptionsFilter', () => {
  it('giữ nguyên HttpException', () => {
    const { status, json } = run(new BadRequestException('sai rồi'));
    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalled();
  });

  it('lỗi MySQL được dịch sang thông báo tiếng Việt', () => {
    const { status, json } = run({ code: 'ECONNREFUSED' });
    expect(status).toHaveBeenCalledWith(503);
    expect(json.mock.calls[0][0].message).toContain('cơ sở dữ liệu');
  });

  it('lỗi bất ngờ trả 500', () => {
    const { status } = run(new Error('boom'));
    expect(status).toHaveBeenCalledWith(500);
  });
});
