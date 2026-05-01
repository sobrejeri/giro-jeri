import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../lib/api'
import { setLang, LANGS } from '../i18n/index.js'
import {
  User, Mail, LogOut, ChevronRight, CalendarCheck,
  Shield, Bell, HelpCircle, Star, Camera, Pencil, Check, X,
  Phone, Flag, AlertCircle, Globe, Loader2,
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

export default function Profile() {
  const { user, token, logout, updateUser } = useAuth()
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const fileRef  = useRef(null)

  const avatarKey = `giro_avatar_${user?.id || 'guest'}`
  // Prioridade: URL do banco → fallback localStorage (offline/cache)
  const [avatarUrl,      setAvatarUrl]      = useState(() => user?.profile_photo_url || localStorage.getItem(avatarKey) || null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [photoError,     setPhotoError]     = useState('')

  const [editing, setEditing] = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [form,    setForm]    = useState({})

  const MENU = [
    { icon: CalendarCheck, label: t('profile.menu.bookings'),      to: '/minhas-reservas' },
    { icon: Star,          label: t('profile.menu.reviews'),       to: null },
    { icon: Bell,          label: t('profile.menu.notifications'), to: null },
    { icon: Shield,        label: t('profile.menu.privacy'),       to: null },
    { icon: HelpCircle,    label: t('profile.menu.help'),          to: null },
  ]

  const DOC_TYPES = [
    { value: 'cpf',      label: t('profile.docTypes.cpf') },
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
    } catch (err) {
      alert(err.message || t('profile.saveError'))
    } finally {
      setSaving(false)
    }
  }

  function handlePhotoChange(e) {
    const file = e.target.files?.[0]
    if (!file) return

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      alert('Use uma imagem JPEG, PNG ou WebP.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      alert('Imagem muito grande. Máximo 2 MB.')
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
          const data = await api.updateProfile({ profile_photo_url: dataUrl })
          if (data?.user) {
            updateUser({ profile_photo_url: dataUrl })
            localStorage.removeItem(avatarKey)
          } else {
            setPhotoError('Foto salva só neste aparelho. Verifique a conexão.')
            localStorage.setItem(avatarKey, dataUrl)
          }
        } catch (err) {
          setPhotoError(err?.message || 'Erro ao salvar foto no servidor.')
          localStorage.setItem(avatarKey, dataUrl)
        } finally {
          setUploadingPhoto(false)
        }
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
    <div className="min-h-full bg-[#F8F8F8] pb-24">

      <header className="bg-white px-4 pt-6 pb-4 sticky top-0 z-40 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <h1 className="text-xl font-bold text-gray-900">{t('profile.title')}</h1>
      </header>

      <main className="px-4 pt-4 space-y-3 max-w-lg mx-auto">

        {token && user ? (
          <>
            {/* Identity card */}
            <div className="bg-white rounded-2xl p-6 shadow-sm flex flex-col items-center text-center">
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
              {photoError && (
                <p className="text-[11px] text-red-500 bg-red-50 rounded-lg px-3 py-1.5 mb-2 w-full text-center">{photoError}</p>
              )}
              <p className="font-extrabold text-gray-900 text-[18px] leading-tight break-words w-full">{user.full_name}</p>
              <div className="flex items-center gap-1.5 mt-1.5 text-gray-400">
                <Mail size={12} />
                <span className="text-[13px] break-all">{user.email}</span>
              </div>
              {user.role && (
                <span className="mt-3 text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full bg-orange-50 text-brand">
                  {user.role === 'admin' ? t('profile.roleAdmin') : user.role === 'driver' ? t('profile.roleDriver') : t('profile.roleClient')}
                </span>
              )}
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
                    <button onClick={() => setEditing(false)} className="text-gray-400 active:opacity-70"><X size={18} /></button>
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
                    <div>
                      <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">{t('profile.fullName')}</label>
                      <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[14px] text-gray-800 focus:outline-none focus:border-brand" value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} />
                    </div>
                    <div>
                      <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1 block">{t('profile.phone')}</label>
                      <input type="tel" placeholder={t('profile.phonePlaceholder')} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[14px] text-gray-800 focus:outline-none focus:border-brand" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
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
                        <input placeholder={t('profile.docNumberPlaceholder')} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[14px] text-gray-800 focus:outline-none focus:border-brand" value={form.document_number} onChange={(e) => setForm((f) => ({ ...f, document_number: e.target.value }))} />
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
                        <input type="tel" placeholder={t('profile.emergencyPhone')} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-[14px] text-gray-800 focus:outline-none focus:border-brand" value={form.emergency_contact_phone} onChange={(e) => setForm((f) => ({ ...f, emergency_contact_phone: e.target.value }))} />
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <Field label={t('profile.phone')} value={user.phone && <span className="flex items-center gap-1"><Phone size={11} className="text-gray-400" />{user.phone}</span>} />
                      <Field label={t('profile.birthDate')} value={user.birth_date ? new Date(user.birth_date + 'T12:00:00').toLocaleDateString() : null} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <Field label={t('profile.docType')} value={docLabel && user.document_number ? `${docLabel}: ${user.document_number}` : (docLabel || user.document_number)} />
                      <Field label={t('profile.nationality')} value={user.nationality && <span className="flex items-center gap-1"><Flag size={11} className="text-gray-400" />{user.nationality}</span>} />
                    </div>
                    <Field label={t('profile.gender')} value={genderLabel} />
                    {(user.emergency_contact_name || user.emergency_contact_phone) && (
                      <div className="pt-2 border-t border-gray-50 space-y-1">
                        <p className="flex items-center gap-1.5 text-[11px] font-bold text-orange-500"><AlertCircle size={12} /> {t('profile.emergency')}</p>
                        <Field label={t('profile.emergencyName')} value={user.emergency_contact_name} />
                        <Field label={t('profile.emergencyPhone')} value={user.emergency_contact_phone} />
                      </div>
                    )}
                  </>
                )}
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

        <p className="text-center text-[11px] text-gray-300 pb-2">{t('profile.version')}</p>
      </main>
    </div>
  )
}
