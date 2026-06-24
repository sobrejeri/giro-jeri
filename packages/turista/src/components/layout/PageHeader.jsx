import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'

export default function PageHeader({ title, subtitle, showBack = true, right = null, sticky = true }) {
  const navigate = useNavigate()
  return (
    <header className={`bg-white px-4 pt-5 pb-3 shadow-sm ${sticky ? 'sticky top-0 z-40' : ''}`}>
      <div className="relative flex items-center justify-center min-h-[32px]">
        {showBack && (
          <button
            onClick={() => navigate(-1)}
            className="absolute left-0 w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center active:scale-95 transition-transform"
            aria-label="Voltar"
          >
            <ChevronLeft size={20} className="text-gray-700" />
          </button>
        )}
        <h1 className="font-giro font-semibold text-[22px] text-gray-900 tracking-wide">{title}</h1>
        {right && <div className="absolute right-0">{right}</div>}
      </div>
      {subtitle && (
        <p className="text-[12px] text-gray-400 text-center mt-1">{subtitle}</p>
      )}
    </header>
  )
}
