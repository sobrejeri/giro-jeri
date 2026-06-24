import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Camera, Volume2, VolumeX, MoreVertical, Trash2 } from 'lucide-react'

/**
 * StoryViewer — full-screen Instagram-style story viewer.
 *
 * Props:
 *   stories     — array of story objects
 *   title       — highlight title shown at the top (Instagram-style)
 *   cover       — highlight cover image shown in the top circle
 *   startIndex  — index of the first story to display
 *   onClose     — called when all stories are done or the X is tapped
 *   isAdmin     — quando true, mostra o menu (3 pontos) com opção de excluir
 *   onDelete    — (storyId) => void   exclui o item atual (somente admin)
 */
export default function StoryViewer({ stories = [], title, cover, startIndex = 0, onClose, isAdmin = false, onDelete }) {
  const { t } = useTranslation()
  const [currentIndex, setCurrentIndex] = useState(startIndex)
  const [progress, setProgress] = useState(0)
  const [paused, setPaused] = useState(false)
  const [muted, setMuted] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const intervalRef = useRef(null)
  const videoRef = useRef(null)
  const touchStartRef = useRef(null)
  const swipedRef = useRef(false)

  const story = stories[currentIndex]
  const isVideo = story?.media_type === 'video'
  const duration = story?.duration_sec || 20

  // ── Navigation helpers ─────────────────────────────────────────────────────
  const goNext = useCallback(() => {
    setCurrentIndex((idx) => {
      const next = idx + 1
      if (next >= stories.length) {
        onClose()
        return idx
      }
      return next
    })
  }, [stories.length, onClose])

  const goPrev = useCallback(() => {
    setCurrentIndex((idx) => Math.max(0, idx - 1))
  }, [])

  // ── Reset progress + (re)play video whenever the story index changes ───────
  useEffect(() => {
    setProgress(0)
    setPaused(false)
    const v = videoRef.current
    if (v) {
      v.currentTime = 0
      v.muted = muted
      v.play().catch(() => {
        // Navegador bloqueou autoplay com som → toca mudo (usuário reativa no ícone)
        if (!v.muted) { v.muted = true; setMuted(true) }
        v.play().catch(() => {})
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex])

  // ── Progress timer (images only) ───────────────────────────────────────────
  useEffect(() => {
    if (isVideo || paused) return

    clearInterval(intervalRef.current)
    intervalRef.current = setInterval(() => {
      setProgress((p) => {
        const next = p + 100 / (duration * 10)
        return next >= 100 ? 100 : next
      })
    }, 100)

    return () => clearInterval(intervalRef.current)
  }, [currentIndex, isVideo, paused, duration])

  // ── Auto-advance when progress hits 100 (images) ──────────────────────────
  useEffect(() => {
    if (!isVideo && progress >= 100) {
      goNext()
    }
  }, [progress, isVideo, goNext])

  // ── Tap zones ──────────────────────────────────────────────────────────────
  function handleTap(e) {
    // Ignora o clique sintético que segue um arrastar (swipe) já tratado
    if (swipedRef.current) { swipedRef.current = false; return }
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    if (x < rect.width * 0.3) {
      goPrev()
    } else {
      goNext()
    }
  }

  // ── Touch: long-press pausa, arrastar vertical fecha ───────────────────────
  function handleTouchStart(e) {
    const t = e.touches[0]
    touchStartRef.current = { x: t.clientX, y: t.clientY }
    swipedRef.current = false
    setPaused(true)
    if (videoRef.current) videoRef.current.pause()
  }
  function handleTouchEnd(e) {
    setPaused(false)
    const start = touchStartRef.current
    touchStartRef.current = null
    if (start) {
      const t = e.changedTouches[0]
      const dx = t.clientX - start.x
      const dy = t.clientY - start.y
      // Arrastar pra cima ou pra baixo fecha os destaques
      if (Math.abs(dy) > 70 && Math.abs(dy) > Math.abs(dx)) {
        swipedRef.current = true
        onClose()
        return
      }
    }
    if (videoRef.current) videoRef.current.play().catch(() => {})
  }

  // ── Mute toggle (vídeo) ────────────────────────────────────────────────────
  function toggleMute(e) {
    e.stopPropagation()
    const next = !muted
    setMuted(next)
    const v = videoRef.current
    if (v) {
      v.muted = next
      if (v.paused) v.play().catch(() => {})
    }
  }

  // ── Menu admin (3 pontos): excluir item ────────────────────────────────────
  function openMenu(e) {
    e.stopPropagation()
    setMenuOpen(true)
    setPaused(true)
    videoRef.current?.pause()
  }
  function closeMenu() {
    setMenuOpen(false)
    setPaused(false)
    videoRef.current?.play().catch(() => {})
  }
  function handleDelete(e) {
    e.stopPropagation()
    if (!story || !confirm('Excluir esta foto/vídeo?')) return
    setMenuOpen(false)
    onDelete?.(story.id)
  }

  // ── Keyboard support ───────────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e) {
      if (e.key === 'ArrowRight') goNext()
      if (e.key === 'ArrowLeft') goPrev()
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goNext, goPrev, onClose])

  if (!story) return null

  // Topo estilo Destaques do Instagram: capa + título do destaque.
  // Cai para o avatar/legenda do item se o destaque não tiver capa/título.
  const headerTitle  = title || story.display_name
  const headerAvatar = cover || story.avatar_url || (story.media_type !== 'video' ? story.media_url : null)

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col select-none">
      {/* ── Progress bars ────────────────────────────────────────────────── */}
      <div className="absolute top-0 inset-x-0 z-10 flex gap-1 px-2 pt-2">
        {stories.map((_, i) => (
          <div key={i} className="flex-1 h-[3px] rounded-full bg-white/30 overflow-hidden">
            <div
              className="h-full bg-white rounded-full"
              style={{
                width:
                  i < currentIndex
                    ? '100%'
                    : i === currentIndex
                    ? `${progress}%`
                    : '0%',
                transition: i === currentIndex && !paused ? 'none' : undefined,
              }}
            />
          </div>
        ))}
      </div>

      {/* ── Top bar: avatar + name + close ───────────────────────────────── */}
      <div className="absolute top-6 inset-x-0 z-10 flex items-center gap-3 px-4 pt-1">
        {/* Avatar (capa do destaque) */}
        <div className="w-10 h-10 rounded-full bg-white/20 overflow-hidden flex items-center justify-center shrink-0 border-2 border-white/50">
          {headerAvatar ? (
            <img src={headerAvatar} alt={headerTitle || ''} className="w-full h-full object-cover" />
          ) : (
            <Camera size={18} className="text-white/70" />
          )}
        </div>

        <p className="flex-1 text-white text-sm font-semibold drop-shadow truncate">
          {headerTitle}
        </p>

        {/* Som (apenas vídeo) */}
        {isVideo && (
          <button
            onClick={toggleMute}
            className="p-1.5 text-white active:scale-90 transition-transform"
            aria-label={muted ? 'Ativar som' : 'Silenciar'}
          >
            {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>
        )}

        {/* Menu (3 pontos) — somente admin */}
        {isAdmin && onDelete && (
          <button
            onClick={openMenu}
            className="p-1.5 text-white active:scale-90 transition-transform"
            aria-label="Mais opções"
          >
            <MoreVertical size={22} />
          </button>
        )}

        {/* Close */}
        <button
          onClick={(e) => { e.stopPropagation(); onClose() }}
          className="p-1.5 text-white active:scale-90 transition-transform"
          aria-label={t('common.close')}
        >
          <X size={22} />
        </button>
      </div>

      {/* ── Menu admin: backdrop + dropdown ──────────────────────────────── */}
      {menuOpen && (
        <>
          <div className="absolute inset-0 z-[105]" onClick={closeMenu} />
          <div className="absolute top-16 right-3 z-[110] bg-white rounded-xl shadow-xl overflow-hidden min-w-[190px]">
            <button
              onClick={handleDelete}
              className="w-full flex items-center gap-2.5 px-4 py-3.5 text-sm font-medium text-red-600 active:bg-gray-100"
            >
              <Trash2 size={16} /> Excluir {isVideo ? 'vídeo' : 'foto'}
            </button>
          </div>
        </>
      )}

      {/* ── Media area (tap zones handled here) ──────────────────────────── */}
      <div
        className="flex-1 w-full relative cursor-pointer touch-none"
        onClick={handleTap}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {isVideo ? (
          <video
            ref={videoRef}
            key={story.id}
            src={story.media_url}
            playsInline
            className="w-full h-full object-cover"
            onEnded={goNext}
            onTimeUpdate={() => {
              const v = videoRef.current
              if (v && v.duration) setProgress((v.currentTime / v.duration) * 100)
            }}
          />
        ) : story.media_url ? (
          <img
            key={story.id}
            src={story.media_url}
            alt={story.display_name}
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full bg-gray-900 flex items-center justify-center">
            <Camera size={48} className="text-white/20" />
          </div>
        )}

        {/* Invisible left / right tap targets for clarity on desktop */}
        <div className="absolute inset-y-0 left-0 w-[30%]" />
        <div className="absolute inset-y-0 right-0 w-[70%]" />
      </div>
    </div>
  )
}
