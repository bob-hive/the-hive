import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * usePolling — polls a fetcher on an interval, with:
 *   - initial load
 *   - configurable interval
 *   - graceful offline fallback (last cached data + `isOffline` flag)
 *   - "last updated X seconds ago" counter
 *
 * @param {() => Promise<any>} fetcher
 * @param {{ defaultIntervalMs?: number }} [opts]
 */
export function usePolling(fetcher, { defaultIntervalMs = 10_000 } = {}) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isOffline, setIsOffline] = useState(false)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [intervalMs, setIntervalMs] = useState(defaultIntervalMs)
  // Seconds-since-last-update counter (ticks every second)
  const [secondsSince, setSecondsSince] = useState(0)

  const hasLoadedRef = useRef(false)
  const inFlightRef = useRef(false)
  const lastUpdatedRef = useRef(null)

  // Tick seconds counter
  useEffect(() => {
    const ticker = setInterval(() => {
      if (!lastUpdatedRef.current) return
      const diff = Math.floor((Date.now() - lastUpdatedRef.current.getTime()) / 1000)
      setSecondsSince(diff)
    }, 1000)
    return () => clearInterval(ticker)
  }, [])

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
      const now = new Date()
      setLastUpdated(now)
      lastUpdatedRef.current = now
      setSecondsSince(0)
      setIsOffline(false)
      hasLoadedRef.current = true
    } catch (err) {
      const e = err instanceof Error ? err : new Error('Failed to refresh data')
      setError(e)
      // If we already have data, go "offline" instead of clearing it
      if (hasLoadedRef.current) {
        setIsOffline(true)
      }
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
    const timer = setInterval(() => refresh(), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs, refresh])

  return {
    data,
    error,
    isLoading,
    isRefreshing,
    isOffline,
    lastUpdated,
    secondsSince,
    intervalMs,
    setIntervalMs,
    refresh,
  }
}
