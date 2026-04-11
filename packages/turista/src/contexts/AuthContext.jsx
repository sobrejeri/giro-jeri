import { createContext, useContext, useState, useCallback } from 'react'

const AuthContext = createContext(null)

const STORAGE = {
  token:   'giro_token',
  refresh: 'giro_refresh',
  user:    'giro_user',
}

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE.user)) } catch { return null }
  })
  const [token,   setToken]   = useState(() => localStorage.getItem(STORAGE.token)   || null)
  const [refresh, setRefresh] = useState(() => localStorage.getItem(STORAGE.refresh) || null)

  const login = useCallback((userData, accessToken, refreshToken) => {
    setUser(userData)
    setToken(accessToken)
    setRefresh(refreshToken)
    localStorage.setItem(STORAGE.user,    JSON.stringify(userData))
    localStorage.setItem(STORAGE.token,   accessToken)
    localStorage.setItem(STORAGE.refresh, refreshToken)
  }, [])

  const logout = useCallback(() => {
    setUser(null)
    setToken(null)
    setRefresh(null)
    Object.values(STORAGE).forEach((k) => localStorage.removeItem(k))
  }, [])

  return (
    <AuthContext.Provider value={{ user, token, refresh, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
