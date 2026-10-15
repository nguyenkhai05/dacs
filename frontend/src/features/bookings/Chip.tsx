import type { ReactNode } from 'react'
import type { Tone } from './bookingDetailView'
import './BookingDetail.css'

export function Chip({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`bd-chip bd-chip--${tone}`}>{children}</span>
}
