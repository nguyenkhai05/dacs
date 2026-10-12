import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../features/auth/useAuth'
import { apiFetch } from '../lib/api'

type Deposit = {
  payment_id: number
  booking_id: number
  booking_status: string
  payment_status: string
  amount: number
  invoice_total: number
  transfer_content: string
  bank: { bank_id: string; bank_name: string; account_number: string; account_name: string }
  qr_url: string
  seconds_remaining: number
  is_expired: boolean
}

const money = (value: number) => `${new Intl.NumberFormat('vi-VN').format(value)} đ`

export default function PaymentPage() {
  const { bookingId = '' } = useParams()
  const { token } = useAuth()
  const [deposit, setDeposit] = useState<Deposit | null>(null)
  const [loading, setLoading] = useState(true)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState('')

  async function loadStatus(create = false) {
    if (!/^\d+$/.test(bookingId)) {
      setError('Mã đơn đặt sân không hợp lệ.')
      setLoading(false)
      return
    }
    try {
      setError('')
      const result = create
        ? await apiFetch<Deposit>('/payments/deposit', { method: 'POST', token, body: { booking_id: Number(bookingId) } })
        : await apiFetch<Deposit>(`/payments/deposit/${encodeURIComponent(bookingId)}`, { token })
      setDeposit(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thể tải thông tin thanh toán.')
    } finally {
      setLoading(false)
      setChecking(false)
    }
  }

  useEffect(() => {
    void loadStatus(true)
    // Khởi tạo khoản cọc một lần khi mở trang.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId, token])

  return (
    <main style={{ maxWidth: 760, margin: '40px auto', padding: '24px', color: '#18352b' }}>
      <Link to="/" style={{ color: '#168052', textDecoration: 'none' }}>← Về trang chủ</Link>
      <section style={{ marginTop: 20, padding: 28, border: '1px solid #dce8e1', borderRadius: 18, background: '#fff' }}>
        <p style={{ color: '#168052', fontWeight: 700, letterSpacing: 1, fontSize: 12 }}>ĐẶT SÂN NHANH · THANH TOÁN</p>
        <h1 style={{ margin: '8px 0' }}>Thanh toán tiền cọc</h1>
        <p style={{ color: '#62746b' }}>Đơn đặt sân #{bookingId}. Chuyển đúng số tiền và nội dung bên dưới để hệ thống đối soát.</p>
        {loading && <p>Đang tải thông tin thanh toán…</p>}
        {error && <p role="alert" style={{ padding: 12, background: '#fff0ef', color: '#a52a22', borderRadius: 8 }}>{error}</p>}
        {deposit && <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 24, marginTop: 24 }}>
            <div style={{ textAlign: 'center', padding: 16, background: '#f5f9f6', borderRadius: 12 }}>
              <img src={deposit.qr_url} alt="Mã QR thanh toán tiền cọc" style={{ width: '100%', maxWidth: 260, imageRendering: 'auto' }} />
              <strong style={{ display: 'block', fontSize: 26, color: '#168052', marginTop: 8 }}>{money(deposit.amount)}</strong>
              <span style={{ color: '#62746b' }}>Tiền cọc cần chuyển</span>
            </div>
            <div>
              <h2 style={{ fontSize: 18 }}>Thông tin chuyển khoản</h2>
              <p><strong>Ngân hàng:</strong> {deposit.bank.bank_name}</p>
              <p><strong>Số tài khoản:</strong> {deposit.bank.account_number}</p>
              <p><strong>Chủ tài khoản:</strong> {deposit.bank.account_name}</p>
              <p><strong>Nội dung chuyển khoản:</strong><br /><code>{deposit.transfer_content}</code></p>
              <p><strong>Trạng thái:</strong> {deposit.payment_status === 'Successful' ? 'Đã nhận tiền cọc' : deposit.is_expired ? 'Đã hết thời gian giữ chỗ' : 'Đang chờ thanh toán'}</p>
              <button type="button" disabled={checking} onClick={() => { setChecking(true); void loadStatus(false) }} style={{ border: 0, borderRadius: 9, padding: '12px 16px', background: '#168052', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                {checking ? 'Đang kiểm tra…' : 'Tôi đã chuyển khoản · Kiểm tra trạng thái'}
              </button>
            </div>
          </div>
        </>}
        <p style={{ color: '#62746b', fontSize: 13, marginTop: 24 }}>Lưu ý: trạng thái chỉ được cập nhật sau khi hệ thống nhận được xác nhận giao dịch từ ngân hàng/cổng thanh toán.</p>
      </section>
    </main>
  )
}
