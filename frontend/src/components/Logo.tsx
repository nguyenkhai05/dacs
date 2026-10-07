export function Logo() {
  return (
    <span className="logo">
      <svg className="logo__icon" viewBox="0 0 24 24" aria-hidden="true">
        <rect width="24" height="24" rx="6" fill="currentColor" />
        <circle cx="12" cy="12" r="5.5" fill="none" stroke="#fff" strokeWidth="1.6" />
        <path d="M12 6.5v11M6.5 12h11" stroke="#fff" strokeWidth="1.6" />
      </svg>
      <span className="logo__text">Đặt Sân Nhanh</span>
    </span>
  )
}
