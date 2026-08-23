import { useState, useRef, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import PhoneInput from '../components/PhoneInput'
import { api } from '../lib/api'
import { versionLabel } from '../lib/version'
import { setLang, LANGS } from '../i18n/index.js'
import { validateBrDoc } from '../lib/document'
import { WhatsappCheck } from './Profile'
import {
  Camera, Loader2, CalendarCheck, User, CreditCard, Heart, LifeBuoy,
  CheckCircle2, Star, ChevronRight, LogOut, Pencil, Check, X,
  AlertCircle, Globe, Megaphone,
} from 'lucide-react'
import { useFavorites } from '../contexts/FavoritesContext'

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
  const { count: favsCount } = useFavorites()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const fileRef  = useRef(null)
  const coverRef = useRef(null)

  const [avatarUrl, setAvatarUrl]         = useState(user?.profile_photo_url || null)
  const [uploading, setUploading]         = useState(false)
  const [photoError, setPhotoError]       = useState('')
  const [coverUrl, setCoverUrl]           = useState(user?.cover_photo_url || null)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [coverError, setCoverError]       = useState('')
  const [editing, setEditing]             = useState(false)
  const [saving, setSaving]               = useState(false)
  const [saveError, setSaveError]         = useState('')
  const [form, setForm]                   = useState({})

  // Mantém o preview em sincronia quando o usuário do contexto muda
  // (a hidratação via /me é feita no componente pai Profile, sempre montado).
  useEffect(() => { setAvatarUrl(user?.profile_photo_url || null) }, [user?.profile_photo_url])
  useEffect(() => { setCoverUrl(user?.cover_photo_url || null) },   [user?.cover_photo_url])

  const { data: bookingsData } = useQuery({
    queryKey: ['my-bookings'],
    queryFn:  () => api.getMyBookings(),
    enabled:  !!token,
  })
  // Sempre lista — ver a mesma defesa em Home.jsx.
  const bookings  = Array.isArray(bookingsData?.data) ? bookingsData.data
                  : Array.isArray(bookingsData)       ? bookingsData
                  : []
  const concluded = bookings.filter((b) => (b.status_operational || b.status) === 'completed').length

  const firstName = user?.full_name?.split(' ')[0] || 'viajante'
  const initials  = user?.full_name?.split(' ').slice(0, 2).map((n) => n[0]?.toUpperCase()).join('') || 'U'

  const STATS = [
    { icon: CalendarCheck, value: bookings.length, label: t('profile.stats.bookings'),  tint: 'bg-blue-50 text-blue-600' },
    { icon: CheckCircle2,  value: concluded,        label: t('profile.stats.completed'), tint: 'bg-emerald-50 text-emerald-600' },
    { icon: Star,          value: 0,                label: t('profile.stats.reviews'),   tint: 'bg-amber-50 text-amber-500' },
    { icon: Heart,         value: favsCount,         label: t('profile.stats.favorites'), tint: 'bg-rose-50 text-rose-500' },
  ]

  const MENU = [
    { icon: CalendarCheck, title: t('profile.menuItems.bookings'),     desc: t('profile.menuItems.bookingsDesc'),     onClick: () => navigate('/minhas-reservas') },
    { icon: User,          title: t('profile.menuItems.personalData'), desc: t('profile.menuItems.personalDataDesc'), onClick: () => { startEdit() } },
    { icon: CalendarCheck, title: t('profile.menuItems.history'),      desc: t('profile.menuItems.historyDesc'),      onClick: () => navigate('/minhas-reservas') },
    { icon: CreditCard,    title: t('profile.menuItems.payments'),     desc: t('profile.menuItems.paymentsDesc'),     onClick: () => helpWA('Quero gerenciar minhas formas de pagamento.') },
    { icon: Heart,         title: t('profile.menuItems.favorites'),    desc: t('profile.menuItems.favoritesDesc'),    onClick: () => navigate('/passeios') },
    { icon: Megaphone,     title: t('profile.menuItems.affiliate'),    desc: t('profile.menuItems.affiliateDesc'),    onClick: () => navigate('/afiliado') },
    { icon: LifeBuoy,      title: t('profile.menuItems.help'),         desc: t('profile.menuItems.helpDesc'),         onClick: () => helpWA('Olá! Preciso de ajuda no Turiva.') },
  ]

  function helpWA(text) {
    const phone = import.meta.env.VITE_ADMIN_WHATSAPP || '5588999999999'
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank')
  }

  const DOC_TYPES = [
    { value: 'cpf',      label: 'CPF' },
    { value: 'cnpj',     label: 'CNPJ' },
    { value: 'passport', label: 'Passaporte' },
    { value: 'rg',       label: 'RG' },
    { value: 'cnh',      label: 'CNH' },
    { value: 'other',    label: 'Outro' },
  ]

  const GENDERS = [
    { value: 'male',              label: 'Masculino' },
    { value: 'female',            label: 'Feminino' },
    { value: 'non_binary',        label: 'Não binário' },
    { value: 'prefer_not_to_say', label: 'Prefiro não dizer' },
  ]

  function startEdit() {
    setForm({
      full_name:               user?.full_name               || '',
      username:                user?.username                || '',
      phone:                   user?.phone                   || '',
      birth_date:              user?.birth_date              || '',
      document_type:           user?.document_type           || '',
      document_number:         user?.document_number         || '',
      nationality:             user?.nationality             || '',
      gender:                  user?.gender                  || '',
      emergency_contact_name:  user?.emergency_contact_name  || '',
      emergency_contact_phone: user?.emergency_contact_phone || '',
      emergency_contact_email: user?.emergency_contact_email || '',
    })
    setSaveError('')
    setEditing(true)
  }

  async function saveEdit() {
    // CPF/CNPJ: valida os dígitos verificadores ANTES de enviar (o servidor
    // também valida — mesma dupla camada do mobile).
    const docErr = validateBrDoc(form.document_type, form.document_number)
    if (docErr) { setSaveError(docErr); return }
    setSaving(true)
    setSaveError('')
    try {
      const payload = { ...form }
      Object.keys(payload).forEach((k) => { if (payload[k] === '') payload[k] = null })
      // Só envia username se mudou (evita username:null em banco sem migration 061).
      if ((form.username || '') === (user?.username || '')) delete payload.username
      const data = await api.updateProfile(payload)
      if (data?.user) updateUser(data.user)
      setEditing(false)
    } catch (err) {
      setSaveError(err?.message || 'Erro ao salvar os dados.')
    } finally {
      setSaving(false)
    }
  }

  async function handleLogout() {
    await api.logout().catch(() => {})
    logout()
    navigate('/')
  }

  function handlePhotoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setPhotoError('Use uma imagem JPEG, PNG ou WebP.'); return
    }
    if (file.size > 2 * 1024 * 1024) {
      setPhotoError('Imagem muito grande. Máximo 2 MB.'); return
    }
    setPhotoError('')
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
        } catch (err) {
          setPhotoError(err?.message || 'Erro ao salvar foto no servidor.')
        } finally { setUploading(false) }
      }
      img.src = ev.target.result
    }
    reader.readAsDataURL(file)
  }

  function handleCoverChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setCoverError('Use uma imagem JPEG, PNG ou WebP.'); return
    }
    if (file.size > 8 * 1024 * 1024) {
      setCoverError('Imagem muito grande. Máximo 8 MB.'); return
    }
    setCoverError('')
    const reader = new FileReader()
    reader.onload = (ev) => {
      const img = new Image()
      img.onload = async () => {
        const MAX = 1600
        const scale = Math.min(1, MAX / img.width)
        const canvas = document.createElement('canvas')
        canvas.width  = Math.round(img.width * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.82)
        setCoverUrl(dataUrl)          // preview otimista
        setUploadingCover(true)
        try {
          const data = await api.uploadCover(dataUrl)
          if (data?.url) { updateUser({ cover_photo_url: data.url }); setCoverUrl(data.url) }
        } catch (err) {
          setCoverError(err?.message || 'Erro ao salvar a capa.')
          setCoverUrl(user?.cover_photo_url || null)
        } finally { setUploadingCover(false) }
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
      {/* ── Banner / capa editável ───────────────────────── */}
      <div className="relative rounded-3xl overflow-hidden h-44">
        {coverUrl
          ? <img src={coverUrl} alt="Capa do perfil" className="absolute inset-0 w-full h-full object-cover" />
          : <div className="absolute inset-0 bg-gradient-to-r from-[#FF6A00] via-[#FF8A3D] to-[#1A4D5F]" />}
        <div className="absolute inset-0 bg-black/10" />
        <button
          onClick={() => !uploadingCover && coverRef.current?.click()}
          className="absolute top-3 right-3 inline-flex items-center gap-1.5 bg-black/40 hover:bg-black/55 text-white text-[12px] font-semibold px-3 py-1.5 rounded-lg backdrop-blur-sm transition-colors"
        >
          {uploadingCover ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
          {uploadingCover ? 'Enviando…' : 'Alterar capa'}
        </button>
        <input ref={coverRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleCoverChange} />
      </div>
      {(coverError || photoError) && (
        <p className="mt-2 text-[12px] text-red-500 bg-red-50 rounded-lg px-3 py-2">{coverError || photoError}</p>
      )}
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
          <p className="text-gray-500 text-[14px]">Bem-vindo de volta ao Turiva</p>
        </div>
      </div>

      {/* ── Stats ────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
        {STATS.map((s) => <StatCard key={s.label} {...s} />)}
      </div>

      {/* ── WhatsApp do telefone cadastrado (avisos automáticos) ── */}
      {user?.phone && (
        <div className="mt-4 max-w-md">
          <WhatsappCheck />
        </div>
      )}

      {/* ── Edição de dados (inline) ─────────────────────── */}
      {editing && (
        <div className="mt-6 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-900 text-lg">Dados pessoais</h3>
            <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>
          {saveError && (
            <p className="mb-4 text-[13px] text-red-500 bg-red-50 rounded-xl px-4 py-2.5">{saveError}</p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { k: 'full_name', label: 'Nome completo', type: 'text' },
              { k: 'birth_date', label: 'Nascimento', type: 'date' },
              { k: 'nationality', label: 'Nacionalidade', type: 'text' },
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

            {/* Nome de usuário (login sem e-mail) */}
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Nome de usuário</span>
              <div className="flex items-center border border-gray-200 rounded-xl px-3 focus-within:border-brand">
                <span className="text-[14px] text-gray-400">@</span>
                <input
                  value={form.username || ''}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, '') }))}
                  placeholder="seu_usuario"
                  autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={30}
                  className="flex-1 py-2 pl-1 text-[14px] focus:outline-none lowercase"
                />
              </div>
            </label>

            {/* Telefone com DDI internacional (mesmo componente do mobile) */}
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Telefone / WhatsApp</span>
              <PhoneInput
                value={form.phone || ''}
                onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
              />
            </label>

            {/* Documento: tipo + número */}
            <div className="flex gap-2">
              <label className="flex flex-col gap-1 w-[130px] shrink-0">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Tipo doc.</span>
                <select
                  value={form.document_type || ''}
                  onChange={(e) => setForm((f) => ({ ...f, document_type: e.target.value }))}
                  className="border border-gray-200 rounded-xl px-3 py-2 text-[14px] focus:outline-none focus:border-brand bg-white"
                >
                  <option value="">—</option>
                  {DOC_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1 flex-1">
                <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Documento</span>
                <input
                  type="text"
                  value={form.document_number || ''}
                  onChange={(e) => setForm((f) => ({ ...f, document_number: e.target.value }))}
                  className="border border-gray-200 rounded-xl px-3 py-2 text-[14px] focus:outline-none focus:border-brand"
                />
              </label>
            </div>

            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Gênero</span>
              <select
                value={form.gender || ''}
                onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}
                className="border border-gray-200 rounded-xl px-3 py-2 text-[14px] focus:outline-none focus:border-brand bg-white"
              >
                <option value="">—</option>
                {GENDERS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
            </label>
          </div>

          {/* Contato de emergência */}
          <div className="mt-5 pt-4 border-t border-gray-50">
            <p className="flex items-center gap-1.5 text-[11px] font-bold text-orange-500 mb-2">
              <AlertCircle size={12} /> Contato de emergência
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <input
                placeholder="Nome do contato"
                value={form.emergency_contact_name || ''}
                onChange={(e) => setForm((f) => ({ ...f, emergency_contact_name: e.target.value }))}
                className="border border-gray-200 rounded-xl px-3 py-2 text-[14px] focus:outline-none focus:border-brand"
              />
              <PhoneInput
                value={form.emergency_contact_phone || ''}
                onChange={(v) => setForm((f) => ({ ...f, emergency_contact_phone: v }))}
                placeholder="Telefone do contato"
              />
              <input
                type="email"
                placeholder="E-mail do contato"
                value={form.emergency_contact_email || ''}
                onChange={(e) => setForm((f) => ({ ...f, emergency_contact_email: e.target.value }))}
                className="border border-gray-200 rounded-xl px-3 py-2 text-[14px] focus:outline-none focus:border-brand"
              />
            </div>
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

      {/* ── Idioma ───────────────────────────────────────── */}
      <div className="mt-6 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-50 flex items-center gap-2">
          <Globe size={15} className="text-brand" />
          <span className="font-semibold text-gray-800 text-[14px]">{t('profile.language')}</span>
        </div>
        <div className="flex">
          {LANGS.map((lang, i) => {
            const active = i18n.language === lang.code
            return (
              <button
                key={lang.code}
                onClick={() => setLang(lang.code)}
                className={`flex-1 flex items-center justify-center gap-2 py-3 text-[13px] font-semibold transition-colors ${i > 0 ? 'border-l border-gray-50' : ''} ${active ? 'bg-orange-50 text-brand' : 'text-gray-500 hover:bg-gray-50'}`}
              >
                <span className="text-[18px]">{lang.flag}</span>
                {lang.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Editar / Sair ────────────────────────────────── */}
      <div className="flex items-center justify-between mt-8">
        <button onClick={startEdit} className="inline-flex items-center gap-2 text-[14px] font-semibold text-gray-600 hover:text-brand">
          <Pencil size={15} /> {t('profile.editData')}
        </button>
        <button
          onClick={handleLogout}
          className="inline-flex items-center gap-2 text-[14px] font-bold text-red-500 hover:text-red-600 border border-red-200 hover:bg-red-50 px-5 py-2.5 rounded-xl transition-colors"
        >
          <LogOut size={16} /> {t('profile.logout')}
        </button>
      </div>

      <p className="text-center text-[12px] text-gray-400 mt-8">
        <Link to="/termos" className="hover:text-brand">Termos de Uso</Link>
        {' · '}
        <Link to="/privacidade" className="hover:text-brand">Privacidade</Link>
      </p>
      <p className="text-center text-[12px] text-gray-300 mt-2">{versionLabel()}</p>
    </div>
  )
}
