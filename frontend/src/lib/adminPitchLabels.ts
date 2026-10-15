import type { DayType, PitchStatus } from '../features/admin/adminPitchesApi'

export const PITCH_STATUS_LABEL: Record<PitchStatus, string> = {
  Available: 'Hoạt động',
  Maintenance: 'Bảo trì',
  Inactive: 'Ngừng hoạt động',
}

export const PITCH_STATUSES: PitchStatus[] = ['Available', 'Maintenance', 'Inactive']

export const DAY_TYPE_LABEL: Record<DayType, string> = {
  All: 'Mọi ngày',
  Weekday: 'Thứ 2–6',
  Weekend: 'Thứ 7–CN',
  Holiday: 'Ngày lễ',
}

export const DAY_TYPES: DayType[] = ['All', 'Weekday', 'Weekend', 'Holiday']
