// Giới hạn số lần đăng nhập sai (in-memory, đủ dùng cho 1 instance).
// Khóa theo "định danh đăng nhập" (email/SĐT, đã chuẩn hóa chữ thường).
// Nếu sau này chạy nhiều instance, chuyển sang Redis hoặc @nestjs/throttler.

export class LoginRateLimiter {
    private readonly failures = new Map<
        string,
        { count: number; firstAt: number }
    >();

    constructor(
        private readonly maxAttempts = 5,
        private readonly windowMs = 15 * 60 * 1000,
    ) { }

    /** Số giây còn phải chờ nếu đang bị khóa, 0 nếu được phép thử. */
    retryAfterSeconds(key: string, now = Date.now()): number {
        const entry = this.failures.get(key);

        if (!entry) {
            return 0;
        }

        if (now - entry.firstAt >= this.windowMs) {
            this.failures.delete(key);
            return 0;
        }

        if (entry.count < this.maxAttempts) {
            return 0;
        }

        return Math.ceil((entry.firstAt + this.windowMs - now) / 1000);
    }

    recordFailure(key: string, now = Date.now()): void {
        const entry = this.failures.get(key);

        if (!entry || now - entry.firstAt >= this.windowMs) {
            this.failures.set(key, { count: 1, firstAt: now });
            return;
        }

        entry.count += 1;
    }

    reset(key: string): void {
        this.failures.delete(key);
    }
}
