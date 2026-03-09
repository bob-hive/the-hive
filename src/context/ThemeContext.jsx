/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext(null)

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('hive-theme') || 'light'
    } catch {
      return 'light'
    }
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme === 'neon' ? 'neon' : '')
    try {
      localStorage.setItem('hive-theme', theme)
    } catch {
      // Ignore write failures (private mode, storage restrictions)
    }
  }, [theme])

  const toggle = () => setTheme((t) => (t === 'light' ? 'neon' : 'light'))

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
