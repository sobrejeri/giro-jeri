const base = 'inline-flex items-center justify-center gap-2 font-medium transition-colors rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50'

const variants = {
  primary:   'bg-brand text-white hover:bg-brand-600 active:bg-brand-700',
  secondary: 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50',
  ghost:     'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
  danger:    'bg-red-500 text-white hover:bg-red-600',
  outline:   'border border-brand text-brand hover:bg-brand/10',
}

const sizes = {
  sm:   'h-8 px-3 text-sm',
  md:   'h-10 px-4 text-sm',
  lg:   'h-12 px-6 text-base',
  xl:   'h-14 px-8 text-lg',
  icon: 'h-10 w-10',
}

export default function Button({ variant = 'primary', size = 'md', className = '', children, ...props }) {
  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props}>
      {children}
    </button>
  )
}
