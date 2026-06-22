import { useTranslation } from 'react-i18next'
import { Camera } from 'lucide-react'

/**
 * StoriesRow — horizontal scrolling strip of Instagram-style story circles.
 *
 * Props:
 *   stories   — array of story objects from /api/stories
 *   onSelect  — (index: number) => void
 */
export default function StoriesRow({ stories = [], onSelect }) {
  const { t } = useTranslation()

  if (!stories.length) return null

  return (
    <div
      className="overflow-x-auto scrollbar-hide flex gap-4 px-4 py-2"
      aria-label={t('stories.strip')}
    >
      {stories.map((story, i) => {
        const hasImage = !!story.avatar_url || (story.media_type !== 'video' && !!story.media_url)
        const src = story.avatar_url || (story.media_type !== 'video' ? story.media_url : null)

        return (
          <button
            key={story.id}
            onClick={() => onSelect(i)}
            className="flex flex-col items-center shrink-0 active:scale-95 transition-transform"
            aria-label={story.display_name}
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
                  {hasImage ? (
                    <img
                      src={src}
                      alt={story.display_name}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    /* Video or no image: dark circle + camera icon */
                    <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                      <Camera size={22} className="text-white/60" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Display name */}
            <p className="text-[11px] font-medium text-gray-700 truncate w-[72px] text-center mt-1">
              {story.display_name}
            </p>
          </button>
        )
      })}
    </div>
  )
}
