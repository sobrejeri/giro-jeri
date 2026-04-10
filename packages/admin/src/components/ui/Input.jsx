const base = 'w-full px-3 rounded-lg border text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand/30 bg-gray-900 text-gray-100 placeholder-gray-600 disabled:opacity-50'

export default function Input({ label, error, className = '', ...props }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-sm font-medium text-gray-300">{label}</label>}
      <input
        className={`h-9 ${base} ${error ? 'border-red-500 focus:border-red-500' : 'border-gray-700 focus:border-brand'} ${className}`}
        {...props}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}

export function Select({ label, error, className = '', children, ...props }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-sm font-medium text-gray-300">{label}</label>}
      <select
        className={`h-9 ${base} ${error ? 'border-red-500' : 'border-gray-700 focus:border-brand'} ${className}`}
        {...props}
      >
        {children}
      </select>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}

export function Textarea({ label, error, className = '', ...props }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-sm font-medium text-gray-300">{label}</label>}
      <textarea
        className={`py-2 ${base} resize-none ${error ? 'border-red-500' : 'border-gray-700 focus:border-brand'} ${className}`}
        {...props}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
