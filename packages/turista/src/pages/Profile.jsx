import { useState, useRef, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import PhoneInput from '../components/PhoneInput'
import { api } from '../lib/api'
import { versionLabel } from '../lib/version'
import { setLang, LANGS } from '../i18n/index.js'
import { validateBrDoc } from '../lib/document'
import ProfileDesktop from './ProfileDesktop'
import {
  User, Mail, LogOut, ChevronLeft, ChevronRight, CalendarCheck, Megaphone,
  Camera, Pencil, Check, X,
  Phone, Flag, AlertCircle, Globe, Loader2, Calendar, CreditCard,
} from 'lucide-react'

function Field({ label, value, children }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{label}</span>
      {children || (
        <span className="text-[14px] text-gray-700">
          {value || <span className="text-gray-300 italic">—</span>}
        </span>
      )}
    </div>
  )
}

// Linha de dado pessoal com ícone (só aparece quando o campo está preenchido —
// nada de traços "—" espalhados pela tela).
function InfoRow({ icon: Icon, label, value, children }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-brand/10 flex items-center justify-center shrink-0">
        <Icon size={15} className="text-brand" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider leading-none">{label}</p>
        <p className="text-[14px] font-semibold text-gray-800 mt-1 leading-tight break-words">{value}</p>
      </div>
      {children}
    </div>
  )
}

// Formata CPF/CNPJ para leitura (só exibição — o banco guarda dígitos).
function formatDoc(type, num) {
  const d = String(num || '').replace(/\D/g, '')
  if (type === 'cpf'  && d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  if (type === 'cnpj' && d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  return num
}

// Status do WhatsApp do telefone cadastrado (a plataforma envia avisos
// automáticos por lá). Checa sob demanda via Z-API, sem enviar mensagem.
// Exportado para reuso no ProfileDesktop (mesmo padrão do PlaceInput).
export function WhatsappCheck() {
  const { t } = useTranslation()
  const [status, setStatus]     = useState(undefined) // undefined=carregando · null=nunca checado · true/false
  const [checking, setChecking] = useState(false)
  const [err, setErr]           = useState(null)

  useEffect(() => {
    api.whatsappStatus()
      .then((s) => setStatus(s?.whatsapp_valid ?? null))
      .catch(() => setStatus(null))
  }, [])

  async function verify() {
    if (checking) return
    setChecking(true); setErr(null)
    try {
      const r = await api.verifyWhatsapp()
      setStatus(r?.whatsapp_valid ?? null)
    } catch (e) {
      setErr(e?.message || 'Não foi possível verificar agora.')
    } finally {
      setChecking(false)
    }
  }

  if (status === undefined) return null
  return (
    <div className="flex items-center justify-between gap-2 bg-gray-50 rounded-xl px-3 py-2">
      <div className="flex items-center gap-1.5 min-w-0">
        {status === true  && <span className="text-[12px] font-semibold text-emerald-600">✓ {t('profile.whatsapp.verified')}</span>}
        {status === false && <span className="text-[12px] font-semibold text-red-500">⚠️ {t('profile.whatsapp.noWhatsapp')}</span>}
        {status === null  && <span className="text-[12px] text-gray-500">{t('profile.whatsappUnverified')}</span>}
      </div>
      <button
        onClick={verify}
        disabled={checking}
        className="shrink-0 text-[11px] font-bold text-brand border border-brand/30 rounded-lg px-2.5 py-1 active:scale-95 transition-transform disabled:opacity-50"
      >
        {checking ? t('profile.whatsapp.checking') : status === null ? t('profile.verify') : t('profile.whatsapp.recheck')}
      </button>
      {err && <p className="w-full text-[10px] text-red-500">{err}</p>}
    </div>
  )
}

export default function Profile() {
  const { user, token, logout, updateUser } = useAuth()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const fileRef  = useRef(null)
  const coverRef = useRef(null)

  const avatarKey = `giro_avatar_${user?.id || 'guest'}`
  // Prioridade: URL do banco → fallback localStorage (offline/cache)
  const [avatarUrl,      setAvatarUrl]      = useState(() => user?.profile_photo_url || localStorage.getItem(avatarKey) || null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoError,     setPhotoError]     = useState('')

  const [coverUrl,       setCoverUrl]       = useState(() => user?.cover_photo_url || null)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [coverError,     setCoverError]     = useState('')

  // Hidrata foto e capa a partir do servidor (ex.: primeiro acesso em outro device)
  useEffect(() => {
    if (!token) return
    api.me().then((d) => { if (d?.user) updateUser(d.user) }).catch(() => {})
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setCoverUrl(user?.cover_photo_url || null) }, [user?.cover_photo_url])

  const [editing,   setEditing]   = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [form,      setForm]      = useState({})
  const [emgCheck,    setEmgCheck]    = useState(null)  // WhatsApp do contato de emergência
  const [emgChecking, setEmgChecking] = useState(false)

  const MENU = [
    { icon: CalendarCheck, label: t('profile.menu.bookings'), to: '/minhas-reservas' },
    { icon: Megaphone,     label: 'Divulgou, Ganhou · Afiliado', to: '/afiliado' },
  ]

  const DOC_TYPES = [
    { value: 'cpf',      label: t('profile.docTypes.cpf') },
    { value: 'cnpj',     label: t('profile.docTypes.cnpj') },
    { value: 'passport', label: t('profile.docTypes.passport') },
    { value: 'rg',       label: t('profile.docTypes.rg') },
    { value: 'cnh',      label: t('profile.docTypes.cnh') },
    { value: 'other',    label: t('profile.docTypes.other') },
  ]

  const GENDERS = [
    { value: 'male',              label: t('profile.genders.male') },
    { value: 'female',            label: t('profile.genders.female') },
    { value: 'non_binary',        label: t('profile.genders.non_binary') },
    { value: 'prefer_not_to_say', label: t('profile.genders.prefer_not_to_say') },
  ]

  function startEdit() {
    setForm({
      full_name:               user?.full_name               || '',
      phone:                   user?.phone                   || '',
      birth_date:              user?.birth_date              || '',
      document_type:           user?.document_type           || '',
      document_number:         user?.document_number         || '',
      nationality:             user?.nationality              || '',
      gender:                  user?.gender                  || '',
      emergency_contact_name:  user?.emergency_contact_name  || '',
      emergency_contact_phone: user?.emergency_contact_phone || '',
      emergency_contact_email: user?.emergency_contact_email || '',
    })
    setEditing(true)
  }

  async function checkEmergencyWhatsapp() {
    if (emgChecking) return
    setEmgChecking(true); setEmgCheck(null)
    try {
      const r = await api.checkWhatsapp(form.emergency_contact_phone)
      setEmgCheck(!!r?.exists)
    } catch { setEmgCheck(null) }
    finally { setEmgChecking(false) }
  }

  async function saveEdit() {
    // CPF/CNPJ: valida os dígitos verificadores ANTES de enviar (o servidor
    // também valida — dupla camada contra documento falso/digitado errado).
    const docErr = validateBrDoc(form.document_type, form.document_number)
    if (docErr) { setSaveError(docErr); return }
    setSaving(true)
    setSaveError(null)
    try {
      const payload = { ...form }
      Object.keys(payload).forEach((k) => { if (payload[k] === '') payload[k] = null })
      const data = await api.updateProfile(payload)
      if (data?.user) updateUser(data.user)
      setEditing(false)
    } catch (err) {
      setSaveError(err.message || t('profile.saveError'))
    } finally {
      setSaving(false)
    }
  }

  function handlePhotoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setPhotoError('Use uma imagem JPEG, PNG ou WebP.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setPhotoError('Imagem muito grande. Máximo 2 MB.')
      return
    }

    setPhotoError('')
    const reader = new FileReader()
    reader.onload = (ev) => {
      const img = new Image()
      img.onload = async () => {
        const MAX = 400
        const scale = Math.min(1, MAX / img.width, MAX / img.height)
        const canvas = document.createElement('canvas')
        canvas.width  = Math.round(img.width  * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85)

        setAvatarUrl(dataUrl)
        setUploadingPhoto(true)
        try {
          const data = await api.uploadPhoto(dataUrl)
          if (data?.url) {
            updateUser({ profile_photo_url: data.url })
            localStorage.removeItem(avatarKey)
          }
        } catch (err) {
          setPhotoError(err?.message || 'Erro ao salvar foto no servidor.')
        } finally {
          setUploadingPhoto(false)
        }
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
        setCoverUrl(dataUrl)
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

  async function handleLogout() {
    await api.logout().catch(() => {})
    logout()
    navigate('/')
  }

  const initials = user?.full_name
    ?.split(' ').slice(0, 2).map((n) => n[0]?.toUpperCase()).join('') || 'U'

  const docLabel    = DOC_TYPES.find((d) => d.value === user?.document_type)?.label
  const genderLabel = GENDERS.find((g) => g.value === user?.gender)?.label

  return (
    <>
    <div className="lg:hidden min-h-full bg-[#F8F8F8] pb-24">

      <header className="bg-white px-4 pt-5 pb-3 sticky top-0 lg:top-14 z-40 shadow-[0_1px_3px_rgba(0,0,0,0.04)] lg:max-w-lg lg:mx-auto">
        <div className="relative flex items-center justify-center min-h-[32px]">
          <button
            onClick={() => navigate(-1)}
            className="absolute left-0 w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center active:scale-95 transition-transform"
            aria-label="Voltar"
          >
            <ChevronLeft size={20} className="text-gray-700" />
          </button>
          <h1 className="font-giro font-semibold text-[22px] text-gray-900 tracking-wide">{t('profile.title')}</h1>
        </div>
      </header>

      <main className="px-4 pt-4 space-y-3 max-w-lg mx-auto">

        {token && user ? (
          <>
            {/* Identity card */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              {/* Capa editável */}
              <div className="relative h-24">
                {coverUrl
                  ? <img src={coverUrl} alt="Capa do perfil" className="absolute inset-0 w-full h-full object-cover" />
                  : <div className="absolute inset-0 bg-gradient-to-r from-[#FF6A00] via-[#FF8A3D] to-[#1A4D5F]" />}
                <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" />
                <button
                  onClick={() => !uploadingCover && coverRef.current?.click()}
                  className="absolute top-2 right-2 inline-flex items-center gap-1 bg-black/40 text-white text-[11px] font-semibold px-2.5 py-1 rounded-lg backdrop-blur-sm active:scale-95 transition-transform"
                >
                  {uploadingCover ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
                  {uploadingCover ? 'Enviando…' : 'Capa'}
                </button>
                <input ref={coverRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleCoverChange} />
              </div>

              <div className="px-6 pb-6 -mt-10 flex flex-col items-center text-center">
                <div className="relative mb-4">
                  <div className="w-[88px] h-[88px] rounded-full bg-brand/10 flex items-center justify-center overflow-hidden ring-4 ring-white shadow-md">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="Foto de perfil" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-brand font-bold text-[28px] leading-none select-none">{initials}</span>
                    )}
                  </div>
                  <button
                    onClick={() => !uploadingPhoto && fileRef.current?.click()}
                    className="absolute bottom-0 right-0 w-8 h-8 bg-brand rounded-full flex items-center justify-center shadow-md active:scale-95 transition-transform"
                  >
                    {uploadingPhoto
                      ? <Loader2 size={14} className="text-white animate-spin" />
                      : <Camera size={14} className="text-white" />
                    }
                  </button>
                  <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handlePhotoChange} />
                </div>
                {(photoError || coverError) && (
                  <p className="text-[11px] text-red-500 bg-red-50 rounded-lg px-3 py-1.5 mb-2 w-full text-center">{photoError || coverError}</p>
                )}
                <p className="font-extrabold text-gray-900 text-[18px] leading-tight break-words w-full">{user.full_name}</p>
                <div className="flex items-center gap-1.5 mt-1.5 text-gray-400">
                  <Mail size={12} />
                  <span className="text-[13px] break-all">{user.email}</span>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-orange-50 text-brand">
                    {user.user_type === 'admin' ? 'Admin'
                      : user.user_type === 'operator' ? 'Cooperativa'
                      : user.affiliate_code ? 'Turista · Afiliado' : 'Turista'}
                  </span>
                  {user.whatsapp_valid === true && (
                    <span className="text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-emerald-50 text-emerald-600">
                      ✓ WhatsApp
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Personal data card */}
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-50">
                <span className="font-semibold text-gray-800 text-[14px]">{t('profile.personalData')}</span>
                {!editing ? (
                  <button onClick={startEdit} className="flex items-center gap-1 text-brand text-[13px] font-medium active:opacity-70">
                    <Pencil size={13} /> {t('profile.edit')}
                  </button>
                ) : (
                  <div className="flex items-center gap-3">
                    <button onClick={() => { setEditing(false); setSaveError(null) }} className="text-gray-400 active:opacity-70"><X size={18} /></button>
                    <button
                      onClick={saveEdit}
                      disabled={saving}
                      className="flex items-center gap-1 text-brand text-[13px] font-bold active:opacity-70 disabled:opacity-50"
                    >
                      <Check size={14} /> {saving ? t('profile.saving') : t('profile.save')}
                    </button>
                  </div>
                )}
              </div>

              <div className="px-5 py-4 space-y-4">
                {editing ? (
                  <>
                    {saveError && (
                      <p className="text-[11px] text-red-500 bg-red-50 rounded-xl px-3 py-2 text-center">{saveError}</p>
                    )}
                    <div>
                      <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">{t('profile.fullName')}</label>
                      <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[14px] text-gray-800 focus:outline-none focus:border-brand" value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">{t('profile.phone')}</label>
                      <PhoneInput
                        value={form.phone}
                        onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
                        placeholder={t('profile.phonePlaceholder')}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">{t('profile.birthDate')}</label>
                      <input type="date" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[14px] text-gray-800 focus:outline-none focus:border-brand" value={form.birth_date} onChange={(e) => setForm((f) => ({ ...f, birth_date: e.target.value }))} />
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-shrink-0 w-[120px]">
                        <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">{t('profile.docType')}</label>
                        <select className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[14px] text-gray-800 focus:outline-none focus:border-brand bg-white" value={form.document_type} onChange={(e) => setForm((f) => ({ ...f, document_type: e.target.value }))}>
                          <option value="">—</option>
                          {DOC_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                        </select>
                      </div>
                      <div className="flex-1">
                        <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">{t('profile.docNumber')}</label>
                        <input placeholder={
                          form.document_type === 'cpf'      ? '000.000.000-00'
                          : form.document_type === 'cnpj'   ? '00.000.000/0000-00'
                          : form.document_type === 'passport' ? 'AB123456'
                          : t('profile.docNumberPlaceholder')
                        } className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[14px] text-gray-800 focus:outline-none focus:border-brand" value={form.document_number} onChange={(e) => setForm((f) => ({ ...f, document_number: e.target.value }))} />
                        {(() => {
                          const val = String(form.document_number || '')
                          const digits = val.replace(/\D/g, '')
                          if (form.document_type === 'cpf'  && digits.length < 11) return null
                          if (form.document_type === 'cnpj' && digits.length < 14) return null
                          if (form.document_type === 'passport' && val.trim().length < 5) return null
                          if (!['cpf', 'cnpj', 'passport'].includes(form.document_type)) return null
                          const err = validateBrDoc(form.document_type, val)
                          const label = form.document_type === 'passport' ? 'Passaporte' : form.document_type.toUpperCase()
                          return err
                            ? <p className="text-[11px] text-red-500 mt-1">⚠️ {err}</p>
                            : <p className="text-[11px] text-emerald-600 mt-1">✓ {label} válido</p>
                        })()}
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">{t('profile.nationality')}</label>
                      <input placeholder={t('profile.nationalityPlaceholder')} maxLength={2} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[14px] text-gray-800 focus:outline-none focus:border-brand uppercase" value={form.nationality} onChange={(e) => setForm((f) => ({ ...f, nationality: e.target.value.toUpperCase() }))} />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">{t('profile.gender')}</label>
                      <select className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[14px] text-gray-800 focus:outline-none focus:border-brand bg-white" value={form.gender} onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}>
                        <option value="">—</option>
                        {GENDERS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
                      </select>
                    </div>
                    <div className="pt-1 border-t border-gray-50">
                      <p className="flex items-center gap-1.5 text-[11px] font-bold text-orange-500 mb-2"><AlertCircle size={12} /> {t('profile.emergency')}</p>
                      <div className="space-y-2">
                        <input placeholder={t('profile.emergencyName')} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[14px] text-gray-800 focus:outline-none focus:border-brand" value={form.emergency_contact_name} onChange={(e) => setForm((f) => ({ ...f, emergency_contact_name: e.target.value }))} />
                        <div>
                          <input type="tel" placeholder={t('profile.emergencyPhone')} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[14px] text-gray-800 focus:outline-none focus:border-brand" value={form.emergency_contact_phone} onChange={(e) => { setEmgCheck(null); setForm((f) => ({ ...f, emergency_contact_phone: e.target.value })) }} />
                          {String(form.emergency_contact_phone || '').replace(/\D/g, '').length >= 10 && (
                            <button type="button" onClick={checkEmergencyWhatsapp} disabled={emgChecking}
                              className="mt-1.5 text-[11px] font-bold text-brand disabled:opacity-50">
                              {emgChecking ? 'Verificando…' : 'Verificar WhatsApp deste contato'}
                            </button>
                          )}
                          {emgCheck === true  && <p className="text-[11px] text-emerald-600 mt-1">✓ Este número tem WhatsApp</p>}
                          {emgCheck === false && <p className="text-[11px] text-red-500 mt-1">⚠️ Este número não tem WhatsApp</p>}
                        </div>
                        <input type="email" placeholder="E-mail do contato (opcional)" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[14px] text-gray-800 focus:outline-none focus:border-brand" value={form.emergency_contact_email} onChange={(e) => setForm((f) => ({ ...f, emergency_contact_email: e.target.value }))} />
                      </div>
                    </div>
                  </>
                ) : (() => {
                  // Só mostra o que está preenchido; o que falta vira a barra
                  // de completude (CTA de editar), não um "—" perdido na tela.
                  const filled = [
                    user.phone, user.birth_date, user.document_number,
                    user.nationality, user.gender,
                  ].filter(Boolean).length
                  const pct = Math.round((filled / 5) * 100)
                  const hasAny = filled > 0

                  return (
                    <>
                      {pct < 100 && (
                        <button onClick={startEdit} className="w-full text-left bg-orange-50 rounded-xl px-3.5 py-3 active:scale-[0.99] transition-transform">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[12px] font-bold text-gray-800">Perfil {pct}% completo</span>
                            <span className="text-[11px] font-bold text-brand">Completar →</span>
                          </div>
                          <div className="h-1.5 bg-orange-100 rounded-full overflow-hidden">
                            <div className="h-full bg-brand rounded-full transition-all" style={{ width: `${Math.max(pct, 6)}%` }} />
                          </div>
                          <p className="text-[10.5px] text-gray-500 mt-1.5">
                            Perfil completo agiliza suas reservas e o contato da cooperativa.
                          </p>
                        </button>
                      )}

                      {!hasAny && pct >= 100 ? null : (
                        <div className="space-y-3.5">
                          {user.phone && (
                            <InfoRow icon={Phone} label={t('profile.phone')} value={user.phone} />
                          )}
                          {user.phone && <WhatsappCheck />}
                          {user.birth_date && (
                            <InfoRow icon={Calendar} label={t('profile.birthDate')} value={new Date(user.birth_date + 'T12:00:00').toLocaleDateString()} />
                          )}
                          {user.document_number && (
                            <InfoRow icon={CreditCard} label={docLabel || t('profile.docType')} value={formatDoc(user.document_type, user.document_number)} />
                          )}
                          {user.nationality && (
                            <InfoRow icon={Flag} label={t('profile.nationality')} value={user.nationality} />
                          )}
                          {genderLabel && (
                            <InfoRow icon={User} label={t('profile.gender')} value={genderLabel} />
                          )}
                        </div>
                      )}

                      {(user.emergency_contact_name || user.emergency_contact_phone || user.emergency_contact_email) && (
                        <div className="mt-1 bg-orange-50/60 rounded-xl px-3.5 py-3 space-y-1">
                          <p className="flex items-center gap-1.5 text-[11px] font-bold text-orange-500"><AlertCircle size={12} /> {t('profile.emergency')}</p>
                          <p className="text-[13px] font-semibold text-gray-800">
                            {[user.emergency_contact_name, user.emergency_contact_phone, user.emergency_contact_email].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                      )}
                    </>
                  )
                })()}
              </div>
            </div>
          </>
        ) : (
          /* Guest card */
          <div className="bg-white rounded-2xl p-6 shadow-sm flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <User size={32} className="text-gray-300" />
            </div>
            <p className="font-bold text-gray-800 mb-1">{t('profile.guestTitle')}</p>
            <p className="text-[12px] text-gray-400 mb-5">{t('profile.guestSub')}</p>
            <button onClick={() => navigate('/login')} className="w-full h-11 bg-brand text-white rounded-xl font-bold text-sm active:scale-95 transition-transform mb-2">
              {t('profile.loginBtn')}
            </button>
            <button onClick={() => navigate('/cadastro', { state: { tab: 'register' } })} className="w-full h-11 border border-brand text-brand rounded-xl font-bold text-sm active:scale-95 transition-transform">
              {t('profile.registerBtn')}
            </button>
          </div>
        )}

        {/* Language picker */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
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
                  className={`flex-1 flex flex-col items-center gap-1 py-3 text-[12px] font-semibold transition-colors ${i > 0 ? 'border-l border-gray-50' : ''} ${active ? 'bg-orange-50 text-brand' : 'text-gray-500 active:bg-gray-50'}`}
                >
                  <span className="text-[22px]">{lang.flag}</span>
                  {lang.label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Menu */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
          {MENU.map(({ icon: Icon, label, to }, i) => (
            <button
              key={label}
              onClick={() => to ? navigate(to) : null}
              className={`w-full flex items-center gap-3 px-5 py-3.5 active:bg-gray-50 transition-colors ${i > 0 ? 'border-t border-gray-50' : ''}`}
            >
              <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center shrink-0">
                <Icon size={15} className="text-brand" />
              </div>
              <span className="flex-1 text-[14px] font-medium text-gray-800 text-left">{label}</span>
              <ChevronRight size={15} className="text-gray-300" />
            </button>
          ))}
        </div>

        {/* Logout */}
        {token && (
          <button
            onClick={handleLogout}
            className="w-full bg-white rounded-2xl p-4 shadow-sm flex items-center justify-center gap-2 text-red-500 font-semibold text-[14px] active:bg-red-50 transition-colors"
          >
            <LogOut size={16} /> {t('profile.logout')}
          </button>
        )}

        <p className="text-center text-[11px] text-gray-400 pb-1">
          <Link to="/termos" className="hover:text-brand">Termos de Uso</Link>
          {' · '}
          <Link to="/privacidade" className="hover:text-brand">Privacidade</Link>
        </p>
        <p className="text-center text-[11px] text-gray-300 pb-2">{versionLabel()}</p>
      </main>
    </div>

    <div className="hidden lg:block">
      <ProfileDesktop />
    </div>
    </>
  )
}
