import { apiFetch } from '../../lib/api'

// Kiểu dữ liệu khớp với backend (nest/src/reviews)

export interface RatingSummary {
  average: number
  review_count: number
  distribution: Record<'1' | '2' | '3' | '4' | '5', number>
}

export interface ReviewItem {
  review_id: number
  rating: number
  comment: string | null
  /** Tên đã che bớt, vd "N. V. Khách" */
  reviewer_name: string
  created_at: string
}

export interface PitchReviewsResponse {
  pitch_id: number
  pitch_name: string
  summary: RatingSummary
  page: number
  limit: number
  total: number
  total_pages: number
  items: ReviewItem[]
}

export interface ReviewableBooking {
  booking_id: number
  booking_code: string
  pitch_id: number
  pitch_name: string
  booking_date: string
  start_time: string
  end_time: string
}

interface BookingReviewState {
  can_review: boolean
}

interface MyBookingsResponse {
  bookings: ReviewableBooking[]
}

export interface CreateReviewPayload {
  booking_id: number
  rating: number
  comment?: string
}

/** Công khai: tổng quan + một trang đánh giá của sân. */
export function fetchPitchReviews(
  pitchId: number,
  page: number,
  limit: number,
  signal?: AbortSignal,
): Promise<PitchReviewsResponse> {
  return apiFetch<PitchReviewsResponse>(
    `/reviews?pitch_id=${pitchId}&page=${page}&limit=${limit}`,
    { signal },
  )
}

/**
 * Các booking ĐÃ HOÀN THÀNH của khách tại sân này mà CHƯA được đánh giá.
 * Backend chưa có API "liệt kê booking có thể đánh giá" nên ghép từ hai API sẵn có:
 * danh sách booking của tôi (tab hoàn thành) + trạng thái đánh giá từng booking.
 * Chỉ xét tối đa 50 booking hoàn thành gần nhất (giới hạn của API danh sách).
 */
export async function fetchReviewableBookings(
  pitchId: number,
  token: string,
  signal?: AbortSignal,
): Promise<ReviewableBooking[]> {
  const mine = await apiFetch<MyBookingsResponse>('/bookings/my?tab=completed&limit=50', {
    token,
    signal,
  })

  const ofThisPitch = mine.bookings.filter((booking) => booking.pitch_id === pitchId)

  const states = await Promise.allSettled(
    ofThisPitch.map((booking) =>
      apiFetch<BookingReviewState>(`/reviews/booking/${booking.booking_id}`, { token, signal }),
    ),
  )

  return ofThisPitch.filter((_, index) => {
    const state = states[index]
    return state.status === 'fulfilled' && state.value.can_review
  })
}

export function submitReview(token: string, payload: CreateReviewPayload) {
  return apiFetch<{ message: string }>('/reviews', { method: 'POST', body: payload, token })
}
