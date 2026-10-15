import { useEffect, useState } from 'react'
import { isAbortError } from '../../lib/api'

interface State<T> {
  data: T | null
  error: string
  loading: boolean
  loadedAt: Date | null
}

/**
 * Tải dữ liệu khi `deps` đổi. Request cũ bị hủy khi đổi tham số / rời trang,
 * dữ liệu cũ vẫn hiện trong lúc tải để giao diện không nhấp nháy.
 */
export function useApiData<T>(
  load: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
  enabled = true,
) {
  const [state, setState] = useState<State<T>>({ data: null, error: '', loading: enabled, loadedAt: null })
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!enabled) return
    const controller = new AbortController()
    setState((current) => ({ ...current, loading: true, error: '' }))

    load(controller.signal)
      .then((data) => setState({ data, error: '', loading: false, loadedAt: new Date() }))
      .catch((error: unknown) => {
        if (isAbortError(error)) return
        setState((current) => ({
          ...current,
          loading: false,
          error: error instanceof Error ? error.message : 'Không tải được dữ liệu.',
        }))
      })

    return () => controller.abort()
    // `load` luôn được tạo lại mỗi lần render; chỉ chạy lại khi deps/enabled/reload đổi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, version, ...deps])

  return { ...state, reload: () => setVersion((value) => value + 1) }
}
