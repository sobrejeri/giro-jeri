import { BadgeCheck } from 'lucide-react'

// Identidade de usuário (tema claro). Para ADMIN troca a foto pela LOGO do Turiva
// (preta com o "T" branco), põe selo azul de verificado + rótulo "Administrador"
// — para diferenciar de um operador normal. Role-based: user_type === 'admin'.
function TurivaMark({ size }) {
  return (
    <div className="rounded-xl bg-black flex items-center justify-center shrink-0"
         style={{ width: size, height: size }} title="Turiva — Administrador">
      <span className="font-giro font-bold text-white leading-none" style={{ fontSize: Math.round(size * 0.5) }}>T</span>
    </div>
  )
}

function Avatar({ name, photo, isAdmin, size }) {
  if (isAdmin) return <TurivaMark size={size} />
  if (photo)   return <img src={photo} alt="" className="rounded-xl object-cover shrink-0 bg-gray-100" style={{ width: size, height: size }} />
  const inicial = (name || '?').trim().charAt(0).toUpperCase()
  return (
    <div className="rounded-xl bg-brand/10 text-brand flex items-center justify-center shrink-0 font-bold"
         style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}>
      {inicial}
    </div>
  )
}

export default function UserIdentity({ name, userType, photo, size = 44, subtitle = null }) {
  const isAdmin = userType === 'admin'
  return (
    <div className="flex items-center gap-3 min-w-0">
      <Avatar name={name} photo={photo} isAdmin={isAdmin} size={size} />
      <div className="min-w-0 leading-tight">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="truncate font-semibold text-gray-800">{name || '—'}</span>
          {isAdmin && <BadgeCheck size={Math.max(16, Math.round(size * 0.4))} className="text-sky-500 shrink-0" aria-label="Administrador verificado" />}
        </div>
        {isAdmin
          ? <span className="block text-xs text-sky-600 font-semibold">Administrador</span>
          : subtitle ? <span className="block text-xs text-gray-400 truncate">{subtitle}</span> : null}
      </div>
    </div>
  )
}
