import { createContext, useContext, useState } from 'react'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('giro_admin_user')) } catch { return null }
  })
  const [token, setToken] = useState(() => localStorage.getItem('giro_admin_token') || null)

  function login(userData, authToken) {
    setUser(userData)
    setToken(authToken)
    localStorage.setItem('giro_admin_user', JSON.stringify(userData))
    localStorage.setItem('giro_admin_token', authToken)
  }

  function logout() {
    setUser(null)
    setToken(null)
    localStorage.removeItem('giro_admin_user')
    localStorage.removeItem('giro_admin_token')
  }

  return (
    <AuthContext.Provider value={{ user, token, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
