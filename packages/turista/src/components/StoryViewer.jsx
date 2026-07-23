import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { X, Camera, Volume2, VolumeX, MoreVertical, Trash2, ImageOff } from 'lucide-react'
import VerifiedBadge from './VerifiedBadge'

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
  const [mediaError, setMediaError] = useState(false)
  const intervalRef = useRef(null)
  const videoRef = useRef(null)
  const touchStartRef = useRef(null)
  const swipedRef = useRef(false)

  const group        = highlights[groupIndex]
  const groupStories = group?.stories || []
  const story        = groupStories[storyIndex]
  const isVideo      = story?.media_type === 'video'
  const duration     = story?.duration_sec || 20
  // Fundo desfocado: imagens usam a própria mídia; vídeos usam capa/avatar do destaque
  const backdropSrc  = isVideo
    ? (group?.cover_image_url || story?.avatar_url || null)
    : story?.media_url

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
    setMediaError(false)
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

  // Portal para o body: escapa de qualquer ancestral com transform/will-change
  // (ex.: o wrapper do PullToRefresh), que "prende" o position:fixed e impede
  // o viewer de cobrir a tela toda e centralizar a mídia corretamente.
  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black flex flex-col select-none">
      {/* Gradiente superior para o cabeçalho ficar legível sobre mídia clara */}
      <div className="absolute top-0 inset-x-0 h-28 z-20 bg-gradient-to-b from-black/60 to-transparent pointer-events-none" />

      {/* ── Barras de progresso (itens do destaque atual) ────────────────── */}
      <div className="absolute top-0 inset-x-0 z-30 flex gap-1 px-2 pt-2">
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
      <div className="absolute top-6 inset-x-0 z-30 flex items-center gap-3 px-4 pt-1">
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

      {/* ── Mídia (encaixada na tela, estilo Instagram Stories) ──────────────
          O container é travado à altura da tela (min-h-0 impede que cresça
          além do viewport e amplie a mídia). A mídia é centralizada num
          wrapper absoluto (inset-0) e usa object-contain com max-w/max-h,
          então aparece inteira, sem cortar nem ampliar; o fundo desfocado
          preenche as sobras. */}
      <div
        className="flex-1 min-h-0 w-full relative overflow-hidden cursor-pointer touch-none"
        onClick={handleTap}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {story.media_url && !mediaError ? (
          <>
            {/* Fundo desfocado preenche as bordas. Para vídeo usa a capa/avatar
                do destaque (a URL do vídeo não é imagem). */}
            {backdropSrc && (
              <img
                src={backdropSrc}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 opacity-50"
                draggable={false}
              />
            )}
            <div className="absolute inset-0 z-10 flex items-center justify-center">
              {isVideo ? (
                <video
                  ref={videoRef}
                  key={story.id}
                  src={story.media_url}
                  playsInline
                  className="max-w-full max-h-full object-contain"
                  onEnded={goNext}
                  onError={() => setMediaError(true)}
                  onTimeUpdate={() => {
                    const v = videoRef.current
                    if (v && v.duration) setProgress((v.currentTime / v.duration) * 100)
                  }}
                />
              ) : (
                <img
                  key={story.id}
                  src={story.media_url}
                  alt={story.display_name}
                  className="max-w-full max-h-full object-contain"
                  draggable={false}
                  onError={() => setMediaError(true)}
                />
              )}
            </div>
          </>
        ) : (
          <div className="w-full h-full bg-gray-900 flex flex-col items-center justify-center gap-3 px-8 text-center">
            {mediaError ? (
              <>
                <ImageOff size={44} className="text-white/30" />
                <p className="text-white/70 text-sm font-medium">Não foi possível carregar {isVideo ? 'o vídeo' : 'a imagem'}</p>
                <p className="text-white/40 text-xs">Verifique a conexão ou reenvie a mídia no painel.</p>
              </>
            ) : (
              <Camera size={48} className="text-white/20" />
            )}
          </div>
        )}

        {/* Zonas de toque invisíveis (prev/next) */}
        <div className="absolute inset-y-0 left-0 w-[30%] z-20" />
        <div className="absolute inset-y-0 right-0 w-[70%] z-20" />
      </div>
    </div>,
    document.body,
  )
}
