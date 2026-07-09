// Selo verificado estilo Instagram (azul + check branco). Compartilhado entre
// os destaques (StoryViewer) e os posts do feed (Descubra).
export default function VerifiedBadge({ size = 15, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={`shrink-0 ${className}`} aria-label="Verificado" role="img">
      <path fill="#3897F0" d="M12 1l2.35 2.06 3.12-.36 1.19 2.9 2.9 1.19-.36 3.12L23 12l-2.06 2.35.36 3.12-2.9 1.19-1.19 2.9-3.12-.36L12 23l-2.35-2.06-3.12.36-1.19-2.9-2.9-1.19.36-3.12L1 12l2.06-2.35-.36-3.12 2.9-1.19 1.19-2.9 3.12.36L12 1z" />
      <path fill="#fff" d="M10.4 15.3l-2.95-2.95 1.32-1.32 1.63 1.63 3.83-3.83 1.32 1.32z" />
    </svg>
  )
}
