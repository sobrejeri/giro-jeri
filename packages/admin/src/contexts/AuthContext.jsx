import { createContext, useContext, useState, useCallback } from 'react'

const AuthContext = createContext(null)

const STORAGE = {
  token:   'giro_admin_token',
  refresh: 'giro_admin_refresh',
  user:    'giro_admin_user',
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE.user)) } catch { return null }
  })
  const [token, setToken]     = useState(() => localStorage.getItem(STORAGE.token)   || null)
  const [refresh, setRefresh] = useState(() => localStorage.getItem(STORAGE.refresh) || null)

  const login = useCallback((userData, accessToken, refreshToken) => {
    setUser(userData)
    setToken(accessToken)
    setRefresh(refreshToken)
    localStorage.setItem(STORAGE.user,    JSON.stringify(userData))
    localStorage.setItem(STORAGE.token,   accessToken)
    localStorage.setItem(STORAGE.refresh, refreshToken)
  }, [])

  const updateTokens = useCallback((accessToken, refreshToken, userData) => {
    setToken(accessToken)
    setRefresh(refreshToken)
    localStorage.setItem(STORAGE.token,   accessToken)
    localStorage.setItem(STORAGE.refresh, refreshToken)
    if (userData) {
      setUser(userData)
      localStorage.setItem(STORAGE.user, JSON.stringify(userData))
    }
  }, [])

  const logout = useCallback(() => {
    setUser(null)
    setToken(null)
    setRefresh(null)
    Object.values(STORAGE).forEach((k) => localStorage.removeItem(k))
  }, [])

  return (
    <AuthContext.Provider value={{ user, token, refresh, login, logout, updateTokens }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
