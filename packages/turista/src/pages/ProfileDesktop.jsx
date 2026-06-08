import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'
import {
  Camera, Loader2, CalendarCheck, User, CreditCard, Heart, LifeBuoy,
  CheckCircle2, Star, ChevronRight, LogOut, Pencil, Check, X,
} from 'lucide-react'

function StatCard({ icon: Icon, value, label, tint }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${tint}`}>
        <Icon size={19} />
      </div>
      <div>
        <p className="text-2xl font-extrabold text-gray-900 leading-none">{value}</p>
        <p className="text-[12px] text-gray-400 mt-1">{label}</p>
      </div>
    </div>
  )
}

export default function ProfileDesktop() {
  const { user, token, logout, updateUser } = useAuth()
  const navigate = useNavigate()
  const fileRef  = useRef(null)

  const [avatarUrl, setAvatarUrl]         = useState(user?.profile_photo_url || null)
  const [uploading, setUploading]         = useState(false)
  const [editing, setEditing]             = useState(false)
  const [saving, setSaving]               = useState(false)
  const [form, setForm]                   = useState({})

  const { data: bookingsData } = useQuery({
    queryKey: ['my-bookings'],
    queryFn:  () => api.getMyBookings(),
    enabled:  !!token,
  })
  const bookings  = bookingsData?.data || bookingsData || []
  const concluded = bookings.filter((b) => (b.status_operational || b.status) === 'completed').length

  const firstName = user?.full_name?.split(' ')[0] || 'viajante'
  const initials  = user?.full_name?.split(' ').slice(0, 2).map((n) => n[0]?.toUpperCase()).join('') || 'U'

  const STATS = [
    { icon: CalendarCheck, value: bookings.length, label: 'Reservas realizadas', tint: 'bg-blue-50 text-blue-600' },
    { icon: CheckCircle2,  value: concluded,        label: 'Passeios concluídos', tint: 'bg-emerald-50 text-emerald-600' },
    { icon: Star,          value: 0,                label: 'Avaliações feitas',   tint: 'bg-amber-50 text-amber-500' },
    { icon: Heart,         value: 0,                label: 'Favoritos salvos',    tint: 'bg-rose-50 text-rose-500' },
  ]

  const MENU = [
    { icon: CalendarCheck, title: 'Minhas Reservas',     desc: 'Acompanhe suas próximas viagens', onClick: () => navigate('/minhas-reservas') },
    { icon: User,          title: 'Dados Pessoais',       desc: 'Gerencie suas informações',       onClick: () => { startEdit() } },
    { icon: CalendarCheck, title: 'Histórico de Passeios', desc: 'Veja todos os passeios realizados', onClick: () => navigate('/minhas-reservas') },
    { icon: CreditCard,    title: 'Formas de Pagamento',  desc: 'Cartões e métodos salvos',        onClick: () => helpWA('Quero gerenciar minhas formas de pagamento.') },
    { icon: Heart,         title: 'Favoritos',            desc: 'Passeios que você salvou',        onClick: () => navigate('/passeios') },
    { icon: LifeBuoy,      title: 'Central de Ajuda',     desc: 'Dúvidas e suporte',               onClick: () => helpWA('Olá! Preciso de ajuda no Giro Jeri.') },
  ]

  function helpWA(text) {
    window.open(`https://wa.me/5588999999999?text=${encodeURIComponent(text)}`, '_blank')
  }

  function startEdit() {
    setForm({
      full_name:       user?.full_name       || '',
      phone:           user?.phone           || '',
      birth_date:      user?.birth_date      || '',
      document_type:   user?.document_type   || '',
      document_number: user?.document_number || '',
      nationality:     user?.nationality     || '',
    })
    setEditing(true)
  }

  async function saveEdit() {
    setSaving(true)
    try {
      const payload = { ...form }
      Object.keys(payload).forEach((k) => { if (payload[k] === '') payload[k] = null })
      const data = await api.updateProfile(payload)
      if (data?.user) updateUser(data.user)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  function handlePhotoChange(e) {
    const file = e.target.files?.[0]
    if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const img = new Image()
      img.onload = async () => {
        const MAX = 400
        const scale = Math.min(1, MAX / img.width, MAX / img.height)
        const canvas = document.createElement('canvas')
        canvas.width  = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
        setAvatarUrl(dataUrl)
        setUploading(true)
        try {
          const data = await api.uploadPhoto(dataUrl)
          if (data?.url) updateUser({ profile_photo_url: data.url })
        } finally { setUploading(false) }
      }
      img.src = ev.target.result
    }
    reader.readAsDataURL(file)
  }

  // Visitante não logado
  if (!token) {
    return (
      <div className="max-w-md mx-auto px-6 py-20 text-center">
        <div className="w-16 h-16 rounded-2xl bg-brand/10 flex items-center justify-center mx-auto mb-4"><User size={28} className="text-brand" /></div>
        <h1 className="text-2xl font-extrabold text-gray-900">Entre na sua conta</h1>
        <p className="text-gray-500 mt-2 mb-6">Acesse para ver suas reservas e gerenciar seu perfil.</p>
        <button onClick={() => navigate('/login')} className="bg-brand hover:bg-brand-600 text-white font-bold px-6 py-3 rounded-xl">Entrar</button>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* ── Banner ───────────────────────────────────────── */}
      <div className="relative rounded-3xl overflow-hidden h-44 bg-gradient-to-r from-[#FF6A00] via-[#FF8A3D] to-[#1A4D5F]">
        <div className="absolute inset-0 bg-black/10" />
      </div>
      <div className="px-6 -mt-12 relative flex items-end gap-5">
        <div className="relative">
          <div className="w-24 h-24 rounded-2xl border-4 border-white bg-brand/10 overflow-hidden flex items-center justify-center text-brand text-2xl font-extrabold shadow-md">
            {avatarUrl ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" /> : initials}
          </div>
          <button
            onClick={() => fileRef.current?.click()}
            className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-brand text-white flex items-center justify-center shadow-md hover:bg-brand-600"
          >
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
        </div>
        <div className="pb-2">
          <h1 className="text-2xl font-extrabold text-gray-900">Olá, {firstName}! 👋</h1>
          <p className="text-gray-500 text-[14px]">Bem-vindo de volta ao Giro Jeri</p>
        </div>
      </div>

      {/* ── Stats ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
        {STATS.map((s) => <StatCard key={s.label} {...s} />)}
      </div>

      {/* ── Edição de dados (inline) ─────────────────────── */}
      {editing && (
        <div className="mt-6 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-900 text-lg">Dados pessoais</h3>
            <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { k: 'full_name', label: 'Nome completo', type: 'text' },
              { k: 'phone', label: 'Telefone / WhatsApp', type: 'tel' },
              { k: 'birth_date', label: 'Nascimento', type: 'date' },
              { k: 'nationality', label: 'Nacionalidade', type: 'text' },
              { k: 'document_number', label: 'Documento', type: 'text' },
            ].map(({ k, label, type }) => (
              <label key={k} className="flex flex-col gap-1">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{label}</span>
                <input
                  type={type}
                  value={form[k] || ''}
                  onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
                  className="border border-gray-200 rounded-xl px-3 py-2 text-[14px] focus:outline-none focus:border-brand"
                />
              </label>
            ))}
          </div>
          <div className="flex gap-3 mt-5">
            <button onClick={saveEdit} disabled={saving} className="inline-flex items-center gap-2 bg-brand hover:bg-brand-600 text-white font-bold px-5 py-2.5 rounded-xl disabled:opacity-60">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Salvar
            </button>
            <button onClick={() => setEditing(false)} className="px-5 py-2.5 rounded-xl border border-gray-200 text-gray-600 font-semibold hover:bg-gray-50">Cancelar</button>
          </div>
        </div>
      )}

      {/* ── Menu ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
        {MENU.map(({ icon: Icon, title, desc, onClick }) => (
          <button
            key={title}
            onClick={onClick}
            className="flex items-center gap-4 bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-left hover:shadow-md hover:border-brand/20 transition-all group"
          >
            <div className="w-11 h-11 rounded-xl bg-brand/10 flex items-center justify-center shrink-0"><Icon size={19} className="text-brand" /></div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-gray-900 text-[14px]">{title}</p>
              <p className="text-[12px] text-gray-400 truncate">{desc}</p>
            </div>
            <ChevronRight size={18} className="text-gray-300 group-hover:text-brand transition-colors" />
          </button>
        ))}
      </div>

      {/* ── Editar / Sair ────────────────────────────────── */}
      <div className="flex items-center justify-between mt-8">
        <button onClick={startEdit} className="inline-flex items-center gap-2 text-[14px] font-semibold text-gray-600 hover:text-brand">
          <Pencil size={15} /> Editar dados
        </button>
        <button
          onClick={() => { logout(); navigate('/') }}
          className="inline-flex items-center gap-2 text-[14px] font-bold text-red-500 hover:text-red-600 border border-red-200 hover:bg-red-50 px-5 py-2.5 rounded-xl transition-colors"
        >
          <LogOut size={16} /> Sair da conta
        </button>
      </div>

      <p className="text-center text-[12px] text-gray-300 mt-8">Giro Jeri v2.0</p>
    </div>
  )
}
