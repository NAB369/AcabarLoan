import { useMemo, useRef, useState } from 'react'
import { X, ImagePlus, Trash2 } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { LEGAL_ID_TYPES, NATIONALITIES, PHONE_CODES, EMPTY_ADDRESS } from '../../data/constants'
import AddressFields from '../shared/AddressFields'
import { nextEmployeeNo, employeeName, splitFullName, employeeEmail, splitEmail } from '../../utils/employee'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// Field styling shared by every control on the form — one place so the whole page keeps a
// single input height and focus ring. The width is kept out of the base string: a field that
// wants its own width can't override `w-full` from here, since Tailwind emits `w-full` after
// the numeric widths and it would win regardless of class order.
const FIELD = 'h-auto px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 shadow-none focus-visible:ring-0 focus:outline-none focus:ring-2 focus:ring-brand-500/40 focus:border-brand-400 transition'
const INPUT = `w-full ${FIELD}`
// Selects keep the native arrow — the form has six of them and a custom chevron on each
// only adds markup.
const SELECT = INPUT
// The dial code beside a phone number is the one field sized to its content.
const CODE_SELECT = `w-20 ${FIELD}`

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// What the payroll audit log names field by field on an edit: pay, rank, the number the
// register is keyed on and the account the pay lands in. Anything else this form touches
// (a phone number, an address) is left unnamed rather than spelling out every field — the
// log line says the record was edited, and the record itself shows what it now holds.
const AUDITED_FIELDS = [
  ['salary', 'salary'],
  ['position', 'position'],
  ['employeeNo', 'employee no.'],
  ['accountNumber', 'account no.'],
]

// One labelled row. The label sits in its own column on desktop and stacks above the field
// on narrow screens, so the form stays usable on a phone without a second layout.
function Row({ label, required, children, align = 'center' }) {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-[150px_1fr] gap-1.5 sm:gap-4 ${align === 'start' ? 'sm:items-start' : 'sm:items-center'}`}>
      <Label className={`text-xs font-medium text-slate-600 dark:text-slate-300 ${align === 'start' ? 'sm:pt-2' : ''}`}>
        {label}
        {required && <span className="text-rose-500 ml-1">•</span>}
      </Label>
      {/* Capped rather than filling the column — full-width inputs stretch to the far edge
          of a desktop page and read as a wall of boxes. */}
      <div className="min-w-0 sm:max-w-xl">{children}</div>
    </div>
  )
}

// A dial code beside a number, as three of the contact rows need.
function PhoneField({ code, number, onCode, onNumber, placeholder, required }) {
  return (
    <div className="flex gap-2">
      <select value={code} onChange={e => onCode(e.target.value)} className={`${CODE_SELECT} flex-shrink-0`}>
        {PHONE_CODES.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <Input
        type="tel" inputMode="tel" value={number} required={required} placeholder={placeholder}
        onChange={e => onNumber(e.target.value.replace(/[^\d\s-]/g, ''))}
        className={`${INPUT} sm:max-w-[220px]`}
      />
    </div>
  )
}

export default function EmployeeForm({ employee, onDone }) {
  const { state, dispatch, showToast } = useApp()
  const { employees } = state
  const editing = !!employee
  const photoInputRef = useRef(null)

  const [form, setForm] = useState(() => ({
    // One name field, read back joined. employeeName handles both the first/last split the
    // record stores and the given/family one saved before the rename.
    fullName: employeeName(employee),
    photo: employee?.photo || '',
    employeeNo: employee?.employeeNo || '',
    legalIdType: employee?.legalIdType || LEGAL_ID_TYPES[0],
    legalId: employee?.legalId || '',
    gender: employee?.gender || 'Male',
    dob: employee?.dob || '',
    nationality: employee?.nationality || 'Cambodian',
    position: employee?.position || '',
    salary: employee?.salary ?? '',
    // The bank account the salary is paid into.
    accountNumber: employee?.accountNumber || '',
    mobileCode: employee?.mobileCode || '+855', mobileNo: employee?.mobileNo || '',
    emergencyCode: employee?.emergencyCode || '+855', emergencyNo: employee?.emergencyNo || '',
    // One field for the whole address, read back joined from the pair the record stores.
    email: employeeEmail(employee),
    entryDate: employee?.entryDate || todayISO(),
    // The same province → district → commune → village + house/street shape a customer
    // address uses, edited by the same shared component.
    address: (employee?.address && typeof employee.address === 'object')
      ? { ...EMPTY_ADDRESS, ...employee.address }
      : { ...EMPTY_ADDRESS },
  }))
  // A new record numbers itself off the entry date; an existing one keeps the number it was
  // issued unless the user deliberately switches Auto back on.
  const [autoNo, setAutoNo] = useState(!editing)
  const [error, setError] = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Auto mode shows the number the save would issue, recomputed as the entry date changes.
  const autoEmployeeNo = useMemo(
    () => nextEmployeeNo(employees.filter(e => e.id !== employee?.id), form.entryDate),
    [employees, employee?.id, form.entryDate]
  )
  const employeeNo = autoNo ? autoEmployeeNo : form.employeeNo

  function handlePhoto(file) {
    if (!file) return
    if (!/^image\/(png|jpe?g)$/i.test(file.type)) {
      showToast('Photo must be a JPG or PNG file', 'error')
      return
    }
    const reader = new FileReader()
    reader.onload = e => set('photo', e.target.result)
    reader.readAsDataURL(file)
  }

  function handleSubmit(e) {
    e.preventDefault()
    const no = (employeeNo || '').trim()
    if (!no) { setError('Employee No. is required.'); return }
    if (employees.some(x => x.id !== employee?.id && x.employeeNo === no)) {
      setError(`Employee No. ${no} is already used by ${employeeName(employees.find(x => x.employeeNo === no)) || 'another employee'}.`)
      return
    }
    setError('')

    const email = splitEmail(form.email)

    const record = {
      id: employee?.id || `EMP-${Date.now().toString(36).toUpperCase()}`,
      employeeNo: no,
      photo: form.photo,
      // Split the one field the same way the CSV import does — first word is the first
      // name, the rest the last — so both entry paths store the record identically.
      nameEnglish: splitFullName(form.fullName),
      // The form no longer collects a Khmer name, but records that already carry one keep
      // it: the search box and the preview still read it, and an edit here is not a
      // reason to drop a value this form never showed the user.
      nameKhmer: employee?.nameKhmer || { first: '', last: '' },
      legalIdType: form.legalIdType,
      legalId: form.legalId.trim(),
      gender: form.gender,
      dob: form.dob,
      nationality: form.nationality,
      position: form.position.trim(),
      // Monthly gross, in USD like every other configured amount in the app. A payroll run
      // only picks up employees that carry one.
      salary: form.salary === '' ? 0 : Number(form.salary),
      accountNumber: form.accountNumber.trim(),
      // Office No. is no longer collected here, but a record that already carries one keeps
      // it — the register lists it and the preview reads it, and an edit through a form that
      // never showed the field is not a reason to clear it.
      officeCode: employee?.officeCode || '+855', officeNo: employee?.officeNo || '',
      mobileCode: form.mobileCode, mobileNo: form.mobileNo.trim(),
      emergencyCode: form.emergencyCode, emergencyNo: form.emergencyNo.trim(),
      // Stored as the local/domain pair every reader already expects, split from the one
      // field the form collects — same as the CSV import path.
      emailLocal: email.local, emailDomain: email.domain,
      entryDate: form.entryDate,
      // Not edited here any more, but kept on the record: a payroll run reads it to decide
      // who was on staff for the period (see isOnPayroll), so clearing it would put someone
      // who has left back onto every future run.
      leaveDate: employee?.leaveDate || '',
      address: form.address,
    }

    dispatch({ type: editing ? 'UPDATE_EMPLOYEE' : 'ADD_EMPLOYEE', employee: record })
    // Audited: who was added or edited, and on an edit what actually changed — a salary or a
    // position moving is the reason the register is audited at all. Nothing else in the module
    // records an employee change, and a removal leaves no record behind to read, so these
    // events are written to the audit trail as they happen rather than derived later.
    const name = employeeName(record) || no
    // Only an edit has a before to compare against — an add is entirely new, and every
    // field it filled in is on the record for the register to show.
    const changes = editing
      ? AUDITED_FIELDS
        .filter(([key]) => String(employee[key] ?? '') !== String(record[key] ?? ''))
        .map(([key, label]) => `${label} ${employee[key] || '—'} → ${record[key] || '—'}`)
      : []
    if (editing && employeeName(employee) !== name) changes.unshift(`name ${employeeName(employee) || '—'} → ${name}`)
    dispatch({
      type: 'ADD_AUDIT_LOG',
      log: {
        module: 'Payroll',
        action: editing
          ? `Employee updated — ${name}${changes.length ? ` · ${changes.join(', ')}` : ''}`
          : `Employee added — ${name}${record.position ? ` · ${record.position}` : ''}`,
        reference: no,
        // The salary is the money side of the event, so it goes in the log's Amount column —
        // on an edit only when it was the thing that changed.
        amount: (!editing || changes.some(c => c.startsWith('salary'))) ? (record.salary || null) : null,
      },
    })
    showToast(editing ? 'Employee updated' : `Employee ${no} added`, 'success')
    onDone()
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onDone}>
      <form
        onSubmit={handleSubmit}
        onClick={e => e.stopPropagation()}
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex-shrink-0">
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">
            {editing ? 'Edit an Employee' : 'Add an Employee'}
          </h2>
          <Button
            type="button" variant="ghost" size="icon" onClick={onDone}
            className="h-auto w-auto p-0 hover:bg-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* The fields scroll inside the modal so Cancel/Save stay in reach */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-10">
          {/* Photo — click the frame to pick a file; the preview replaces the prompt */}
          <div className="flex-shrink-0 mx-auto lg:mx-0">
            <Button
              type="button" variant="ghost" onClick={() => photoInputRef.current?.click()}
              className="w-[120px] h-[120px] p-0 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50/60 dark:bg-slate-700/40 hover:bg-slate-50/60 dark:hover:bg-slate-700/40 flex flex-col items-center justify-center gap-1.5 overflow-hidden hover:border-brand-400 transition-colors"
            >
              {form.photo
                ? <img src={form.photo} alt="Employee photo" className="w-full h-full object-cover" />
                : (
                  <>
                    <ImagePlus className="w-5 h-5 text-brand-500" />
                    <span className="text-[11px] font-semibold text-brand-600 dark:text-brand-400">Add a Photo +</span>
                  </>
                )}
            </Button>
            <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center mt-2">JPG, PNG File</p>
            {form.photo && (
              <Button
                type="button" variant="ghost" onClick={() => set('photo', '')}
                className="h-auto w-auto p-0 mx-auto mt-1 flex items-center gap-1 text-[10px] font-semibold text-slate-400 hover:text-rose-600 hover:bg-transparent transition-colors"
              >
                <Trash2 className="w-3 h-3" /> Remove
              </Button>
            )}
            <input
              ref={photoInputRef} type="file" accept="image/png,image/jpeg" className="hidden"
              onChange={e => { handlePhoto(e.target.files?.[0]); e.target.value = '' }}
            />
          </div>

          {/* Fields */}
          <div className="flex-1 min-w-0 space-y-3">
            <Row label="Full Name" required>
              <Input required value={form.fullName} onChange={e => set('fullName', e.target.value)} placeholder="Enter Full Name" className={INPUT} />
            </Row>

            <Row label="Employee No." required>
              <div className="flex items-center gap-3">
                <Input
                  value={employeeNo} readOnly={autoNo} required
                  onChange={e => set('employeeNo', e.target.value)}
                  placeholder="e.g. 20260730_001"
                  className={`${INPUT} sm:max-w-xs ${autoNo ? 'bg-slate-100 dark:bg-slate-700/70 text-slate-500 dark:text-slate-400' : ''}`}
                />
                <label className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap cursor-pointer">
                  <input
                    type="checkbox" checked={autoNo}
                    onChange={e => {
                      setAutoNo(e.target.checked)
                      // Leaving Auto hands the generated number over as the starting point.
                      if (!e.target.checked) set('employeeNo', autoEmployeeNo)
                    }}
                    className="w-3.5 h-3.5 accent-brand-600"
                  />
                  Auto
                </label>
              </div>
            </Row>

            <Row label="Legal ID" required>
              <div className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-2">
                <select value={form.legalIdType} onChange={e => set('legalIdType', e.target.value)} className={SELECT}>
                  {LEGAL_ID_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                <Input required value={form.legalId} onChange={e => set('legalId', e.target.value)} placeholder={`Enter ${form.legalIdType} Number`} className={INPUT} />
              </div>
            </Row>

            <Row label="Gender" required>
              <div className="flex items-center gap-6">
                {['Male', 'Female'].map(g => (
                  <label key={g} className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer">
                    <input type="radio" name="gender" value={g} checked={form.gender === g} onChange={() => set('gender', g)} className="w-3.5 h-3.5 accent-brand-600" />
                    {g}
                  </label>
                ))}
              </div>
            </Row>

            <Row label="Date of Birth" required>
              <Input type="date" required value={form.dob} max={todayISO()} onChange={e => set('dob', e.target.value)} className={`${INPUT} sm:max-w-xs`} />
            </Row>

            <Row label="Nationality" required>
              <select value={form.nationality} onChange={e => set('nationality', e.target.value)} className={SELECT}>
                {NATIONALITIES.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </Row>

            <Row label="Position(Internal)">
              <Input value={form.position} onChange={e => set('position', e.target.value)} placeholder="Enter Position(Internal)" className={INPUT} />
            </Row>

            <Row label="Monthly Salary (USD)">
              <Input
                type="number" min="0" step="0.01" value={form.salary}
                onChange={e => set('salary', e.target.value)}
                placeholder="e.g. 600" className={`${INPUT} sm:max-w-[220px]`}
              />
            </Row>

            {/* Sits under the salary because it is where that salary is paid */}
            <Row label="Account Number">
              <Input
                value={form.accountNumber}
                onChange={e => set('accountNumber', e.target.value)}
                placeholder="Enter Account Number" className={`${INPUT} sm:max-w-xs`}
              />
            </Row>

            <Row label="Mobile No." required>
              <PhoneField required code={form.mobileCode} number={form.mobileNo} onCode={v => set('mobileCode', v)} onNumber={v => set('mobileNo', v)} placeholder="Enter Mobile No." />
            </Row>

            <Row label="Emergency No.">
              <PhoneField code={form.emergencyCode} number={form.emergencyNo} onCode={v => set('emergencyCode', v)} onNumber={v => set('emergencyNo', v)} placeholder="Enter Emergency No." />
            </Row>

            {/* One field for the whole address. type="email" means the browser checks the
                shape, which the split pair could not do — neither half was an address. */}
            <Row label="Email" required>
              <Input
                type="email" required value={form.email} placeholder="Enter Email"
                onChange={e => set('email', e.target.value.replace(/\s/g, ''))}
                className={INPUT}
              />
            </Row>

            <Row label="Entry Date">
              <Input type="date" value={form.entryDate} onChange={e => set('entryDate', e.target.value)} className={`${INPUT} sm:max-w-xs`} />
            </Row>

            {/* The shared address picker, the same one the customer wizard and the loan
                co-borrower/guarantor forms use — cascading Province → District → Commune →
                Village selects with House # and Street # beside them. Its own MapPin
                heading names the block, so the Row label is dropped rather than repeated. */}
            <div className="pt-1">
              <AddressFields label="Home Address" values={form.address} onChange={addr => set('address', addr)} />
            </div>

            {error && (
              <p className="text-xs font-semibold text-rose-600 dark:text-rose-400 sm:ml-[166px]">{error}</p>
            )}
          </div>
        </div>
        </div>

        <div className="flex justify-end gap-3 px-4 sm:px-6 py-4 border-t border-slate-100 dark:border-slate-700 flex-shrink-0">
          <Button
            type="button" variant="outline" onClick={onDone}
            className="h-auto shadow-none px-6 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            Cancel
          </Button>
          <Button type="submit" className="h-auto px-8 py-2 text-sm font-bold text-white bg-brand-600 hover:bg-brand-700 rounded-xl transition-colors">
            Save
          </Button>
        </div>
      </form>
    </div>
  )
}
