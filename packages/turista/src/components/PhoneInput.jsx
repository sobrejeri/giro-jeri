import { useState, useRef, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Search, Check } from 'lucide-react'

/* ── Telefone com DDI internacional ─────────────────────────────
   Dropdown com TODOS os códigos de país (bandeira à esquerda + nome em
   português + +DDI, com busca). O valor entra e sai como string única
   ("+55 88999998888"), então nada muda no backend.
   Bandeira = emoji derivado do ISO-3166 (sem imagem); nome do país vem do
   Intl.DisplayNames — zero dependência nova. */

// [iso2, DDI] — em códigos compartilhados (+1, +7, +44…) o país preferido
// vem primeiro para o parse de valores existentes.
const COUNTRIES = [
  ['BR', '55'],
  ['US', '1'], ['CA', '1'],
  ['PT', '351'], ['AR', '54'], ['UY', '598'], ['PY', '595'], ['CL', '56'],
  ['BO', '591'], ['PE', '51'], ['CO', '57'], ['VE', '58'], ['EC', '593'],
  ['GY', '592'], ['SR', '597'], ['GF', '594'], ['MX', '52'], ['GT', '502'],
  ['BZ', '501'], ['SV', '503'], ['HN', '504'], ['NI', '505'], ['CR', '506'],
  ['PA', '507'], ['CU', '53'], ['DO', '1809'], ['PR', '1787'], ['JM', '1876'],
  ['TT', '1868'], ['BB', '1246'], ['BS', '1242'], ['HT', '509'],
  ['ES', '34'], ['FR', '33'], ['IT', '39'], ['DE', '49'], ['GB', '44'],
  ['IE', '353'], ['NL', '31'], ['BE', '32'], ['LU', '352'], ['CH', '41'],
  ['AT', '43'], ['DK', '45'], ['SE', '46'], ['NO', '47'], ['FI', '358'],
  ['IS', '354'], ['PL', '48'], ['CZ', '420'], ['SK', '421'], ['HU', '36'],
  ['RO', '40'], ['BG', '359'], ['GR', '30'], ['TR', '90'], ['RU', '7'],
  ['KZ', '7'], ['UA', '380'], ['BY', '375'], ['MD', '373'], ['LT', '370'],
  ['LV', '371'], ['EE', '372'], ['HR', '385'], ['SI', '386'], ['RS', '381'],
  ['BA', '387'], ['ME', '382'], ['MK', '389'], ['AL', '355'], ['XK', '383'],
  ['MT', '356'], ['CY', '357'], ['AD', '376'], ['MC', '377'], ['SM', '378'],
  ['LI', '423'], ['GI', '350'],
  ['CN', '86'], ['JP', '81'], ['KR', '82'], ['IN', '91'], ['PK', '92'],
  ['BD', '880'], ['LK', '94'], ['NP', '977'], ['TH', '66'], ['VN', '84'],
  ['KH', '855'], ['LA', '856'], ['MM', '95'], ['MY', '60'], ['SG', '65'],
  ['ID', '62'], ['PH', '63'], ['TW', '886'], ['HK', '852'], ['MO', '853'],
  ['MN', '976'], ['BT', '975'], ['MV', '960'], ['AF', '93'], ['IR', '98'],
  ['IQ', '964'], ['SY', '963'], ['LB', '961'], ['JO', '962'], ['IL', '972'],
  ['PS', '970'], ['SA', '966'], ['AE', '971'], ['QA', '974'], ['KW', '965'],
  ['BH', '973'], ['OM', '968'], ['YE', '967'], ['GE', '995'], ['AM', '374'],
  ['AZ', '994'], ['UZ', '998'], ['TM', '993'], ['TJ', '992'], ['KG', '996'],
  ['AU', '61'], ['NZ', '64'], ['FJ', '679'], ['PG', '675'], ['NC', '687'],
  ['PF', '689'], ['WS', '685'], ['TO', '676'], ['VU', '678'], ['SB', '677'],
  ['ZA', '27'], ['EG', '20'], ['MA', '212'], ['DZ', '213'], ['TN', '216'],
  ['LY', '218'], ['SD', '249'], ['SS', '211'], ['ET', '251'], ['KE', '254'],
  ['TZ', '255'], ['UG', '256'], ['RW', '250'], ['BI', '257'], ['SO', '252'],
  ['DJ', '253'], ['ER', '291'], ['NG', '234'], ['GH', '233'], ['CI', '225'],
  ['SN', '221'], ['ML', '223'], ['BF', '226'], ['NE', '227'], ['TD', '235'],
  ['CM', '237'], ['CF', '236'], ['GA', '241'], ['CG', '242'], ['CD', '243'],
  ['AO', '244'], ['MZ', '258'], ['ZM', '260'], ['ZW', '263'], ['MW', '265'],
  ['NA', '264'], ['BW', '267'], ['SZ', '268'], ['LS', '266'], ['MG', '261'],
  ['MU', '230'], ['SC', '248'], ['CV', '238'], ['GW', '245'], ['ST', '239'],
  ['GN', '224'], ['SL', '232'], ['LR', '231'], ['GM', '220'], ['MR', '222'],
  ['TG', '228'], ['BJ', '229'], ['GQ', '240'], ['KM', '269'],
]

const flagOf = (iso) =>
  iso.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)))

let regionNames = null
try { regionNames = new Intl.DisplayNames(['pt'], { type: 'region' }) } catch { /* fallback ISO */ }
const nameOf = (iso) => { try { return regionNames?.of(iso) || iso } catch { return iso } }

// Divide "+5588999..." em { country, number } casando o DDI mais longo.
function parseValue(value) {
  const raw = String(value || '').trim()
  const digits = raw.replace(/[^\d]/g, '')
  if (!digits) return { country: COUNTRIES[0], number: '' }
  // Sem "+": valor legado/local → assume Brasil e trata tudo como número
  if (!raw.startsWith('+')) return { country: COUNTRIES[0], number: digits }
  const sorted = [...COUNTRIES].sort((a, b) => b[1].length - a[1].length)
  const match = sorted.find(([, ddi]) => digits.startsWith(ddi))
  if (!match) return { country: COUNTRIES[0], number: digits }
  // Para códigos compartilhados, devolve o PRIMEIRO da lista com esse DDI
  const preferred = COUNTRIES.find(([, ddi]) => ddi === match[1])
  return { country: preferred, number: digits.slice(match[1].length) }
}

export default function PhoneInput({ value, onChange, placeholder, inputClassName = '' }) {
  const { t } = useTranslation()
  const resolvedPlaceholder = placeholder ?? t('phoneInputCmp.placeholder')
  const parsed = useMemo(() => parseValue(value), [value])
  const [country, setCountry] = useState(parsed.country)
  const [open, setOpen]       = useState(false)
  const [query, setQuery]     = useState('')
  const wrapRef = useRef(null)

  // Valor externo mudou (ex.: perfil carregou) → realinha o país exibido
  useEffect(() => { setCountry(parsed.country) }, [parsed.country[0]]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onClick(e) { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const number = parsed.number
  const emit = (iso, ddi, num) => onChange(num ? `+${ddi} ${num}` : `+${ddi} `)

  const list = useMemo(() => {
    const all = COUNTRIES.map(([iso, ddi]) => ({ iso, ddi, name: nameOf(iso), flag: flagOf(iso) }))
    // Brasil primeiro; resto em ordem alfabética pt
    const [br, ...rest] = [all[0], ...all.slice(1).sort((a, b) => a.name.localeCompare(b.name, 'pt'))]
    const q = query.trim().toLowerCase()
    const full = [br, ...rest]
    if (!q) return full
    return full.filter((c) => c.name.toLowerCase().includes(q) || c.ddi.startsWith(q.replace('+', '')) || c.iso.toLowerCase() === q)
  }, [query])

  return (
    <div ref={wrapRef} className="relative flex gap-2">
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setQuery('') }}
        className="shrink-0 flex items-center gap-1.5 border border-gray-200 rounded-xl px-2.5 py-2 text-[14px] text-gray-800 bg-white active:scale-95 transition-transform"
        aria-label={t('phoneInputCmp.chooseCountry')}
      >
        <span className="text-[17px] leading-none">{flagOf(country[0])}</span>
        <span className="font-semibold text-[13px]">+{country[1]}</span>
        <ChevronDown size={13} className="text-gray-400" />
      </button>

      <input
        type="tel"
        value={number}
        placeholder={resolvedPlaceholder}
        onChange={(e) => emit(country[0], country[1], e.target.value.replace(/[^\d]/g, ''))}
        className={inputClassName || 'flex-1 min-w-0 border border-gray-200 rounded-xl px-3 py-2 text-[14px] text-gray-800 focus:outline-none focus:border-brand'}
      />

      {open && (
        <div className="absolute z-50 top-[calc(100%+4px)] left-0 w-[280px] max-h-[300px] bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden flex flex-col">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
            <Search size={13} className="text-gray-400 shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('phoneInputCmp.searchPlaceholder')}
              className="flex-1 text-[13px] text-gray-800 outline-none placeholder-gray-400"
            />
          </div>
          <div className="overflow-y-auto">
            {list.map((c) => (
              <button
                key={c.iso}
                type="button"
                onClick={() => { setCountry([c.iso, c.ddi]); setOpen(false); emit(c.iso, c.ddi, number) }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-gray-50 active:bg-gray-100"
              >
                <span className="text-[17px] leading-none shrink-0">{c.flag}</span>
                <span className="flex-1 text-[13px] text-gray-700 truncate">{c.name}</span>
                <span className="text-[12px] font-semibold text-gray-400 shrink-0">+{c.ddi}</span>
                {country[0] === c.iso && <Check size={13} className="text-brand shrink-0" />}
              </button>
            ))}
            {list.length === 0 && (
              <p className="text-[12px] text-gray-400 px-3 py-4 text-center">{t('phoneInputCmp.noCountryFound')}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
