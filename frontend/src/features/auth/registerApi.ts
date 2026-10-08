import { apiFetch } from '../../lib/api'

export interface RegisterValues {
  fullName: string
  phoneNumber: string
  email: string
  password: string
  confirmPassword: string
  acceptedTerms: boolean
}

export interface RegisterResponse {
  message: string
  user: {
    user_id: number
    full_name: string
    phone_number: string
    email: string
    role: string
  }
}

/** POST /auth/register – tạo tài khoản khách hàng mới. */
export function register(values: RegisterValues) {
  return apiFetch<RegisterResponse>('/auth/register', {
    method: 'POST',
    body: {
      fullName: values.fullName.trim(),
      phoneNumber: values.phoneNumber.trim(),
      email: values.email.trim(),
      password: values.password,
      confirmPassword: values.confirmPassword,
      acceptedTerms: values.acceptedTerms,
    },
  })
}
