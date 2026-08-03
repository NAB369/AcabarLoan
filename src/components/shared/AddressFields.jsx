import { MapPin } from 'lucide-react'
import { KH_PROVINCES, getDistricts, getCommunes, getVillages } from '../../data/geoData'

export default function AddressFields({ label, values, onChange }) {
  const districts = getDistricts(values.province)
  const communes = getCommunes(values.district)
  const villages = getVillages(values.commune)

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

  const selectCls = 'w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-400 transition'
  const inputCls = 'w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-400 transition'

  return (
    <div className="space-y-3">
      <p className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">
        <MapPin className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
        {label}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div>
          <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Province</label>
          <select value={values.province} onChange={e => handleChange('province', e.target.value)} className={selectCls}>
            <option value="">Select Province</option>
            {KH_PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">District</label>
          <select value={values.district} onChange={e => handleChange('district', e.target.value)} className={selectCls} disabled={!values.province}>
            <option value="">Select District</option>
            {districts.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Commune</label>
          <select value={values.commune} onChange={e => handleChange('commune', e.target.value)} className={selectCls} disabled={!values.district}>
            <option value="">Select Commune</option>
            {communes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <div>
          <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Village</label>
          {/* A dropdown for the communes the village list covers, a free-text field for the
              rest — the list is not a full national gazetteer, and a commune missing from it
              must still be addressable rather than locked to an empty menu. */}
          {villages.length > 0 ? (
            <select value={values.village} onChange={e => handleChange('village', e.target.value)} className={selectCls}>
              <option value="">Select Village</option>
              {villages.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          ) : (
            <input
              type="text" placeholder="Village" value={values.village}
              onChange={e => handleChange('village', e.target.value)}
              className={inputCls} disabled={!values.commune}
            />
          )}
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">House #</label>
          <input type="text" placeholder="e.g. 24A" value={values.house} onChange={e => handleChange('house', e.target.value)} className={inputCls} />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">Street #</label>
          <input type="text" placeholder="e.g. 271" value={values.street} onChange={e => handleChange('street', e.target.value)} className={inputCls} />
        </div>
      </div>
    </div>
  )
}
