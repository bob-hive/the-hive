import { useCallback, useEffect, useRef, useState } from 'react'

export function usePolling(fetcher, { defaultIntervalMs = 30_000 } = {}) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [intervalMs, setIntervalMs] = useState(defaultIntervalMs)

  const hasLoadedRef = useRef(false)
  const inFlightRef = useRef(false)

  const refresh = useCallback(async () => {
    if (inFlightRef.current) return
    inFlightRef.current = true

    if (!hasLoadedRef.current) {
      setIsLoading(true)
    } else {
      setIsRefreshing(true)
    }

    setError(null)

    try {
      const result = await fetcher()
      setData(result)
      setLastUpdated(new Date())
      hasLoadedRef.current = true
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to refresh data'))
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
      inFlightRef.current = false
    }
  }, [fetcher])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    if (!intervalMs || intervalMs < 1) return undefined

    const timer = setInterval(() => {
      refresh()
    }, intervalMs)

    return () => clearInterval(timer)
  }, [intervalMs, refresh])

  return {
    data,
    error,
    isLoading,
    isRefreshing,
    lastUpdated,
    intervalMs,
    setIntervalMs,
    refresh,
  }
}
