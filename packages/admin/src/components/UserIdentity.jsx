import { BadgeCheck } from 'lucide-react'

// Identidade de usuário nas telas do admin: foto + nome. Quando é ADMIN, troca a
// foto pela LOGO do Turiva (preta com o "T" branco), põe um SELO AZUL de
// verificado ao lado do nome e o rótulo "Administrador" — para diferenciar de um
// operador normal da plataforma. Role-based: vale para qualquer user_type 'admin'.

// Marca monocromática do Turiva (logo preta / "T" branco).
function TurivaMark({ size }) {
  return (
    <div
      className="rounded-lg bg-black flex items-center justify-center shrink-0 ring-1 ring-white/15"
      style={{ width: size, height: size }}
      title="Turiva — Administrador"
    >
      <span className="font-giro font-bold text-white leading-none" style={{ fontSize: Math.round(size * 0.5) }}>T</span>
    </div>
  )
}

function Avatar({ name, photo, isAdmin, size }) {
  if (isAdmin) return <TurivaMark size={size} />
  if (photo)   return <img src={photo} alt="" className="rounded-lg object-cover shrink-0 bg-gray-800" style={{ width: size, height: size }} />
  const inicial = (name || '?').trim().charAt(0).toUpperCase()
  return (
    <div className="rounded-lg bg-gray-700 text-gray-200 flex items-center justify-center shrink-0 font-semibold"
         style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}>
      {inicial}
    </div>
  )
}

export default function UserIdentity({ name, userType, photo, size = 32, subtitle = null, nameClass = 'text-gray-100', showLabel = true }) {
  const isAdmin = userType === 'admin'
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <Avatar name={name} photo={photo} isAdmin={isAdmin} size={size} />
      <div className="min-w-0 leading-tight">
        <div className="flex items-center gap-1 min-w-0">
          <span className={`truncate font-medium ${nameClass}`}>{name || '—'}</span>
          {isAdmin && <BadgeCheck size={Math.max(14, Math.round(size * 0.5))} className="text-sky-400 shrink-0" aria-label="Administrador verificado" />}
        </div>
        {/* showLabel=false onde já existe uma coluna/badge de tipo (ex.: Usuários):
            aí o selo azul fica, mas o rótulo "Administrador" dá lugar ao subtitle. */}
        {(isAdmin && showLabel)
          ? <span className="block text-[11px] text-sky-400 font-medium">Administrador</span>
          : subtitle ? <span className="block text-[11px] text-gray-500 truncate">{subtitle}</span> : null}
      </div>
    </div>
  )
}
