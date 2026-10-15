#!/usr/bin/env bash
# Thêm MyBookingsService.updateRefundAccount (sửa lỗi ts(2339) ở my-bookings.refund-account.spec.ts).
#
#   ./apply.sh [thư-mục-gốc-repo]            áp dụng (mặc định: thư mục hiện tại)
#   ./apply.sh --check [thư-mục-gốc-repo]    chỉ kiểm tra xung đột, không sửa gì
#   ./apply.sh --revert [thư-mục-gốc-repo]   gỡ lại các thay đổi này
#
# Dùng `git apply` nên "tất cả hoặc không gì": nếu có xung đột thì KHÔNG file nào bị sửa.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PATCH="$HERE/fix-refund-account.patch"
MODE="apply"
TARGET="."

for arg in "$@"; do
  case "$arg" in
    --check)  MODE="check" ;;
    --revert) MODE="revert" ;;
    -h|--help) sed -n '2,9p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) TARGET="$arg" ;;
  esac
done

die() { echo "✗ $*" >&2; exit 1; }

command -v git >/dev/null 2>&1 || die "Cần cài git."
[[ -f "$PATCH" ]] || die "Không thấy $PATCH (hãy giữ apply.sh và fix-refund-account.patch cùng thư mục)."
cd "$TARGET"
[[ -f nest/src/bookings/my-bookings.service.ts ]] \
  || die "Hãy chạy ở thư mục gốc repo (nơi có thư mục nest/), hoặc truyền đường dẫn: ./apply.sh /đường/dẫn/repo"

# Patch có đường dẫn dạng a/before/... → b/after/... nên bỏ 2 cấp (-p2). Bỏ qua khác biệt khoảng trắng/CRLF.
GIT_APPLY=(git apply -p2 --ignore-whitespace --whitespace=nowarn)
FILES="$(grep "^diff --git" "$PATCH" | sed -E "s#^diff --git a/(before|after)/(.*) b/after/.*#\2#")"

if [[ "$MODE" == "revert" ]]; then
  if "${GIT_APPLY[@]}" --reverse --check "$PATCH" 2>/tmp/fix-refund-account.err; then
    "${GIT_APPLY[@]}" --reverse "$PATCH"
    echo "✓ Đã gỡ bản vá."
  else
    cat /tmp/fix-refund-account.err >&2
    die "Không gỡ được (có thể code đã bị sửa tiếp hoặc chưa từng áp dụng)."
  fi
  exit 0
fi

# Đã áp dụng rồi?
if "${GIT_APPLY[@]}" --reverse --check "$PATCH" >/dev/null 2>&1; then
  echo "✓ Bản vá đã được áp dụng trước đó, không cần làm gì thêm."
  exit 0
fi

if ! "${GIT_APPLY[@]}" --check "$PATCH" 2>/tmp/fix-refund-account.err; then
  cat /tmp/fix-refund-account.err >&2
  echo >&2
  die "Có xung đột — chưa sửa file nào. Xem các dòng lỗi ở trên (file + dòng) rồi sửa tay hoặc gửi cho mình."
fi

if [[ "$MODE" == "check" ]]; then
  echo "✓ Không có xung đột. Sẽ thay đổi các file sau:"
  echo "$FILES" | sed 's/^/   /'
  exit 0
fi

"${GIT_APPLY[@]}" "$PATCH"
echo "✓ Đã áp dụng bản vá. Các file đã thay đổi hoặc thêm mới:"
echo "$FILES" | sed 's/^/   /'
cat <<'MSG'

Tiếp theo:
  cd nest && npm test
Gỡ lại nếu cần:  bash apply.sh --revert
MSG
