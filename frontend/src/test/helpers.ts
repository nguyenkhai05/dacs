const toBase64Url = (value: object) =>
  btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** Tạo một JWT giả (chỉ để test) có hạn dùng sau `secondsFromNow` giây. */
export function fakeJwt(secondsFromNow = 3600): string {
  const exp = Math.floor(Date.now() / 1000) + secondsFromNow
  return `${toBase64Url({ alg: 'HS256', typ: 'JWT' })}.${toBase64Url({ sub: 1, exp })}.signature`
}

export const sampleUser = {
  user_id: 1,
  full_name: 'Nguyễn Minh Anh',
  email: 'anh@example.com',
  roles: ['Customer'],
}
