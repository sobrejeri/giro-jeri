import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Route, ImagePlus, X, Car, Users } from 'lucide-react'
import { api } from '../lib/api'
import { PageSpinner } from '../components/ui/Spinner'
import Button from '../components/ui/Button'
import Modal from '../components/ui/Modal'
import Input, { Select, Textarea } from '../components/ui/Input'
import Card, { CardHeader, CardBody } from '../components/ui/Card'
import Badge from '../components/ui/Badge'

// Horários pré-definidos para o limite de solicitação (30 em 30 min, 06h–22h).
// Categorias de um passeio: o array da 083 quando existe, senão a categoria
// única de sempre. Filtro e contagem precisam achar o passeio por QUALQUER uma
// delas — senão marcar duas categorias sumiria com ele de uma das listas.
const catsDoPasseio = (t) => (t.category_ids?.length ? t.category_ids : (t.category_id ? [t.category_id] : []))
const temCategoria  = (t, id) => catsDoPasseio(t).includes(id)

const CUTOFF_TIME_OPTIONS = (() => {
  const opts = []
  for (let h = 6; h <= 22; h++) {
    for (const m of ['00', '30']) {
      if (h === 22 && m === '30') break
      opts.push(`${String(h).padStart(2, '0')}:${m}`)
    }
  }
  return opts
})()

function slugify(text) {
  return text.toString().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    + '-' + Date.now().toString(36)
}

// Redimensiona uma imagem no navegador. Mantém transparência para PNG/WEBP/GIF
// (saída PNG); os demais formatos (JPEG, HEIC do iPhone…) viram JPEG.
function fileToResizedDataUrl(file, max = 1280, quality = 0.82) {
  const keepAlpha = /png|webp|gif/i.test(file.type || '')
  const outType   = keepAlpha ? 'image/png' : 'image/jpeg'
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = (ev) => {
      const img = new Image()
      img.onerror = reject
      img.onload = () => {
        const scale  = Math.min(1, max / img.width)
        const canvas = document.createElement('canvas')
        canvas.width  = Math.round(img.width  * scale)
        canvas.height = Math.round(img.height * scale)
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL(outType, quality))
      }
      img.src = ev.target.result
    }
    reader.readAsDataURL(file)
  })
}

const TOUR_EMPTY = {
  category_id: '',
  category_ids: [],
  name: '', short_description: '', duration_hours: 2, max_people: 10,
  is_private_enabled: true, is_shared_enabled: false,
  shared_price_per_person: '', cover_image_url: '', is_active: true,
  latitude: null, longitude: null, service_radius_km: null,
  booking_cutoff_time: '', min_advance_hours: '', service_window_start: '', service_window_end: '',
  region_ids: [], is_featured: false, display_order: 0,
  is_exclusive: false,
}
const TRANSFER_EMPTY = {
  name: '', short_description: '', pricing_mode: 'fixed_route', is_active: true,
  is_exclusive: false, modal: 'terrestre',
  latitude: null, longitude: null, service_radius_km: null,
  booking_cutoff_time: '', min_advance_hours: '', service_window_start: '', service_window_end: '', region_ids: [],
}
const ROUTE_EMPTY   = { transfer_id: '', origin_name: '', destination_name: '', default_price: '', cover_image_url: '', is_active: true, is_featured: false }
// Categoria de PASSEIO — o equivalente ao que `transfers` faz nos translados:
// agrupa e, marcada, vira carrossel próprio no app. Só o essencial para criar:
// nome, descrição, ordem e as duas caixas.
const CATEGORY_EMPTY = {
  name: '', description: '', is_active: true, is_exclusive: false,
  sort_order: 0, category_type: 'tour', modal: 'terrestre',
}
const VEHICLE_EMPTY = {
  name: '', vehicle_type: 'buggy', description: '', modal: 'terrestre',
  seat_capacity: 4, luggage_capacity: 4,
  is_private_allowed: true, is_shared_allowed: false,
  is_transfer_allowed: false, is_tour_allowed: true,
  is_active: true,
  latitude: null, longitude: null, service_radius_km: null,
  region_ids: [],
}

// Modal (migrations 073 e 074). O segundo eixo da frota: cruzado com "serve
// para passeio / para transfer", dá as combinações reais do negócio — passeio
// terrestre, passeio aéreo, passeio aquático, e o mesmo nos translados.
// O veículo só é oferecido em serviço do MESMO modal, e quem define o modal do
// serviço é a categoria dele.
// A lista de modais vem do BANCO (migration 075), não daqui. Enquanto ela não
// carrega — ou se a 075 ainda não rodou — estes três seguram a tela para o
// select nunca aparecer vazio.
const MODAIS_PADRAO = [
  { slug: 'terrestre', name: 'Terrestre' },
  { slug: 'aereo',     name: 'Aéreo' },
  { slug: 'aquatico',  name: 'Aquático' },
]
const MODAL_EMPTY = {
  name: '', description: '', is_active: true, sort_order: 99,
  // Executor fixo (078): uma empresa executa TODO serviço deste meio, e quem
  // aceitar fica só com a comissão. Vazio = comportamento normal.
  executor_operator_id: '', acceptor_commission_pct: 0, platform_commission_pct: '',
}

// Simulação do rateio — os mesmos números que o pagamento usaria. Existe para o
// dono VER antes de ligar: o split de N recebedores do Mercado Pago nunca foi
// validado, e aqui o valor é alto.
function simularRateio(total, aceitePct, plataformaPct, comExecutor, executorAceitou) {
  const cent = Math.round(Number(total || 0) * 100)
  const plat = Number(plataformaPct) || 0
  const aceite = comExecutor && !executorAceitou ? (Number(aceitePct) || 0) : 0
  const pesos = comExecutor
    ? [aceite, plat, 100 - aceite - plat]
    : [plat, 100 - plat]
  const soma = pesos.reduce((a, b) => a + b, 0) || 1
  const bruto = pesos.map((w) => (cent * w) / soma)
  const cents = bruto.map((x) => Math.floor(x))
  const resto = cent - cents.reduce((a, b) => a + b, 0)
  const ordem = bruto.map((x, i) => ({ i, f: x - Math.floor(x) })).sort((a, b) => b.f - a.f)
  for (let k = 0; k < resto; k++) cents[ordem[k % cents.length].i] += 1
  const rotulos = comExecutor
    ? ['Quem aceitou', 'Plataforma', 'Quem executou']
    : ['Plataforma', 'Quem aceitou (executa)']
  return rotulos.map((r, i) => ({ rotulo: r, valor: cents[i] / 100 })).filter((x) => x.valor > 0)
}

const VEHICLE_TYPES = [
  { value: 'buggy',      label: 'Buggy' },
  { value: 'jardineira', label: 'Jardineira' },
  { value: 'hilux_4x4', label: 'Hilux 4x4' },
  { value: 'boat',       label: 'Barco' },
  { value: 'van',        label: 'Van' },
  { value: 'sedan',      label: 'Sedan' },
  { value: 'suv',        label: 'SUV' },
  { value: 'other',      label: 'Outro' },
]

const TABS = [
  { key: 'tours',    label: 'Passeios'  },
  { key: 'transfers', label: 'Transfers' },
  { key: 'vehicles', label: 'Veículos'  },
]

export default function Catalogo() {
  const [tab, setTab]       = useState('tours')
  const [modal, setModal]   = useState(null)
  const [form, setForm]     = useState({})
  const [routeModal, setRouteModal] = useState(null)
  const [catModal, setCatModal] = useState(null)
  const [catForm, setCatForm]   = useState({})
  const [modalModal, setModalModal] = useState(null)   // cadastro de MODAL
  const [modalForm, setModalForm]   = useState({})
  const [mostrarAvancado, setMostrarAvancado] = useState(false)
  const [routeForm, setRouteForm]   = useState({})
  const [vehicleModal, setVehicleModal] = useState(null)
  const [vehicleForm, setVehicleForm]   = useState({})
  const [imageFile, setImageFile]   = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [soSemFoto, setSoSemFoto]                = useState(false)
  const [tipoRota, setTipoRota]                  = useState('todos')
  const [catPasseio, setCatPasseio]              = useState('todos')
  const [routeImageFile, setRouteImageFile]       = useState(null)
  const [routeImagePreview, setRouteImagePreview] = useState(null)
  const [vehicleImageFile, setVehicleImageFile]   = useState(null)
  const [vehicleImagePreview, setVehicleImagePreview] = useState(null)
  const [uploading, setUploading]   = useState(false)
  const [filterRegion, setFilterRegion] = useState(null)
  const fileRef        = useRef(null)
  const routeFileRef   = useRef(null)
  const vehicleFileRef = useRef(null)
  const qc = useQueryClient()

  const { data: regionData } = useQuery({
    queryKey: ['regions'],
    queryFn:  () => api.getRegions(),
  })
  const regionId = regionData?.[0]?.id
  const allRegions = Array.isArray(regionData) ? regionData.filter((r) => r.is_active) : []

  const { data: tours = [], isLoading: l1 } = useQuery({
    queryKey: ['admin-tours'],
    queryFn:  () => api.getTours(),
  })
  const { data: transfers = [], isLoading: l2 } = useQuery({
    queryKey: ['admin-transfers'],
    queryFn:  () => api.getTransfers().then((r) => r.data || r),
  })
  const { data: routes = [], isLoading: l3 } = useQuery({
    queryKey: ['admin-routes'],
    queryFn:  () => api.getTransferRoutes(),
  })

  // Filtro por tipo de translado (terrestre, aéreo…). Sem ele as 34 rotas
  // ficam num monte só e não dá para saber o que é o quê.
  const rotasDoTipo = tipoRota === 'todos'
    ? routes
    : routes.filter((r) => r.transfer_id === tipoRota)

  // Contadores seguem o tipo escolhido — senão o cabeçalho falaria de rotas que
  // nem estão na tela.
  const rotasComFoto  = rotasDoTipo.filter((r) => r.cover_image_url).length
  const rotasSemFoto  = rotasDoTipo.length - rotasComFoto
  const rotasVisiveis = soSemFoto ? rotasDoTipo.filter((r) => !r.cover_image_url) : rotasDoTipo
  const { data: vehicles = [], isLoading: l4 } = useQuery({
    queryKey: ['vehicles'],
    queryFn:  () => api.getVehicles(),
  })

  // Modais de operação. Cadastráveis (075); a API já devolve os três padrões
  // se a migration ainda não rodou, então a tela nunca fica sem opção.
  const { data: modaisBrutos } = useQuery({
    queryKey: ['admin-modals'],
    queryFn:  () => api.getModals(),
  })
  // Operadores para escolher o executor fixo do modal.
  const { data: usuariosOp } = useQuery({
    queryKey: ['admin-operators-para-modal'],
    queryFn:  () => api.getUsers({ user_type: 'operator', limit: 200 }),
  })
  const operadores = (usuariosOp?.data || usuariosOp || [])
    .filter((u) => u?.id && u.is_active !== false)
  const modais = (Array.isArray(modaisBrutos) && modaisBrutos.length ? modaisBrutos : MODAIS_PADRAO)
  const modaisAtivos = modais.filter((m) => m.is_active !== false)
  // Nome do modal para exibir; cai no slug se o cadastro sumiu.
  const nomeDoModal = (slug) => modais.find((m) => m.slug === slug)?.name || slug || '—'

  // Categorias de PASSEIO. `category_type` só ganhou padrão na migration 071;
  // linha antiga vem nula e continua sendo de passeio (é o único uso da tabela).
  const { data: categoriasBrutas = [] } = useQuery({
    queryKey: ['admin-categories'],
    queryFn:  () => api.getCategories(),
  })
  const categorias = (Array.isArray(categoriasBrutas) ? categoriasBrutas : [])
    .filter((c) => !c.category_type || c.category_type === 'tour')
  // Desativada some da lista, mas continua no <select> se algum passeio ainda
  // aponta para ela — senão editar esse passeio apagaria a categoria em silêncio.
  const categoriasAtivas = categorias.filter((c) => c.is_active)
  const passeiosPorCategoria = (id) => tours.filter((t) => temCategoria(t, id)).length

  const byRegion = (item) => !filterRegion || (item.region_ids || []).includes(filterRegion)
  const filteredTours     = tours.filter(byRegion)
  const passeiosVisiveis =
    catPasseio === 'todos' ? filteredTours
      : catPasseio === '__sem' ? filteredTours.filter((t) => catsDoPasseio(t).length === 0)
      : filteredTours.filter((t) => temCategoria(t, catPasseio))
  const filteredTransfers = transfers.filter(byRegion)
  const filteredVehicles  = vehicles.filter(byRegion)

  function RegionTags({ ids }) {
    if (!ids?.length) return null
    const names = ids.map((id) => allRegions.find((r) => r.id === id)?.name).filter(Boolean)
    if (!names.length) return null
    return <span className="text-[10px] text-brand/60 ml-1">{names.join(' · ')}</span>
  }

  /* ── Tour mutations ──────────────────────────────────────── */
  const tourMut = useMutation({
    mutationFn: (body) =>
      modal?.isNew ? api.createTour(body) : api.updateTour(modal.id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-tours'] }); setModal(null) },
    // Sem isto, falha ao salvar passeio não dizia nada: o modal ficava aberto e
    // parecia que o botão não tinha funcionado.
    onError:   (err) => alert(err?.message || 'Erro ao salvar o passeio.'),
  })
  const deleteTourMut = useMutation({
    mutationFn: (id) => api.deleteTour(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['admin-tours'] }),
    // Sem isto o 409 ("tem reservas, desative") morria em silêncio: o clique
    // não fazia nada visível e parecia que a tela tinha travado.
    onError:    (err) => alert(err?.message || 'Não foi possível apagar o passeio.'),
  })

  /* ── Modal (meio de operação) mutations ──────────────────── */
  const modalMut = useMutation({
    mutationFn: (body) =>
      modalModal?.isNew ? api.createModal(body) : api.updateModal(modalModal.id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-modals'] })
      setModalModal(null)
    },
    onError: (err) => alert(err?.message || 'Erro ao salvar o modal.'),
  })
  const deleteModalMut = useMutation({
    mutationFn: (id) => api.deleteModal(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['admin-modals'] }),
    // A API recusa remover modal em uso e diz quem usa — a mensagem é útil.
    onError:    (err) => alert(err?.message || 'Erro ao remover o modal.'),
  })

  /* ── Category mutations ──────────────────────────────────── */
  const catMut = useMutation({
    mutationFn: (body) =>
      catModal?.isNew ? api.createCategory(body) : api.updateCategory(catModal.id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-categories'] })
      // O passeio guarda `category_id`; a lista precisa recarregar para o
      // nome novo aparecer no cartão.
      qc.invalidateQueries({ queryKey: ['admin-tours'] })
      setCatModal(null)
    },
    onError: (err) => alert(err?.message || 'Erro ao salvar a categoria.'),
  })
  const deleteCatMut = useMutation({
    mutationFn: (id) => api.deleteCategory(id),
    onSuccess:  () => {
      qc.invalidateQueries({ queryKey: ['admin-categories'] })
      qc.invalidateQueries({ queryKey: ['admin-tours'] })
    },
    onError: (err) => alert(err?.message || 'Não foi possível apagar a categoria.'),
  })

  /* ── Transfer mutations ──────────────────────────────────── */
  const transferMut = useMutation({
    mutationFn: (body) =>
      modal?.isNew ? api.createTransfer(body) : api.updateTransfer(modal.id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-transfers'] }); setModal(null) },
    onError:   (err) => alert(err?.message || 'Erro ao salvar o transfer.'),
  })
  const routeMut = useMutation({
    mutationFn: (body) =>
      routeModal?.isNew ? api.createTransferRoute(body) : api.updateTransferRoute(routeModal.id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-routes'] }); setRouteModal(null) },
    onError:   (err) => alert(err?.message || 'Erro ao salvar a rota.'),
  })
  const deleteRouteMut = useMutation({
    mutationFn: (id) => api.deleteTransferRoute(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['admin-routes'] }),
    onError:    (err) => alert(err?.message || 'Não foi possível apagar a rota.'),
  })

  /* ── Vehicle mutations ───────────────────────────────────── */
  const vehicleMut = useMutation({
    mutationFn: (body) =>
      vehicleModal?.isNew
        ? api.createVehicle(body)
        : api.updateVehicle(vehicleModal.id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['vehicles'] }); setVehicleModal(null) },
    onError:   (err) => alert(`Erro ao salvar veículo: ${err.message}`),
  })
  const deleteVehicleMut = useMutation({
    mutationFn: (id) => api.deleteVehicle(id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['vehicles'] }),
    onError:    (err) => alert(err?.message || 'Não foi possível apagar o veículo.'),
  })

  /* ── Open/close handlers ─────────────────────────────────── */
  function openNewTour() {
    setForm(TOUR_EMPTY); setImageFile(null); setImagePreview(null)
    setModal({ isNew: true })
  }
  function openEditTour(t) {
    setForm({
      ...t,
      region_ids: t.region_ids || [],
      // Passeio salvo antes da 083 só tem a categoria única — vira o array.
      category_ids: (t.category_ids?.length ? t.category_ids : (t.category_id ? [t.category_id] : [])),
    }); setImageFile(null); setImagePreview(t.cover_image_url || null)
    setModal(t)
  }
  function openNewModal()   { setModalForm(MODAL_EMPTY); setModalModal({ isNew: true }) }
  function openEditModal(m) { setModalForm({ ...MODAL_EMPTY, ...m }); setModalModal(m) }
  function handleModalSubmit(e) {
    e.preventDefault()
    if (!modalForm.name?.trim()) { alert('Informe o nome do modal.'); return }
    modalMut.mutate({
      name:        modalForm.name.trim(),
      description: modalForm.description || null,
      is_active:   !!modalForm.is_active,
      sort_order:  Number(modalForm.sort_order) || 99,
      executor_operator_id:    modalForm.executor_operator_id || null,
      // A % DA PLATAFORMA vale sempre (079): com a plataforma recebendo 100%, é
      // ela que define o que sobra de comissão para quem aceitou. Vazio = cai na
      // geral (`payment_split_admin_pct`).
      platform_commission_pct: modalForm.platform_commission_pct !== '' && modalForm.platform_commission_pct != null
                                 ? Number(modalForm.platform_commission_pct) : null,
      // A % DE QUEM ACEITA também vale sempre (082): com ela acima de zero, o
      // resto vira repasse para quem executou, mesmo sem executor fixo — é o
      // motorista que o operador declara na conclusão que recebe.
      acceptor_commission_pct: Number(modalForm.acceptor_commission_pct) || 0,
    })
  }

  // Categoria tem MODAL PRÓPRIO (`catModal`), separado do modal de passeio /
  // categoria-de-translado que compartilha `modal`+`form`. São formulários
  // diferentes; misturá-los já causou confusão de campo antes.
  function openNewCategory()   { setCatForm(CATEGORY_EMPTY); setCatModal({ isNew: true }) }
  function openEditCategory(c) { setCatForm({ ...CATEGORY_EMPTY, ...c }); setCatModal(c) }
  function handleCategorySubmit(e) {
    e.preventDefault()
    if (!catForm.name?.trim()) { alert('Informe o nome da categoria.'); return }
    catMut.mutate({
      name:          catForm.name.trim(),
      description:   catForm.description || null,
      is_active:     !!catForm.is_active,
      is_exclusive:  !!catForm.is_exclusive,
      sort_order:    Number(catForm.sort_order) || 0,
      category_type: 'tour',
    })
  }

  function openNewTransfer()   { setForm(TRANSFER_EMPTY); setModal({ isNew: true, _type: 'transfer' }) }
  function openEditTransfer(t) { setForm({ ...t, region_ids: t.region_ids || [] }); setModal({ ...t, _type: 'transfer' }) }
  function openNewRoute() {
    // Pré-seleciona quando só existe um tipo: evita obrigar a escolher o óbvio.
    setRouteForm({ ...ROUTE_EMPTY, transfer_id: transfers.length === 1 ? transfers[0].id : '' })
    setRouteImageFile(null); setRouteImagePreview(null)
    setRouteModal({ isNew: true })
  }
  function openEditRoute(r) {
    setRouteForm({ ...r })
    setRouteImageFile(null); setRouteImagePreview(r.cover_image_url || null)
    setRouteModal(r)
  }

  function openNewVehicle() {
    setVehicleForm(VEHICLE_EMPTY)
    setVehicleImageFile(null); setVehicleImagePreview(null)
    setVehicleModal({ isNew: true })
  }
  function openEditVehicle(v) {
    setVehicleForm({ ...v, region_ids: v.region_ids || [] })
    setVehicleImageFile(null); setVehicleImagePreview(v.image_url || null)
    setVehicleModal(v)
  }

  /* ── Image handling ──────────────────────────────────────── */
  function handleFileChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  function handleRouteFileChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setRouteImageFile(file)
    setRouteImagePreview(URL.createObjectURL(file))
  }

  function handleVehicleFileChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setVehicleImageFile(file)
    setVehicleImagePreview(URL.createObjectURL(file))
  }

  async function uploadImage(file, folder = 'tours') {
    // Converte qualquer formato (inclui HEIC do iPhone) para JPEG redimensionado
    // e envia em base64. Evita o bucket rejeitar formatos não suportados.
    const dataUrl = await fileToResizedDataUrl(file, 1280)
    const result  = await api.uploadSiteImage(dataUrl, folder)
    return result?.url || (typeof result === 'string' ? result : null)
  }

  /* ── Submit handlers ─────────────────────────────────────── */
  async function handleTourSubmit(e) {
    e.preventDefault()
    let body = {
      ...form,
      duration_hours: Number(form.duration_hours),
      max_people:     Number(form.max_people),
      display_order:  Number(form.display_order) || 0,
      is_featured:    !!form.is_featured,
    }
    if (modal?.isNew) {
      body.slug      = slugify(form.name)
      body.region_id = regionId
    }
    body.region_ids = form.region_ids || []
    if (imageFile) {
      setUploading(true)
      try { body.cover_image_url = await uploadImage(imageFile, 'tours') }
      catch { alert('Erro ao fazer upload da imagem'); setUploading(false); return }
      setUploading(false)
    }
    tourMut.mutate(body)
  }

  function handleTransferSubmit(e) {
    e.preventDefault()
    // Remove objetos de relação (joins) e campos read-only antes de salvar
    const { transfer_routes: _tr, regions: _rg, id: _id, created_at: _ca, updated_at: _ua, ...clean } = form
    transferMut.mutate(clean)
  }

  async function handleRouteSubmit(e) {
    e.preventDefault()
    if (!routeForm.transfer_id) { alert('Escolha a categoria da rota.'); return }
    const body = { ...routeForm, default_price: Number(routeForm.default_price) }
    if (routeImageFile) {
      try { body.cover_image_url = await uploadImage(routeImageFile, 'routes') }
      catch (err) { alert('Erro ao enviar a foto: ' + (err?.message || 'tente novamente')); return }
    }
    // Remove joins/campos read-only vindos do SELECT (o id do registro a
    // atualizar vem de routeModal.id, não do corpo).
    const { transfers: _t, id: _id, created_at: _ca, updated_at: _ua, ...clean } = body
    routeMut.mutate(clean)
  }

  async function handleVehicleSubmit(e) {
    e.preventDefault()

    if (!regionId) {
      alert('Nenhuma região encontrada. Execute o SQL de seed (migrations/005_seed_dados_reais.sql) no Supabase antes de criar veículos.')
      return
    }

    // Remove campos que não são colunas da tabela (joins, metadados auto)
    const { regions: _r, id: _id, created_at: _ca, updated_at: _ua, ...cleanForm } = vehicleForm
    let body = {
      ...cleanForm,
      seat_capacity:    Number(vehicleForm.seat_capacity),
      luggage_capacity: Number(vehicleForm.luggage_capacity) || 0,
      region_id:        regionId,
      region_ids:       vehicleForm.region_ids || [],
    }
    if (vehicleModal?.isNew) {
      body.slug = slugify(vehicleForm.name)
    }
    if (vehicleImageFile) {
      setUploading(true)
      try {
        body.image_url = await uploadImage(vehicleImageFile, 'vehicles')
      } catch {
        // Upload falhou — salva sem imagem
        console.warn('Upload de imagem falhou, salvando sem imagem')
      }
      setUploading(false)
    }
    vehicleMut.mutate(body)
  }

  function CidadesSelector({ value, onChange }) {
    const selected  = value || []
    const available = allRegions.filter((r) => !selected.includes(r.id))
    return (
      <div>
        <p className="text-xs font-medium text-gray-400 mb-2">
          Municípios de atuação
          <span className="ml-1 font-normal text-gray-600">(onde o serviço aparece no app)</span>
        </p>
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {selected.map((id) => {
              const r = allRegions.find((r) => r.id === id)
              if (!r) return null
              return (
                <span key={id} className="inline-flex items-center gap-1 bg-brand/20 text-brand text-xs font-medium px-2.5 py-1 rounded-full">
                  {r.name}
                  <button type="button" onClick={() => onChange(selected.filter((x) => x !== id))} className="ml-0.5 text-brand/60 hover:text-brand">
                    <X size={11} />
                  </button>
                </span>
              )
            })}
          </div>
        )}
        {available.length > 0 ? (
          <select
            className="w-full bg-[#1a1a2e] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-400 focus:outline-none focus:border-brand"
            value=""
            onChange={(e) => { if (e.target.value) onChange([...selected, e.target.value]) }}
          >
            <option value="">+ Adicionar município…</option>
            {available.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        ) : selected.length > 0 ? (
          <p className="text-xs text-gray-600">Todos os municípios adicionados</p>
        ) : (
          <p className="text-xs text-gray-600">Nenhum município disponível</p>
        )}
      </div>
    )
  }

  const isTransferModal = modal?._type === 'transfer'
  const loading = l1 || l2
  if (loading) return <PageSpinner />

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex gap-1 bg-gray-800 p-1 rounded-xl w-fit">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-gray-700 text-gray-100 shadow-sm' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filtro por município */}
      {allRegions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setFilterRegion(null)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              !filterRegion ? 'bg-brand text-white border-brand' : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
            }`}
          >
            Todos
          </button>
          {allRegions.map((r) => (
            <button
              key={r.id}
              onClick={() => setFilterRegion(filterRegion === r.id ? null : r.id)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                filterRegion === r.id ? 'bg-brand text-white border-brand' : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
              }`}
            >
              {r.name}
            </button>
          ))}
        </div>
      )}

      {/* ── Tours ──────────────────────────────────────────────── */}
      {tab === 'tours' && (
        <>
        {/* Mesma lógica das categorias de translado: a categoria agrupa os
            passeios e, marcada, vira um carrossel próprio no app com o nome
            dela de título. */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-300">Categorias ({categorias.length})</h2>
              <Button size="sm" onClick={openNewCategory}><Plus size={14} /> Nova Categoria</Button>
            </div>
          </CardHeader>
          <div className="divide-y divide-gray-800">
            {categorias.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-5 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-200">{c.name}</p>
                  <p className="text-xs text-gray-500">
                    {passeiosPorCategoria(c.id)} passeio{passeiosPorCategoria(c.id) === 1 ? '' : 's'}
                    {c.is_exclusive && <span className="text-brand/80"> · Carrossel próprio</span>}
                  </p>
                </div>
                <Badge value={String(c.is_active)} />
                <div className="flex gap-1">
                  <button onClick={() => openEditCategory(c)} className="p-1.5 text-gray-600 hover:text-gray-300 hover:bg-gray-700 rounded-lg">
                    <Pencil size={13} />
                  </button>
                  {c.is_active && (
                    <button
                      onClick={() => confirm(`Apagar a categoria "${c.name}"?\n\nSó é possível se ela não tiver nenhum passeio.`) && deleteCatMut.mutate(c.id)}
                      className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-900/20 rounded-lg"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {categorias.length === 0 && (
              <CardBody>
                <p className="text-sm text-gray-600">Nenhuma categoria.</p>
                <p className="text-xs text-gray-700 mt-1">
                  Sem categoria os passeios continuam na lista comum do app. Crie uma para separá-los em carrossel próprio.
                </p>
              </CardBody>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-300">
                Passeios ({passeiosVisiveis.length}{passeiosVisiveis.length !== tours.length ? `/${tours.length}` : ''})
              </h2>
              <Button size="sm" onClick={openNewTour}><Plus size={14} /> Novo Passeio</Button>
            </div>

            {/* Separação por categoria — mesma barra das rotas. Só com 1+
                categoria: sem nenhuma, seria um botão sozinho sem função. */}
            {categoriasAtivas.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {[{ id: 'todos', name: `Todos (${filteredTours.length})` },
                  ...categoriasAtivas.map((c) => ({
                    id: c.id,
                    name: `${c.name} (${filteredTours.filter((t) => temCategoria(t, c.id)).length})`,
                  })),
                  { id: '__sem', name: `Sem categoria (${filteredTours.filter((t) => catsDoPasseio(t).length === 0).length})` },
                ].map((op) => (
                  <button
                    key={op.id}
                    onClick={() => setCatPasseio(op.id)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                      catPasseio === op.id
                        ? 'bg-brand/15 border-brand/60 text-brand'
                        : 'border-gray-700 text-gray-400 hover:text-gray-200'
                    }`}
                  >
                    {op.name}
                  </button>
                ))}
              </div>
            )}
          </CardHeader>
          <div className="divide-y divide-gray-800">
            {passeiosVisiveis.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-5 py-3">
                {t.cover_image_url ? (
                  <img src={t.cover_image_url} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                ) : (
                  <div className="w-10 h-10 rounded-lg bg-gray-700 shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-200">{t.name}</p>
                  <p className="text-xs text-gray-500">
                    {t.duration_hours}h · cap. {t.max_people}
                    {t.is_private_enabled && ' · Privativo'}
                    {t.is_shared_enabled && ' · Compartilhado'}
                    {/* Nome da categoria direto na linha: sem isto só dava para
                        saber a que grupo o passeio pertence abrindo a edição. */}
                    {t.categories?.name && <span className="text-brand/70"> · {t.categories.name}</span>}
                    <RegionTags ids={t.region_ids} />
                  </p>
                </div>
                <Badge value={String(t.is_active)} />
                <div className="flex gap-1">
                  <button onClick={() => openEditTour(t)} className="p-1.5 text-gray-600 hover:text-gray-300 hover:bg-gray-700 rounded-lg">
                    <Pencil size={13} />
                  </button>
                  <button
                    onClick={() => confirm(`Apagar o passeio "${t.name}"?\n\nNão tem como desfazer. Passeio com reservas ou avaliações é recusado — nesse caso, desative pelo editar.`) && deleteTourMut.mutate(t.id)}
                    className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-900/20 rounded-lg"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
            {passeiosVisiveis.length === 0 && (
              <CardBody><p className="text-sm text-gray-600">
                {catPasseio !== 'todos' ? 'Nenhum passeio nesta categoria'
                  : filterRegion ? 'Nenhum passeio neste município' : 'Nenhum passeio'}
              </p></CardBody>
            )}
          </div>
        </Card>
        </>
      )}

      {/* ── Transfers ──────────────────────────────────────────── */}
      {tab === 'transfers' && (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                {/* "Categoria" e não "Transfer": é o que agrupa as rotas e vira um
                    carrossel no app. O nome antigo descrevia a implementação
                    (o serviço-pai), não o que a coisa faz. */}
                <h2 className="text-sm font-semibold text-gray-300">Categorias ({filteredTransfers.length}{filterRegion ? `/${transfers.length}` : ''})</h2>
                <Button size="sm" onClick={openNewTransfer}><Plus size={14} /> Nova Categoria</Button>
              </div>
            </CardHeader>
            <div className="divide-y divide-gray-800">
              {filteredTransfers.map((t) => (
                <div key={t.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-200">{t.name}</p>
                    <p className="text-xs text-gray-500">{t.pricing_mode}<RegionTags ids={t.region_ids} /></p>
                  </div>
                  <Badge value={String(t.is_active)} />
                  <button onClick={() => openEditTransfer(t)} className="p-1.5 text-gray-600 hover:text-gray-300 hover:bg-gray-700 rounded-lg">
                    <Pencil size={13} />
                  </button>
                </div>
              ))}
              {filteredTransfers.length === 0 && <CardBody><p className="text-sm text-gray-600">{filterRegion ? 'Nenhum transfer neste município' : 'Nenhum transfer'}</p></CardBody>}
            </div>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Route size={16} className="text-gray-500" />
                  <h2 className="text-sm font-semibold text-gray-300">
                    Rotas Tabeladas ({rotasDoTipo.length}{tipoRota !== 'todos' ? `/${routes.length}` : ''})
                  </h2>
                  {/* Com dezenas de rotas, "quantas faltam" é mais útil do que
                      conferir uma a uma percorrendo a lista. */}
                  {rotasDoTipo.length > 0 && (
                    <span className="text-xs text-gray-500">
                      · {rotasComFoto} com foto
                      {rotasSemFoto > 0 && <span className="text-amber-500/90"> · {rotasSemFoto} sem</span>}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {rotasSemFoto > 0 && (
                    <button
                      onClick={() => setSoSemFoto((v) => !v)}
                      className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg border transition-colors ${
                        soSemFoto
                          ? 'bg-amber-900/30 border-amber-700/50 text-amber-300'
                          : 'border-gray-700 text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      {soSemFoto ? 'Mostrar todas' : 'Só sem foto'}
                    </button>
                  )}
                  <Button size="sm" variant="secondary" onClick={openNewRoute}><Plus size={14} /> Nova Rota</Button>
                </div>
              </div>

              {/* Separação por tipo de translado. Só aparece com 2+ tipos: com
                  um só, a barra seria um botão inútil ocupando espaço. */}
              {transfers.length > 1 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {[{ id: 'todos', name: `Todas (${routes.length})` },
                    ...transfers.map((tr) => ({
                      id: tr.id,
                      name: `${tr.name} (${routes.filter((r) => r.transfer_id === tr.id).length})`,
                    }))].map((op) => (
                    <button
                      key={op.id}
                      onClick={() => { setTipoRota(op.id); setSoSemFoto(false) }}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                        tipoRota === op.id
                          ? 'bg-brand/15 border-brand/60 text-brand'
                          : 'border-gray-700 text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      {op.name}
                    </button>
                  ))}
                </div>
              )}
            </CardHeader>
            <div className="divide-y divide-gray-800">
              {rotasVisiveis.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-5 py-3">
                  {/* EXATAMENTE a mesma miniatura da lista de passeios (mesmo
                      tamanho, mesmo cinza no vazio) — pedido do dono para as
                      duas listas se lerem do mesmo jeito. O `title` fica como
                      reforço para quem passa o mouse. */}
                  {r.cover_image_url ? (
                    <img
                      src={r.cover_image_url}
                      alt=""
                      loading="lazy"
                      className="w-10 h-10 rounded-lg object-cover shrink-0"
                    />
                  ) : (
                    <div title="Sem foto de capa" className="w-10 h-10 rounded-lg bg-gray-700 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-200">{r.origin_name} → {r.destination_name}</p>
                    <p className="text-xs text-gray-500">{r.transfers?.name}</p>
                  </div>
                  <span className="text-sm font-bold text-brand">
                    {Number(r.default_price || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </span>
                  <div className="flex gap-1">
                    <button onClick={() => openEditRoute(r)} className="p-1.5 text-gray-600 hover:text-gray-300 hover:bg-gray-700 rounded-lg">
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => confirm('Apagar esta rota?\n\nNão tem como desfazer. Rota com reservas é recusada — nesse caso, desative.') && deleteRouteMut.mutate(r.id)}
                      className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-900/20 rounded-lg"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
              {routes.length === 0 && <CardBody><p className="text-sm text-gray-600">Nenhuma rota</p></CardBody>}
            </div>
          </Card>
        </>
      )}

      {/* ── Veículos ───────────────────────────────────────────── */}
      {tab === 'vehicles' && (
        <>
        {/* Modais de operação — a lista que alimenta o campo "Modal" do veículo
            e das duas categorias. Era fixa no código; agora é cadastro. */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-300">Modais de operação ({modais.length})</h2>
              <Button size="sm" onClick={openNewModal}><Plus size={14} /> Novo Modal</Button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              O veículo só é oferecido em serviço do mesmo modal. Quem define o modal do serviço é a categoria dele.
            </p>
          </CardHeader>
          <div className="divide-y divide-gray-800">
            {modais.map((m) => {
              const usoVeiculos = vehicles.filter((v) => v.modal === m.slug).length
              return (
                <div key={m.slug} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-200">{m.name}</p>
                    <p className="text-xs text-gray-500">
                      {usoVeiculos} veículo{usoVeiculos === 1 ? '' : 's'}
                      {m.description ? ` · ${m.description}` : ''}
                      {m.executor?.full_name && (
                        <span className="text-amber-400/80"> · executor fixo: {m.executor.full_name}</span>
                      )}
                    </p>
                  </div>
                  <Badge value={String(m.is_active !== false)} />
                  {m.id && (
                    <div className="flex gap-1">
                      <button onClick={() => openEditModal(m)} className="p-1.5 text-gray-600 hover:text-gray-300 hover:bg-gray-700 rounded-lg">
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => confirm(`Remover o modal "${m.name}"?`) && deleteModalMut.mutate(m.id)}
                        className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-900/20 rounded-lg"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Car size={16} className="text-gray-500" />
                <h2 className="text-sm font-semibold text-gray-300">Veículos ({filteredVehicles.length}{filterRegion ? `/${vehicles.length}` : ''})</h2>
              </div>
              <Button size="sm" onClick={openNewVehicle}><Plus size={14} /> Novo Veículo</Button>
            </div>
          </CardHeader>
          {l4 ? (
            <CardBody><p className="text-sm text-gray-500">Carregando…</p></CardBody>
          ) : (
            <div className="divide-y divide-gray-800">
              {filteredVehicles.map((v) => (
                <div key={v.id} className="flex items-center gap-3 px-5 py-3">
                  {v.image_url ? (
                    <img src={v.image_url} className="w-10 h-10 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-gray-700 flex items-center justify-center shrink-0">
                      <Car size={16} className="text-gray-500" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-200">{v.name}</p>
                    <div className="flex items-center gap-2 text-xs text-gray-500 flex-wrap">
                      <span>{VEHICLE_TYPES.find((t) => t.value === v.vehicle_type)?.label || v.vehicle_type}</span>
                      <span>·</span>
                      <Users size={10} className="text-gray-500" />
                      <span>{v.seat_capacity} pax</span>
                      <span>·</span>
                      <span className="text-sky-400/80">{nomeDoModal(v.modal)}</span>
                      {v.is_tour_allowed && <span className="text-brand/70">· Passeios</span>}
                      {v.is_transfer_allowed && <span className="text-purple-400/70">· Transfer</span>}
                      {v.is_shared_allowed && <span className="text-amber-400/70">· Compartilhado</span>}
                      <RegionTags ids={v.region_ids} />
                    </div>
                  </div>
                  <Badge value={String(v.is_active)} />
                  <div className="flex gap-1">
                    <button onClick={() => openEditVehicle(v)} className="p-1.5 text-gray-600 hover:text-gray-300 hover:bg-gray-700 rounded-lg">
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => confirm(`Desativar "${v.name}"?`) && deleteVehicleMut.mutate(v.id)}
                      className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-900/20 rounded-lg"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
              {vehicles.length === 0 && (
                <CardBody>
                  <div className="py-8 text-center">
                    <Car size={32} className="mx-auto text-gray-700 mb-2" />
                    <p className="text-sm text-gray-600">Nenhum veículo cadastrado.</p>
                    <p className="text-xs text-gray-700 mt-1">Cadastre veículos para que apareçam nos passeios privativos.</p>
                  </div>
                </CardBody>
              )}
            </div>
          )}
        </Card>
        </>
      )}

      {/* ── Modal tour / transfer ──────────────────────────────── */}
      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        title={modal?.isNew
          ? (isTransferModal ? 'Nova Categoria' : 'Novo Passeio')
          : (isTransferModal ? 'Editar Categoria' : 'Editar Passeio')}
      >
        {isTransferModal ? (
          <form onSubmit={handleTransferSubmit} className="space-y-4">
            <Input label="Nome" value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <Textarea label="Descrição" rows={2} value={form.short_description || ''} onChange={(e) => setForm({ ...form, short_description: e.target.value })} />

            {/* Modal da categoria de TRANSLADO: as rotas dela herdam. É o que
                faz a rota aérea listar só helicóptero. */}
            <div>
              <Select
                label="Modal"
                value={form.modal || 'terrestre'}
                onChange={(e) => setForm({ ...form, modal: e.target.value })}
              >
                {modaisAtivos.map((m) => (
                  <option key={m.slug} value={m.slug}>{m.name}</option>
                ))}
                {form.modal && !modaisAtivos.some((m) => m.slug === form.modal) && (
                  <option value={form.modal}>{nomeDoModal(form.modal)} (inativo)</option>
                )}
              </Select>
              <p className="text-[11px] text-gray-500 mt-1">
                As rotas desta categoria só oferecem veículos deste modal.
              </p>
            </div>
            {/* Para criar uma categoria bastam nome e as duas caixas abaixo.
                O resto são REGRAS DE OPERAÇÃO (preço, prazos, janela de
                horário, municípios) — úteis depois, não na hora de criar. Ficam
                recolhidas para o formulário não assustar; nada foi removido. */}
            <button
              type="button"
              onClick={() => setMostrarAvancado((v) => !v)}
              className="w-full flex items-center justify-between text-left px-3 py-2 rounded-xl border border-gray-700 text-gray-400 hover:text-gray-200 transition-colors"
            >
              <span className="text-xs font-semibold">Regras de operação (opcional)</span>
              <span className="text-xs">{mostrarAvancado ? 'Ocultar' : 'Mostrar'}</span>
            </button>

            {mostrarAvancado && (
            <div className="space-y-4 border-l-2 border-gray-800 pl-3">
            <Select label="Modo de precificação" value={form.pricing_mode || 'fixed_route'} onChange={(e) => setForm({ ...form, pricing_mode: e.target.value })}>
              <option value="fixed_route">Rota tabelada</option>
              <option value="by_vehicle">Por veículo</option>
              <option value="manual_quote">Cotação manual</option>
            </Select>
            {/* Horário limite */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Horário limite de solicitação
              </label>
              <select
                value={(form.booking_cutoff_time || '').slice(0, 5)}
                onChange={(e) => setForm({ ...form, booking_cutoff_time: e.target.value || null })}
                className="w-full bg-[#1a1a2e] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-brand"
              >
                <option value="">Sem restrição</option>
                {(() => {
                  const cur  = (form.booking_cutoff_time || '').slice(0, 5)
                  const list = cur && !CUTOFF_TIME_OPTIONS.includes(cur)
                    ? [cur, ...CUTOFF_TIME_OPTIONS] : CUTOFF_TIME_OPTIONS
                  return list.map((t) => <option key={t} value={t}>{t}</option>)
                })()}
              </select>
              <p className="text-[11px] text-gray-500 mt-1">
                Após este horário, só aceita reservas a partir do dia seguinte. Deixe em branco para não restringir.
              </p>
            </div>

            {/* Antecedência mínima */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Antecedência mínima (horas)
              </label>
              <input
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                placeholder="Padrão"
                value={form.min_advance_hours ?? ''}
                onChange={(e) => setForm({ ...form, min_advance_hours: e.target.value })}
                className="w-full bg-[#1a1a2e] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-brand"
              />
              <p className="text-[11px] text-gray-500 mt-1">
                Horas mínimas entre a reserva e o passeio. Deixe em branco para usar o padrão.
              </p>
            </div>

            {/* Janela de operação: fora dela o cliente não consegue agendar
                (ex.: buggy só sai das 06:00 às 12:00). Vazio = sem restrição. */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1">
                Horário de operação
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="time"
                  value={(form.service_window_start || '').slice(0, 5)}
                  onChange={(e) => setForm({ ...form, service_window_start: e.target.value || null })}
                  className="flex-1 bg-[#1a1a2e] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-brand"
                />
                <span className="text-gray-500 text-sm">até</span>
                <input
                  type="time"
                  value={(form.service_window_end || '').slice(0, 5)}
                  onChange={(e) => setForm({ ...form, service_window_end: e.target.value || null })}
                  className="flex-1 bg-[#1a1a2e] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-brand"
                />
                {(form.service_window_start || form.service_window_end) && (
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, service_window_start: null, service_window_end: null })}
                    className="text-[11px] text-gray-500 hover:text-gray-300 shrink-0"
                  >
                    limpar
                  </button>
                )}
              </div>
              <p className="text-[11px] text-gray-500 mt-1">
                Faixa de horário em que este serviço pode ser agendado. Em branco = qualquer horário.
              </p>
            </div>

            <CidadesSelector
              value={form.region_ids}
              onChange={(next) => setForm((f) => ({ ...f, region_ids: next }))}
            />
            </div>
            )}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 accent-brand"
                checked={!!form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              <span className="text-sm text-gray-300">Ativo (visível para turistas)</span>
            </label>

            {/* É ESTE campo que cria o carrossel separado no app: a vitrine de
                translados filtra por `transfers.is_exclusive`. Antes ele não
                existia na tela — o "Translado Aéreo" só ficou exclusivo porque
                uma migration gravou direto no banco, e não havia como criar uma
                categoria nova com carrossel próprio pelo admin. */}
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 accent-brand mt-0.5"
                checked={!!form.is_exclusive}
                onChange={(e) => setForm({ ...form, is_exclusive: e.target.checked })}
              />
              <span className="text-sm text-gray-300">
                Carrossel próprio no app
                <span className="block text-[11px] text-gray-500">
                  As rotas desta categoria aparecem num carrossel separado — como os
                  translados aéreos — em vez de entrarem na lista comum de rotas.
                  A reserva é direta: uma por vez, sem carrinho nem combo.
                </span>
              </span>
            </label>

            <Button type="submit" className="w-full" disabled={transferMut.isPending}>
              {transferMut.isPending ? 'Salvando…' : 'Salvar'}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleTourSubmit} className="space-y-4">
            {/* Foto de capa */}
            <div>
              <p className="text-xs font-medium text-gray-400 mb-1.5">Foto de capa</p>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              {imagePreview ? (
                <div className="relative">
                  <img src={imagePreview} className="w-full h-32 object-cover rounded-xl" />
                  <button type="button"
                    onClick={() => { setImageFile(null); setImagePreview(null); setForm({ ...form, cover_image_url: '' }) }}
                    className="absolute top-2 right-2 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center"
                  >
                    <X size={12} className="text-white" />
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="w-full h-24 border-2 border-dashed border-gray-700 rounded-xl flex flex-col items-center justify-center gap-1.5 text-gray-600 hover:border-gray-500 hover:text-gray-400 transition-colors"
                >
                  <ImagePlus size={20} />
                  <span className="text-xs">Clique para adicionar imagem</span>
                </button>
              )}
            </div>

            <Input label="Nome" value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <Textarea label="Descrição" rows={2} value={form.short_description || ''} onChange={(e) => setForm({ ...form, short_description: e.target.value })} />

            {/* Faltava por completo: a coluna `tours.category_id` existe desde a
                001 e a API já a grava, mas não havia como escolher a categoria
                pelo painel. É ela que decide em qual carrossel o passeio entra. */}
            {/* Várias categorias por passeio (migration 083): o voo panorâmico é
                "Voos Panorâmicos" e também entra na vitrine de compartilhado.
                A PRIMEIRA marcada é a principal — é a que aparece como rótulo
                onde só cabe uma. */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Categorias</label>
              <div className="space-y-1.5 max-h-52 overflow-y-auto rounded-lg border border-gray-700 bg-gray-900 p-2">
                {categoriasAtivas.length === 0 && (
                  <p className="text-[12px] text-gray-500 px-1 py-1">Nenhuma categoria ativa cadastrada.</p>
                )}
                {categoriasAtivas.map((c) => {
                  const marcadas = form.category_ids || []
                  const on = marcadas.includes(c.id)
                  const principal = marcadas[0] === c.id
                  return (
                    <label key={c.id} className="flex items-center gap-2.5 px-1.5 py-1 rounded hover:bg-gray-800/60 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => setForm((f) => {
                          const atual = f.category_ids || []
                          const proximo = on ? atual.filter((x) => x !== c.id) : [...atual, c.id]
                          // category_id acompanha a principal para o app e o
                          // admin, que ainda leem a categoria única.
                          return { ...f, category_ids: proximo, category_id: proximo[0] || '' }
                        })}
                        className="accent-brand w-4 h-4 shrink-0"
                      />
                      <span className="text-sm text-gray-200">{c.name}</span>
                      {c.is_exclusive && <span className="text-[10px] text-brand">carrossel próprio</span>}
                      {principal && <span className="text-[10px] text-gray-500 ml-auto">principal</span>}
                    </label>
                  )
                })}
                {/* Categoria desativada só aparece se ESTE passeio já usa ela —
                    senão salvar o passeio apagaria o vínculo sem avisar. */}
                {(form.category_ids || [])
                  .filter((id) => !categoriasAtivas.some((c) => c.id === id))
                  .map((id) => (
                    <label key={id} className="flex items-center gap-2.5 px-1.5 py-1 rounded cursor-pointer">
                      <input
                        type="checkbox"
                        checked
                        onChange={() => setForm((f) => {
                          const proximo = (f.category_ids || []).filter((x) => x !== id)
                          return { ...f, category_ids: proximo, category_id: proximo[0] || '' }
                        })}
                        className="accent-brand w-4 h-4 shrink-0"
                      />
                      <span className="text-sm text-gray-400">
                        {categorias.find((c) => c.id === id)?.name || 'Categoria atual'} (inativa)
                      </span>
                    </label>
                  ))}
              </div>
              <p className="text-[11px] text-gray-500 mt-1">
                O passeio aparece na vitrine de cada categoria marcada. Categoria com carrossel próprio ganha
                uma vitrine só dela no app; sem nenhuma marcada, o passeio segue na lista comum.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="Duração (horas)" type="number" min={0.5} step={0.5}
                value={form.duration_hours || ''} onChange={(e) => setForm({ ...form, duration_hours: e.target.value })} />
              <Input label="Capacidade máx." type="number" min={1}
                value={form.max_people || ''} onChange={(e) => setForm({ ...form, max_people: e.target.value })} />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-400">Modalidades</p>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-brand"
                  checked={!!form.is_private_enabled}
                  onChange={(e) => setForm({ ...form, is_private_enabled: e.target.checked })} />
                <span className="text-sm text-gray-300">Privativo (preço por veículo)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="w-4 h-4 accent-brand"
                  checked={!!form.is_shared_enabled}
                  onChange={(e) => setForm({ ...form, is_shared_enabled: e.target.checked })} />
                <span className="text-sm text-gray-300">Compartilhado (preço por pessoa)</span>
              </label>
            </div>

            {form.is_shared_enabled && (
              <Input label="Preço por pessoa (compartilhado)" type="number" min={0} step={0.01}
                value={form.shared_price_per_person || ''}
                onChange={(e) => setForm({ ...form, shared_price_per_person: e.target.value })} />
            )}

            {/* Horário limite de solicitação */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Horário limite de solicitação
              </label>
              <select
                value={(form.booking_cutoff_time || '').slice(0, 5)}
                onChange={(e) => setForm({ ...form, booking_cutoff_time: e.target.value || null })}
                className="w-full bg-[#1a1a2e] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-brand"
              >
                <option value="">Sem restrição</option>
                {(() => {
                  const cur  = (form.booking_cutoff_time || '').slice(0, 5)
                  const list = cur && !CUTOFF_TIME_OPTIONS.includes(cur)
                    ? [cur, ...CUTOFF_TIME_OPTIONS] : CUTOFF_TIME_OPTIONS
                  return list.map((t) => <option key={t} value={t}>{t}</option>)
                })()}
              </select>
              <p className="text-[11px] text-gray-500 mt-1">
                Após este horário, o sistema só aceita reservas a partir do dia seguinte. Deixe em branco para não restringir.
              </p>
            </div>

            {/* Antecedência mínima */}
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                Antecedência mínima (horas)
              </label>
              <input
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                placeholder="Padrão"
                value={form.min_advance_hours ?? ''}
                onChange={(e) => setForm({ ...form, min_advance_hours: e.target.value })}
                className="w-full bg-[#1a1a2e] border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-brand"
              />
              <p className="text-[11px] text-gray-500 mt-1">
                Horas mínimas entre a reserva e o transfer. Deixe em branco para usar o padrão.
              </p>
            </div>

            <CidadesSelector
              value={form.region_ids}
              onChange={(next) => setForm((f) => ({ ...f, region_ids: next }))}
            />
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 accent-brand"
                checked={!!form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              <span className="text-sm text-gray-300">Ativo (visível para turistas)</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 accent-brand"
                checked={!!form.is_featured}
                onChange={(e) => setForm({ ...form, is_featured: e.target.checked })}
              />
              <span className="text-sm text-gray-300">Destaque na home (carrossel "Passeios em destaque")</span>
            </label>

            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                className="w-4 h-4 accent-brand mt-0.5"
                checked={!!form.is_exclusive}
                onChange={(e) => setForm({ ...form, is_exclusive: e.target.checked })}
              />
              <span className="text-sm text-gray-300">
                Passeio exclusivo (venda direta)
                <span className="block text-[11px] text-gray-500">
                  Não vai ao carrinho nem forma combo — o cliente solicita direto no "Resumo da reserva", um por vez.
                </span>
              </span>
            </label>

            <Input
              label="Ordem de exibição (menor aparece primeiro)"
              type="number" min={0}
              value={form.display_order ?? 0}
              onChange={(e) => setForm({ ...form, display_order: e.target.value })}
            />

            <Button type="submit" className="w-full" disabled={tourMut.isPending || uploading}>
              {uploading ? 'Enviando imagem…' : tourMut.isPending ? 'Salvando…' : 'Salvar'}
            </Button>
          </form>
        )}
      </Modal>

      {/* ── Cadastro de MODAL de operação ──────────────────────── */}
      {/* Formulário próprio (`modalModal`), como o de categoria: são cadastros
          diferentes e juntá-los num só estado já causou edição no campo errado. */}
      <Modal
        open={!!modalModal}
        onClose={() => setModalModal(null)}
        title={modalModal?.isNew ? 'Novo Modal de Operação' : 'Editar Modal'}
        size="sm"
      >
        <form onSubmit={handleModalSubmit} className="space-y-4">
          <Input
            label="Nome"
            placeholder="Ex.: Aquático"
            value={modalForm.name || ''}
            onChange={(e) => setModalForm({ ...modalForm, name: e.target.value })}
            required
          />
          <Textarea
            label="Descrição (opcional)"
            rows={2}
            placeholder="Ex.: Barco, lancha, catamarã."
            value={modalForm.description || ''}
            onChange={(e) => setModalForm({ ...modalForm, description: e.target.value })}
          />
          <Input
            label="Ordem de exibição (menor aparece primeiro)"
            type="number" min={0}
            value={modalForm.sort_order ?? 99}
            onChange={(e) => setModalForm({ ...modalForm, sort_order: e.target.value })}
          />
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 accent-brand"
              checked={!!modalForm.is_active}
              onChange={(e) => setModalForm({ ...modalForm, is_active: e.target.checked })}
            />
            <span className="text-sm text-gray-300">Ativo (aparece na lista de escolha)</span>
          </label>

          {/* ── Executor fixo (078) ─────────────────────────────
              Para o aéreo: uma empresa voa, e quem aceitar fica só com a
              comissão. Vazio = normal (quem aceita executa e recebe). */}
          <div className="border-t border-gray-800 pt-4 space-y-3">
            <div>
              <Select
                label="Executor fixo (opcional)"
                value={modalForm.executor_operator_id || ''}
                onChange={(e) => setModalForm({ ...modalForm, executor_operator_id: e.target.value })}
              >
                <option value="">Sem executor fixo — quem aceita executa</option>
                {operadores.map((c) => (
                  <option key={c.id} value={c.id}>{c.full_name}</option>
                ))}
              </Select>
              <p className="text-[11px] text-gray-500 mt-1">
                Todo serviço deste meio é executado por ela, independente de quem aceitar.
              </p>
            </div>

            {/* As duas porcentagens valem com ou sem executor fixo. É a "% de
                quem aceita" que LIGA a divisão em três: com ela em zero, quem
                aceitou recebe tudo menos a plataforma e o executor não gera
                repasse — o comportamento de antes da 082. */}
            <div className="grid grid-cols-2 gap-3">
              <Input
                label="% de quem aceita" type="number" min={0} max={100} step={0.5}
                value={modalForm.acceptor_commission_pct ?? 0}
                onChange={(e) => setModalForm({ ...modalForm, acceptor_commission_pct: e.target.value })}
              />
              <Input
                label="% da plataforma" type="number" min={0} max={100} step={0.5}
                placeholder="usa a geral"
                value={modalForm.platform_commission_pct ?? ''}
                onChange={(e) => setModalForm({ ...modalForm, platform_commission_pct: e.target.value })}
              />
            </div>
            <p className="text-[11px] text-gray-500 -mt-1">
              {Number(modalForm.acceptor_commission_pct) > 0 || modalForm.executor_operator_id
                ? 'O resto vai para quem EXECUTOU — a plataforma repassa direto a ele.'
                : 'Com 0% de aceite, quem aceitou fica com tudo menos a parte da plataforma e paga o próprio motorista.'}
            </p>

            {/* SIMULAÇÃO — os mesmos números que o repasse vai usar. */}
            {(() => {
              const execFixo = !!modalForm.executor_operator_id
              const plat = Number(modalForm.platform_commission_pct) || 0
              const aceite = Number(modalForm.acceptor_commission_pct) || 0
              // A divisão em três existe com executor fixo OU com comissão de
              // aceite configurada — aí o terceiro é o motorista declarado na
              // conclusão. É a mesma regra de `repartirReserva` no servidor.
              const divide = execFixo || aceite > 0
              const excede = aceite + plat > 100
              // Só o executor FIXO pode ser quem aceitou (a Frisonfly pegando o
              // próprio voo). Motorista declarado nunca é quem aceita.
              const cenarios = execFixo
                ? [['Outro operador aceitou', false], ['O próprio executor aceitou', true]]
                : [[null, false]]
              return (
                <div className="rounded-xl bg-gray-900/60 border border-gray-800 p-3">
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
                    Simulação — serviço de R$ 7.600
                  </p>
                  {excede ? (
                    <p className="text-[12px] text-red-400">
                      As comissões somam {aceite + plat}% — passam de 100% e o executor ficaria negativo.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {cenarios.map(([titulo, exec]) => (
                        <div key={titulo || 'unico'}>
                          {titulo && <p className="text-[11px] text-gray-500">{titulo}</p>}
                          {simularRateio(7600, aceite, plat, divide, exec).map((l) => (
                            <div key={l.rotulo} className="flex justify-between text-[12px] text-gray-300">
                              <span>{l.rotulo}</span>
                              <span className="tabular-nums">
                                {l.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-[10.5px] text-gray-500 mt-2">
                    O cliente paga tudo na plataforma; estes valores viram repasses
                    em <span className="text-gray-400">Repasses → Operadores</span>.
                  </p>
                </div>
              )
            })()}
          </div>
          <p className="text-[11px] text-gray-500">
            Modal em uso não pode ser removido nem desativado — o painel diz quantos
            veículos e categorias dependem dele.
          </p>
          <Button type="submit" className="w-full" disabled={modalMut.isPending}>
            {modalMut.isPending ? 'Salvando…' : 'Salvar Modal'}
          </Button>
        </form>
      </Modal>

      {/* ── Modal categoria de passeio ─────────────────────────── */}
      {/* Só o essencial para criar — mesmo enxugamento pedido para a categoria
          de translado. Nome, descrição, ordem e as duas caixas. */}
      <Modal
        open={!!catModal}
        onClose={() => setCatModal(null)}
        title={catModal?.isNew ? 'Nova Categoria de Passeio' : 'Editar Categoria de Passeio'}
        size="sm"
      >
        <form onSubmit={handleCategorySubmit} className="space-y-4">
          <Input
            label="Nome"
            placeholder="Ex.: Passeios de barco"
            value={catForm.name || ''}
            onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
            required
          />
          <Textarea
            label="Descrição (opcional)"
            rows={2}
            value={catForm.description || ''}
            onChange={(e) => setCatForm({ ...catForm, description: e.target.value })}
          />
          <div>
            <Select
              label="Modal"
              value={catForm.modal || 'terrestre'}
              onChange={(e) => setCatForm({ ...catForm, modal: e.target.value })}
            >
              {modaisAtivos.map((m) => (
                <option key={m.slug} value={m.slug}>{m.name}</option>
              ))}
              {catForm.modal && !modaisAtivos.some((m) => m.slug === catForm.modal) && (
                <option value={catForm.modal}>{nomeDoModal(catForm.modal)} (inativo)</option>
              )}
            </Select>
            <p className="text-[11px] text-gray-500 mt-1">
              Os passeios desta categoria só oferecem veículos deste modal.
            </p>
          </div>

          <Input
            label="Ordem de exibição (menor aparece primeiro)"
            type="number" min={0}
            value={catForm.sort_order ?? 0}
            onChange={(e) => setCatForm({ ...catForm, sort_order: e.target.value })}
          />

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 accent-brand"
              checked={!!catForm.is_active}
              onChange={(e) => setCatForm({ ...catForm, is_active: e.target.checked })}
            />
            <span className="text-sm text-gray-300">Ativa</span>
          </label>

          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 accent-brand mt-0.5"
              checked={!!catForm.is_exclusive}
              onChange={(e) => setCatForm({ ...catForm, is_exclusive: e.target.checked })}
            />
            <span className="text-sm text-gray-300">
              Carrossel próprio no app
              <span className="block text-[11px] text-gray-500">
                Os passeios desta categoria aparecem num carrossel separado, com o
                nome da categoria como título, em vez de entrarem na lista comum.
              </span>
            </span>
          </label>

          <Button type="submit" className="w-full" disabled={catMut.isPending}>
            {catMut.isPending ? 'Salvando…' : 'Salvar Categoria'}
          </Button>
        </form>
      </Modal>

      {/* ── Modal rota ─────────────────────────────────────────── */}
      <Modal open={!!routeModal} onClose={() => setRouteModal(null)} title={routeModal?.isNew ? 'Nova Rota' : 'Editar Rota'} size="sm">
        <form onSubmit={handleRouteSubmit} className="space-y-4">
          {/* Foto de capa — ilustra a rota no app (sem foto, cai no gradiente) */}
          <div>
            <p className="text-xs font-medium text-gray-400 mb-1.5">Foto de capa</p>
            <input ref={routeFileRef} type="file" accept="image/*" className="hidden" onChange={handleRouteFileChange} />
            {routeImagePreview ? (
              <div className="relative">
                <img src={routeImagePreview} className="w-full h-32 object-cover rounded-xl" />
                <button type="button"
                  onClick={() => { setRouteImageFile(null); setRouteImagePreview(null); setRouteForm({ ...routeForm, cover_image_url: '' }) }}
                  className="absolute top-2 right-2 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center"
                >
                  <X size={12} className="text-white" />
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => routeFileRef.current?.click()}
                className="w-full h-24 border-2 border-dashed border-gray-700 rounded-xl flex flex-col items-center justify-center gap-1.5 text-gray-600 hover:border-gray-500 hover:text-gray-400 transition-colors"
              >
                <ImagePlus size={20} />
                <span className="text-xs">Adicionar foto da rota</span>
              </button>
            )}
          </div>
          {/* Faltava por completo. `transfer_routes.transfer_id` é NOT NULL, então
              criar rota nova por esta tela SEMPRE falhava — o formulário não
              mandava o campo. Na edição funcionava por acidente: o valor vinha
              junto no objeto da rota. */}
          <Select
            label="Categoria"
            value={routeForm.transfer_id || ''}
            onChange={(e) => setRouteForm({ ...routeForm, transfer_id: e.target.value })}
            required
          >
            <option value="" disabled>Selecione…</option>
            {transfers.map((tr) => (
              <option key={tr.id} value={tr.id}>{tr.name}</option>
            ))}
          </Select>
          <Input label="Origem" value={routeForm.origin_name || ''} onChange={(e) => setRouteForm({ ...routeForm, origin_name: e.target.value })} required />
          <Input label="Destino" value={routeForm.destination_name || ''} onChange={(e) => setRouteForm({ ...routeForm, destination_name: e.target.value })} required />
          <Input label="Preço padrão (R$)" type="number" min={0} step={0.01}
            value={routeForm.default_price || ''} onChange={(e) => setRouteForm({ ...routeForm, default_price: e.target.value })} required />
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 accent-brand mt-0.5"
              checked={!!routeForm.is_featured}
              onChange={(e) => setRouteForm({ ...routeForm, is_featured: e.target.checked })}
            />
            <span className="text-sm text-gray-300">
              Destaque na home
              <span className="block text-[11px] text-gray-500">Aparece no carrossel "Serviços em destaque" do app.</span>
            </span>
          </label>
          <Button type="submit" className="w-full" disabled={routeMut.isPending}>
            {routeMut.isPending ? 'Salvando…' : 'Salvar Rota'}
          </Button>
        </form>
      </Modal>

      {/* ── Modal veículo ──────────────────────────────────────── */}
      <Modal
        open={!!vehicleModal}
        onClose={() => setVehicleModal(null)}
        title={vehicleModal?.isNew ? 'Novo Veículo' : 'Editar Veículo'}
      >
        <form onSubmit={handleVehicleSubmit} className="space-y-4">
          {/* Foto do veículo */}
          <div>
            <p className="text-xs font-medium text-gray-400 mb-1.5">Foto do veículo</p>
            <input ref={vehicleFileRef} type="file" accept="image/*" className="hidden" onChange={handleVehicleFileChange} />
            {vehicleImagePreview ? (
              <div className="relative">
                <img src={vehicleImagePreview} className="w-full h-28 object-cover rounded-xl" />
                <button type="button"
                  onClick={() => { setVehicleImageFile(null); setVehicleImagePreview(null); setVehicleForm({ ...vehicleForm, image_url: '' }) }}
                  className="absolute top-2 right-2 w-6 h-6 bg-black/60 rounded-full flex items-center justify-center"
                >
                  <X size={12} className="text-white" />
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => vehicleFileRef.current?.click()}
                className="w-full h-20 border-2 border-dashed border-gray-700 rounded-xl flex flex-col items-center justify-center gap-1.5 text-gray-600 hover:border-gray-500 hover:text-gray-400 transition-colors"
              >
                <ImagePlus size={18} />
                <span className="text-xs">Clique para adicionar imagem</span>
              </button>
            )}
          </div>

          <Input
            label="Nome"
            value={vehicleForm.name || ''}
            onChange={(e) => setVehicleForm({ ...vehicleForm, name: e.target.value })}
            required
          />

          <Select
            label="Tipo de veículo"
            value={vehicleForm.vehicle_type || 'buggy'}
            onChange={(e) => setVehicleForm({ ...vehicleForm, vehicle_type: e.target.value })}
          >
            {VEHICLE_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </Select>

          {/* É este campo que impede o buggy de aparecer num voo — e o
              helicóptero num translado de estrada. */}
          <div>
            <Select
              label="Modal"
              value={vehicleForm.modal || 'terrestre'}
              onChange={(e) => setVehicleForm({ ...vehicleForm, modal: e.target.value })}
            >
              {modaisAtivos.map((m) => (
                <option key={m.slug} value={m.slug}>{m.name}</option>
              ))}
              {vehicleForm.modal && !modaisAtivos.some((m) => m.slug === vehicleForm.modal) && (
                <option value={vehicleForm.modal}>{nomeDoModal(vehicleForm.modal)} (inativo)</option>
              )}
            </Select>
            <p className="text-[11px] text-gray-500 mt-1">
              O veículo só é oferecido em serviços do mesmo modal.
            </p>
          </div>

          <Textarea
            label="Descrição"
            rows={2}
            value={vehicleForm.description || ''}
            onChange={(e) => setVehicleForm({ ...vehicleForm, description: e.target.value })}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Capacidade (pax)"
              type="number" min={1}
              value={vehicleForm.seat_capacity || ''}
              onChange={(e) => setVehicleForm({ ...vehicleForm, seat_capacity: e.target.value })}
              required
            />
            <Input
              label="Bagagens"
              type="number" min={0}
              value={vehicleForm.luggage_capacity || ''}
              onChange={(e) => setVehicleForm({ ...vehicleForm, luggage_capacity: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-400">Disponível para</p>
            {[
              { key: 'is_tour_allowed',     label: 'Passeios privativos' },
              { key: 'is_shared_allowed',   label: 'Passeios compartilhados' },
              { key: 'is_transfer_allowed', label: 'Transfer' },
              { key: 'is_private_allowed',  label: 'Contratação privada' },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4 accent-brand"
                  checked={!!vehicleForm[key]}
                  onChange={(e) => setVehicleForm({ ...vehicleForm, [key]: e.target.checked })}
                />
                <span className="text-sm text-gray-300">{label}</span>
              </label>
            ))}
          </div>

          <CidadesSelector
            value={vehicleForm.region_ids}
            onChange={(next) => setVehicleForm((f) => ({ ...f, region_ids: next }))}
          />
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 accent-brand"
              checked={!!vehicleForm.is_active}
              onChange={(e) => setVehicleForm({ ...vehicleForm, is_active: e.target.checked })}
            />
            <span className="text-sm text-gray-300">Ativo (visível para turistas)</span>
          </label>

          <Button type="submit" className="w-full" disabled={vehicleMut.isPending || uploading}>
            {uploading ? 'Enviando imagem…' : vehicleMut.isPending ? 'Salvando…' : 'Salvar Veículo'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}
