import { X, User, Pencil, IdCard, Phone, MapPin, CalendarDays } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { employeeName, employeePhone, employeeEmail, employeeAddress } from '../../utils/employee'
import { formatDateDisplay, formatVal } from '../../utils/format'

// One block of the record. Sections stack in a single column and the divider between them
// carries the grouping, so nothing needs a card of its own.
function Section({ icon: Icon, title, children }) {
  return (
    <section className="py-5 last:pb-0">
      <p className="flex items-center gap-2 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-3.5">
        {Icon && <Icon className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />}
        {title}
      </p>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

// Every field the form collects gets a line, whether or not it was filled in — a blank one
// reads N/A. Dropping the row instead would leave the reader unable to tell "nothing was
// entered" from "this record has no such field", and the label order shifting per employee
// makes two records hard to compare side by side. N/A is greyed so a screen of real values
// still reads as the content and the gaps recede.
function Field({ label, value }) {
  const filled = value || value === 0
  return (
    <div className="flex gap-2">
      <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium w-40 flex-shrink-0">{label}</span>
      <span className={`text-xs font-medium flex-1 min-w-0 ${filled ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'}`}>
        {filled ? value : 'N/A'}
      </span>
    </div>
  )
}

// Read-only view of one staff record — what a row click opens. Editing is a step away
// rather than the default, so a click meant as "let me look" cannot change anything.
export default function EmployeePreview({ employee, onClose, onEdit }) {
  const { state } = useApp()
  const { currency } = state
  const fullName = employeeName(employee)
  // A structured address is listed part by part, the way the form collects it. Records saved
  // before the picker carry flat address1/city fields instead, and those have no parts to
  // list, so they fall back to the single joined line employeeAddress builds.
  const addr = employee.address && typeof employee.address === 'object' ? employee.address : null
  const legacyAddress = addr ? '' : employeeAddress(employee)

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex-shrink-0">
          <h2 className="text-base font-bold text-slate-800 dark:text-slate-100">Employee Information</h2>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={onEdit}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-brand-600 hover:bg-brand-700 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 divide-y divide-slate-100 dark:divide-slate-700">
          {/* Who this is, ahead of the detail sections */}
          <div className="flex items-center gap-3 pb-5">
            {employee.photo ? (
              <img src={employee.photo} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 flex items-center justify-center flex-shrink-0">
                <User className="w-5 h-5 text-slate-400 dark:text-slate-500" />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">
                {fullName || employee.employeeNo}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                {[employee.position, employee.employeeNo].filter(Boolean).join(' · ')}
              </p>
            </div>
          </div>

          {/* The sections list exactly what Add an Employee collects, in the order the form
              asks for it. Nothing the form no longer has a field for is reported here. */}
          <Section icon={IdCard} title="Identity">
            <Field label="Full Name" value={fullName} />
            <Field label="Employee No." value={employee.employeeNo} />
            <Field label="ID Type" value={employee.legalIdType} />
            <Field label="Legal ID" value={employee.legalId} />
            <Field label="Gender" value={employee.gender} />
            <Field label="Date of Birth" value={formatDateDisplay(employee.dob)} />
            <Field label="Nationality" value={employee.nationality} />
          </Section>

          <Section icon={CalendarDays} title="Employment">
            <Field label="Position (Internal)" value={employee.position} />
            <Field label="Monthly Salary" value={employee.salary ? formatVal(employee.salary, currency) : ''} />
            <Field label="Account Number" value={employee.accountNumber} />
            <Field label="Entry Date" value={formatDateDisplay(employee.entryDate)} />
          </Section>

          <Section icon={Phone} title="Contact">
            <Field label="Mobile No." value={employeePhone(employee.mobileCode, employee.mobileNo)} />
            <Field label="Emergency No." value={employeePhone(employee.emergencyCode, employee.emergencyNo)} />
            <Field
              label="Email"
              value={employeeEmail(employee) && (
                <a href={`mailto:${employeeEmail(employee)}`} className="hover:text-[#0047ab] dark:hover:text-blue-400 hover:underline">
                  {employeeEmail(employee)}
                </a>
              )}
            />
          </Section>

          <Section icon={MapPin} title="Home Address">
            {addr ? (
              <>
                <Field label="Province/City" value={addr.province} />
                <Field label="District" value={addr.district} />
                <Field label="Commune" value={addr.commune} />
                <Field label="Village" value={addr.village} />
                <Field label="House #" value={addr.house} />
                <Field label="Street #" value={addr.street} />
              </>
            ) : (
              <Field label="Address" value={legacyAddress} />
            )}
          </Section>
        </div>
      </div>
    </div>
  )
}
