import { MapPin } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { KH_PROVINCES, getDistricts, getCommunes, getVillages } from '../../data/geoData'
import SearchableSelect from './SearchableSelect'

// Builds the option list for one address level: what the app ships, plus anything this
// install has added at that level, plus whatever is currently selected. That last part
// matters when reopening a record — an address saved against a place the built-in lists
// never had (or that was added on another install) must still show as selected rather
// than silently reading as blank.
function optionsFor(builtIn, added, current) {
  const all = [...(builtIn || []), ...(added || [])]
  if (current && !all.includes(current)) all.push(current)
  return [...new Set(all)]
    .sort((a, b) => a.localeCompare(b))
    .map(name => ({ value: name, label: name }))
}

// `action` is an optional control shown on the heading row, beside the label — a per-block
// shortcut ("Same as Current Address") belongs with the block it fills in, not floating above it.
export default function AddressFields({ label, values, onChange, action = null }) {
  const { state, dispatch } = useApp()
  const custom = state.customGeo || {}

  // Custom entries are stored under their full parent path — district names repeat across
  // provinces, so keying a commune on its district alone would show it under the wrong one.
  const districtKey = values.province
  const communeKey = `${values.province}|${values.district}`
  const villageKey = `${values.province}|${values.district}|${values.commune}`

  const provinces = optionsFor(KH_PROVINCES, custom.provinces, values.province)
  const districts = optionsFor(getDistricts(values.province), custom.districts?.[districtKey], values.district)
  const communes = optionsFor(getCommunes(values.district), custom.communes?.[communeKey], values.commune)
  const villages = optionsFor(getVillages(values.commune), custom.villages?.[villageKey], values.village)

  function handleChange(field, val) {
    // Each level clears the ones below it — a district left over from another province is
    // not an address, and the cleared field's own options are already gone from its list.
    if (field === 'province') {
      onChange({ ...values, province: val, district: '', commune: '', village: '' })
    } else if (field === 'district') {
      onChange({ ...values, district: val, commune: '', village: '' })
    } else if (field === 'commune') {
      onChange({ ...values, commune: val, village: '' })
    } else {
      onChange({ ...values, [field]: val })
    }
  }

  // Adding a place both records it for next time and selects it here, so the operator is
  // not left having to pick the thing they just typed.
  function addAndSelect(level, key, field, name) {
    dispatch({ type: 'ADD_GEO_VALUE', level, key, value: name })
    handleChange(field, name)
  }

  const labelCls = 'block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1'
  const inputCls = 'w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-400 transition'
  // Matches the plain inputs beside it rather than SearchableSelect's own larger default.
  const triggerCls = 'px-3 py-2 text-xs rounded-lg border-slate-200 dark:border-slate-600 dark:bg-slate-700 focus:ring-brand-500/40 focus:border-brand-400'

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
          <MapPin className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
          {label}
        </p>
        {action}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div>
          <label className={labelCls}>Province</label>
          <SearchableSelect
            value={values.province}
            onChange={val => handleChange('province', val)}
            options={provinces}
            triggerPlaceholder="Select Province"
            placeholder="Search or type a new province…"
            emptyText="No province on file — type to add one."
            triggerClassName={triggerCls}
            onCreate={name => addAndSelect('provinces', null, 'province', name)}
            createLabel={q => `Add province "${q}"`}
          />
        </div>
        <div>
          <label className={labelCls}>District</label>
          <SearchableSelect
            value={values.district}
            onChange={val => handleChange('district', val)}
            options={districts}
            disabled={!values.province}
            triggerPlaceholder="Select District"
            placeholder="Search or type a new district…"
            emptyText="No district on file — type to add one."
            triggerClassName={triggerCls}
            onCreate={name => addAndSelect('districts', districtKey, 'district', name)}
            createLabel={q => `Add district "${q}"`}
          />
        </div>
        <div>
          <label className={labelCls}>Commune</label>
          <SearchableSelect
            value={values.commune}
            onChange={val => handleChange('commune', val)}
            options={communes}
            disabled={!values.district}
            triggerPlaceholder="Select Commune"
            placeholder="Search or type a new commune…"
            emptyText="No commune on file — type to add one."
            triggerClassName={triggerCls}
            onCreate={name => addAndSelect('communes', communeKey, 'commune', name)}
            createLabel={q => `Add commune "${q}"`}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div>
          <label className={labelCls}>Village</label>
          <SearchableSelect
            value={values.village}
            onChange={val => handleChange('village', val)}
            options={villages}
            disabled={!values.commune}
            triggerPlaceholder="Select Village"
            placeholder="Search or type a new village…"
            emptyText="No village on file — type to add one."
            triggerClassName={triggerCls}
            onCreate={name => addAndSelect('villages', villageKey, 'village', name)}
            createLabel={q => `Add village "${q}"`}
          />
        </div>
        <div>
          <label className={labelCls}>House #</label>
          <input type="text" placeholder="e.g. 24A" value={values.house} onChange={e => handleChange('house', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Street #</label>
          <input type="text" placeholder="e.g. 271" value={values.street} onChange={e => handleChange('street', e.target.value)} className={inputCls} />
        </div>
      </div>
    </div>
  )
}
