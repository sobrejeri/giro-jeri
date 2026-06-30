import { createContext, useContext, useState, useCallback, useEffect } from 'react'

const STORAGE_KEY = 'giro_jeri_favorites'

function loadFavs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch { return new Set() }
}

function saveFavs(set) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...set])) } catch {}
}

const FavoritesContext = createContext(null)

export function FavoritesProvider({ children }) {
  const [favs, setFavs] = useState(loadFavs)

  useEffect(() => { saveFavs(favs) }, [favs])

  const toggleFav = useCallback((id) => {
    setFavs(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  const isFav = useCallback((id) => favs.has(id), [favs])

  return (
    <FavoritesContext.Provider value={{ favs, toggleFav, isFav, count: favs.size }}>
      {children}
    </FavoritesContext.Provider>
  )
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext)
  if (!ctx) throw new Error('useFavorites must be used within FavoritesProvider')
  return ctx
}
