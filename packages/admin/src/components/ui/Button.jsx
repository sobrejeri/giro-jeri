const base = 'inline-flex items-center justify-center gap-2 font-medium transition-colors rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-gray-900 disabled:pointer-events-none disabled:opacity-40'

const variants = {
  primary:   'bg-brand text-white hover:bg-brand-600 active:bg-brand-700',
  secondary: 'bg-gray-800 text-gray-200 border border-gray-700 hover:bg-gray-700',
  ghost:     'text-gray-400 hover:bg-gray-800 hover:text-gray-100',
  danger:    'bg-red-600 text-white hover:bg-red-700',
  outline:   'border border-brand text-brand hover:bg-brand/10',
}

const sizes = {
  sm:   'h-8 px-3 text-sm',
  md:   'h-9 px-4 text-sm',
  lg:   'h-10 px-5 text-base',
  icon: 'h-9 w-9',
}

export default function Button({ variant = 'primary', size = 'md', className = '', children, ...props }) {
  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props}>
      {children}
    </button>
  )
}
