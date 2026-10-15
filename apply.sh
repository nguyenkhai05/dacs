#!/usr/bin/env bash
# Chạy ở THƯ MỤC GỐC repo (cùng cấp với nest/ và frontend/):  bash apply.sh
# 1) Chép các file MỚI của màn 10 vào đúng chỗ.  2) Áp dụng bản vá cho 4 file đã có.
# Nếu bản vá không khớp (file đã bị sửa khác), script dừng và KHÔNG sửa gì file của bạn.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(pwd)"

[ -d "$ROOT/nest/src" ] && [ -d "$ROOT/frontend/src" ] || {
  echo "Hãy chạy script ở thư mục gốc repo (có nest/ và frontend/)."; exit 1; }

echo "Kiểm tra bản vá..."
if patch -R -p1 --dry-run -d "$ROOT" < "$HERE/changes.patch" >/dev/null 2>&1; then
  echo "Bản vá đã được áp dụng trước đó. Không cần làm gì thêm."; exit 0
fi
patch -p1 --dry-run -d "$ROOT" < "$HERE/changes.patch" >/dev/null || {
  echo "Bản vá không khớp với file hiện tại của bạn. Chưa sửa gì."
  echo "Gửi lại cho mình các file: nest/src/bookings/my-bookings.service.ts, nest/src/bookings/bookings.controller.ts,"
  echo "frontend/src/App.tsx, README.md"; exit 1; }

echo "Chép file mới..."
(cd "$HERE" && find nest frontend -type f) | while read -r f; do
  mkdir -p "$ROOT/$(dirname "$f")"
  cp "$HERE/$f" "$ROOT/$f"
done

echo "Áp dụng bản vá..."
patch -p1 -d "$ROOT" < "$HERE/changes.patch"

echo
echo "Xong. Kiểm tra:  (cd nest && npx tsc --noEmit)  và  (cd frontend && npm run build)"
