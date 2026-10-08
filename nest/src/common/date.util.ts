/** Cộng `days` ngày vào `date` (YYYY-MM-DD), tính thuần theo lịch, không phụ thuộc múi giờ máy. */
export function addDays(date: string, days: number): string {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}
