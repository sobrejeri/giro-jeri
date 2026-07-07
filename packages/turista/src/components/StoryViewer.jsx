import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Camera, Volume2, VolumeX, MoreVertical, Trash2 } from 'lucide-react'

// Selo verificado estilo Instagram (azul + check branco)
function VerifiedBadge({ size = 15 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className="shrink-0" aria-label="Verificado" role="img">
      <path fill="#3897F0" d="M12 1l2.35 2.06 3.12-.36 1.19 2.9 2.9 1.19-.36 3.12L23 12l-2.06 2.35.36 3.12-2.9 1.19-1.19 2.9-3.12-.36L12 23l-2.35-2.06-3.12.36-1.19-2.9-2.9-1.19.36-3.12L1 12l2.06-2.35-.36-3.12 2.9-1.19 1.19-2.9 3.12.36L12 1z" />
      <path fill="#fff" d="M10.4 15.3l-2.95-2.95 1.32-1.32 1.63 1.63 3.83-3.83 1.32 1.32z" />
    </svg>
  )
}

/**
 * StoryViewer — visualizador de destaques em tela cheia, estilo Instagram.
 * Navega entre grupos (destaques) e itens: toca para pular, avança para o
 * próximo destaque ao terminar e arrasta pro lado para trocar de destaque.
 *
 * Props:
 *   highlights — array de destaques [{ id, title, cover_image_url, stories:[...] }]
 *   startGroup — índice do destaque inicial
 *   onClose    — fecha o visualizador (ou ao passar do último item)
 *   isAdmin / onDelete — menu de excluir (somente admin)
 */
export default function StoryViewer({ highlights = [], startGroup = 0, onClose, isAdmin = false, onDelete }) {
  const { t } = useTranslation()
  const [groupIndex, setGroupIndex] = useState(startGroup)
  const [storyIndex, setStoryIndex] = useState(0)
  const [progress, setProgress] = useState(0)
  const [paused, setPaused] = useState(false)
  const [muted, setMuted] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const intervalRef = useRef(null)
  const videoRef = useRef(null)
  const touchStartRef = useRef(null)
  const swipedRef = useRef(false)

  const group        = highlights[groupIndex]
  const groupStories = group?.stories || []
  const story        = groupStories[storyIndex]
  const isVideo      = story?.media_type === 'video'
  const duration     = story?.duration_sec || 20

  // ── Navegação entre grupos (destaques) ─────────────────────────────────────
  const nextGroup = useCallback(() => {
    if (groupIndex + 1 >= highlights.length) { onClose(); return }
    setGroupIndex(groupIndex + 1); setStoryIndex(0); setProgress(0)
  }, [groupIndex, highlights.length, onClose])

  const prevGroup = useCallback(() => {
    if (groupIndex <= 0) { setStoryIndex(0); setProgress(0); return }
    setGroupIndex(groupIndex - 1); setStoryIndex(0); setProgress(0)
  }, [groupIndex])

  // ── Navegação entre itens ──────────────────────────────────────────────────
  const goNext = useCallback(() => {
    if (storyIndex + 1 < groupStories.length) { setStoryIndex(storyIndex + 1); setProgress(0) }
    else nextGroup()
  }, [storyIndex, groupStories.length, nextGroup])

  const goPrev = useCallback(() => {
    if (storyIndex > 0) { setStoryIndex(storyIndex - 1); setProgress(0) }
    else if (groupIndex > 0) prevGroup()
    else setProgress(0)
  }, [storyIndex, groupIndex, prevGroup])

  // ── Reset + (re)play do vídeo ao mudar de item/grupo ───────────────────────
  useEffect(() => {
    setProgress(0)
    setPaused(false)
    const v = videoRef.current
    if (v) {
      v.currentTime = 0
      v.muted = muted
      v.play().catch(() => {
        if (!v.muted) { v.muted = true; setMuted(true) }
        v.play().catch(() => {})
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupIndex, storyIndex])

  // ── Timer de progresso (imagens) ───────────────────────────────────────────
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
  }, [groupIndex, storyIndex, isVideo, paused, duration])

  // ── Auto-avança quando o progresso chega a 100 (imagens) ───────────────────
  useEffect(() => {
    if (!isVideo && progress >= 100) goNext()
  }, [progress, isVideo, goNext])

  // ── Zonas de toque ─────────────────────────────────────────────────────────
  function handleTap(e) {
    if (swipedRef.current) { swipedRef.current = false; return }
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    if (x < rect.width * 0.3) goPrev()
    else goNext()
  }

  // ── Toque: segurar pausa, arrastar lateral troca destaque, vertical fecha ──
  function handleTouchStart(e) {
    const t0 = e.touches[0]
    touchStartRef.current = { x: t0.clientX, y: t0.clientY }
    swipedRef.current = false
    setPaused(true)
    if (videoRef.current) videoRef.current.pause()
  }
  function handleTouchEnd(e) {
    setPaused(false)
    const start = touchStartRef.current
    touchStartRef.current = null
    if (start) {
      const tt = e.changedTouches[0]
      const dx = tt.clientX - start.x
      const dy = tt.clientY - start.y
      const adx = Math.abs(dx), ady = Math.abs(dy)
      // Vertical → fecha
      if (ady > 70 && ady > adx) { swipedRef.current = true; onClose(); return }
      // Horizontal → troca de destaque (Instagram)
      if (adx > 55 && adx > ady) {
        swipedRef.current = true
        if (dx < 0) nextGroup(); else prevGroup()
        return
      }
    }
    if (videoRef.current) videoRef.current.play().catch(() => {})
  }

  // ── Mute (vídeo) ───────────────────────────────────────────────────────────
  function toggleMute(e) {
    e.stopPropagation()
    const next = !muted
    setMuted(next)
    const v = videoRef.current
    if (v) { v.muted = next; if (v.paused) v.play().catch(() => {}) }
  }

  // ── Menu admin (excluir) ───────────────────────────────────────────────────
  function openMenu(e) { e.stopPropagation(); setMenuOpen(true); setPaused(true); videoRef.current?.pause() }
  function closeMenu() { setMenuOpen(false); setPaused(false); videoRef.current?.play().catch(() => {}) }
  function handleDelete(e) {
    e.stopPropagation()
    if (!story || !confirm('Excluir esta foto/vídeo?')) return
    setMenuOpen(false)
    onDelete?.(story.id)
  }

  // ── Teclado ────────────────────────────────────────────────────────────────
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

  const headerTitle  = group?.title || story.display_name
  const headerAvatar = group?.cover_image_url || story.avatar_url || (story.media_type !== 'video' ? story.media_url : null)

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col select-none">
      {/* ── Barras de progresso (itens do destaque atual) ────────────────── */}
      <div className="absolute top-0 inset-x-0 z-10 flex gap-1 px-2 pt-2">
        {groupStories.map((_, i) => (
          <div key={i} className="flex-1 h-[3px] rounded-full bg-white/30 overflow-hidden">
            <div
              className="h-full bg-white rounded-full"
              style={{
                width: i < storyIndex ? '100%' : i === storyIndex ? `${progress}%` : '0%',
                transition: i === storyIndex && !paused ? 'none' : undefined,
              }}
            />
          </div>
        ))}
      </div>

      {/* ── Barra superior: avatar + nome + selo + fechar ────────────────── */}
      <div className="absolute top-6 inset-x-0 z-10 flex items-center gap-3 px-4 pt-1">
        <div className="w-10 h-10 rounded-full bg-white/20 overflow-hidden flex items-center justify-center shrink-0 border-2 border-white/50">
          {headerAvatar ? (
            <img src={headerAvatar} alt={headerTitle || ''} className="w-full h-full object-cover" />
          ) : (
            <Camera size={18} className="text-white/70" />
          )}
        </div>

        <div className="flex-1 min-w-0 flex items-center gap-1">
          <p className="text-white text-sm font-semibold drop-shadow truncate">{headerTitle}</p>
          <VerifiedBadge size={15} />
        </div>

        {isVideo && (
          <button onClick={toggleMute} className="p-1.5 text-white active:scale-90 transition-transform" aria-label={muted ? 'Ativar som' : 'Silenciar'}>
            {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>
        )}

        {isAdmin && onDelete && (
          <button onClick={openMenu} className="p-1.5 text-white active:scale-90 transition-transform" aria-label="Mais opções">
            <MoreVertical size={22} />
          </button>
        )}

        <button onClick={(e) => { e.stopPropagation(); onClose() }} className="p-1.5 text-white active:scale-90 transition-transform" aria-label={t('common.close')}>
          <X size={22} />
        </button>
      </div>

      {/* ── Menu admin ───────────────────────────────────────────────────── */}
      {menuOpen && (
        <>
          <div className="absolute inset-0 z-[105]" onClick={closeMenu} />
          <div className="absolute top-16 right-3 z-[110] bg-white rounded-xl shadow-xl overflow-hidden min-w-[190px]">
            <button onClick={handleDelete} className="w-full flex items-center gap-2.5 px-4 py-3.5 text-sm font-medium text-red-600 active:bg-gray-100">
              <Trash2 size={16} /> Excluir {isVideo ? 'vídeo' : 'foto'}
            </button>
          </div>
        </>
      )}

      {/* ── Mídia (centralizada, com fundo desfocado) ────────────────────── */}
      <div
        className="flex-1 w-full relative flex items-center justify-center overflow-hidden cursor-pointer touch-none"
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
            className="relative z-10 w-full h-full object-contain"
            onEnded={goNext}
            onTimeUpdate={() => {
              const v = videoRef.current
              if (v && v.duration) setProgress((v.currentTime / v.duration) * 100)
            }}
          />
        ) : story.media_url ? (
          <>
            {/* Fundo desfocado preenche as bordas sem cortar flyers verticais */}
            <img
              src={story.media_url}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 opacity-50"
              draggable={false}
            />
            <img
              key={story.id}
              src={story.media_url}
              alt={story.display_name}
              className="relative z-10 w-full h-full object-contain"
              draggable={false}
            />
          </>
        ) : (
          <div className="w-full h-full bg-gray-900 flex items-center justify-center">
            <Camera size={48} className="text-white/20" />
          </div>
        )}

        {/* Zonas de toque invisíveis (prev/next) */}
        <div className="absolute inset-y-0 left-0 w-[30%] z-20" />
        <div className="absolute inset-y-0 right-0 w-[70%] z-20" />
      </div>
    </div>
  )
}
