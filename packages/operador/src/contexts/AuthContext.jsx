import { createContext, useContext, useState, useCallback } from 'react'

const AuthContext = createContext(null)

// Prefixo próprio: turista, operador e admin compartilham o mesmo domínio
// (sobrejeri.github.io/<subpath>) e localStorage é por origem, não por path —
// sem prefixo, logar num app sobrescrevia a sessão dos outros.
const STORAGE = {
  token:   'giro_coop_token',
  refresh: 'giro_coop_refresh',
  user:    'giro_coop_user',
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
    // Re-sincroniza o push (se já autorizado) para voltar a receber ao logar de
    // novo, sem tocar em "Ativar". Best-effort; import dinâmico evita ciclo.
    import('../lib/push').then((m) => m.syncPush?.()).catch(() => {})
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

  return (
    <AuthContext.Provider value={{ user, token, refresh, login, logout, updateTokens }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
