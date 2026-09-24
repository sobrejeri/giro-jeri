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
    // Re-sincroniza o push (se já autorizado) para voltar a receber ao logar de
    // novo, sem tocar em "Ativar". Best-effort; import dinâmico evita ciclo.
    import('../lib/push').then((m) => m.syncPush?.()).catch(() => {})
  }, [])

  const logout = useCallback(async () => {
    // Remove a inscrição de push DESTE aparelho ANTES de limpar o token (a
    // chamada precisa estar autenticada) — senão o servidor segue mandando push
    // com o app deslogado. Import dinâmico evita ciclo; timeout evita travar.
    try {
      const m = await import('../lib/push')
      await Promise.race([m.disablePush(), new Promise((r) => setTimeout(r, 2500))])
    } catch { /* ignore */ }
    setUser(null)
    setToken(null)
    setRefresh(null)
    Object.values(STORAGE).forEach((k) => localStorage.removeItem(k))
  }, [])

  const updateUser = useCallback((partial) => {
    setUser((prev) => {
      const next = { ...prev, ...partial }
      localStorage.setItem(STORAGE.user, JSON.stringify(next))
      return next
    })
  }, [])

  return (
    <AuthContext.Provider value={{ user, token, refresh, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
