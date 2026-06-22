import { useTranslation } from 'react-i18next'
import { Camera, Plus } from 'lucide-react'

/**
 * StoriesRow — horizontal scrolling strip of Instagram Highlights-style circles.
 *
 * Each circle represents a topic group (highlight). Clicking one opens the
 * viewer for all items in that group.
 *
 * Props:
 *   highlights  — array of highlight objects from /api/stories
 *                 { id, title, cover_image_url, sort_order, stories: [] }
 *   onSelect    — (index: number) => void   called with the highlight's index
 *   isAdmin     — quando true, mostra o círculo "+" para publicar (só admin)
 *   onPublish   — () => void   chamado ao tocar no círculo "+"
 */
export default function StoriesRow({ highlights = [], onSelect, isAdmin = false, onPublish }) {
  const { t } = useTranslation()

  if (!highlights.length && !isAdmin) return null

  return (
    <div
      className="overflow-x-auto scrollbar-hide flex gap-4 px-4 py-2"
      aria-label={t('stories.strip')}
    >
      {isAdmin && (
        <button
          onClick={onPublish}
          className="flex flex-col items-center shrink-0 active:scale-95 transition-transform"
          aria-label="Publicar destaque"
        >
          <div className="w-[76px] h-[76px] rounded-full flex items-center justify-center shrink-0 border-2 border-dashed border-gray-300">
            <div className="w-[58px] h-[58px] rounded-full bg-brand/10 flex items-center justify-center">
              <Plus size={26} className="text-brand" />
            </div>
          </div>
          <p className="text-[11px] font-medium text-gray-700 truncate w-[72px] text-center mt-1">
            Publicar
          </p>
        </button>
      )}
      {highlights.map((highlight, i) => {
        const hasCover = !!highlight.cover_image_url

        return (
          <button
            key={highlight.id}
            onClick={() => onSelect(i)}
            className="flex flex-col items-center shrink-0 active:scale-95 transition-transform"
            aria-label={highlight.title}
          >
            {/* Gradient ring (Instagram palette) */}
            <div
              className="w-[76px] h-[76px] rounded-full flex items-center justify-center shrink-0"
              style={{
                background:
                  'linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)',
              }}
            >
              {/* White gap */}
              <div className="w-[70px] h-[70px] rounded-full bg-white flex items-center justify-center overflow-hidden">
                {/* Inner image circle */}
                <div className="w-[66px] h-[66px] rounded-full overflow-hidden bg-gray-200 flex items-center justify-center">
                  {hasCover ? (
                    <img
                      src={highlight.cover_image_url}
                      alt={highlight.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    /* No cover image: dark circle + camera icon */
                    <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                      <Camera size={22} className="text-white/60" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Highlight title */}
            <p className="text-[11px] font-medium text-gray-700 truncate w-[72px] text-center mt-1">
              {highlight.title}
            </p>
          </button>
        )
      })}
    </div>
  )
}
