import { User, Phone, Mail, MapPin, Calendar, Heart, IdCard, Flag, VenusAndMars } from 'lucide-react'

function Section({ icon: Icon, title, children }) {
  return (
    <div className="flex-1 min-w-[220px] px-4 py-4 first:pl-4 sm:first:pl-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded-lg bg-brand-50 dark:bg-brand-900/30 flex items-center justify-center flex-shrink-0">
          <Icon className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400" />
        </div>
        <span className="text-[11px] font-bold text-brand-600 dark:text-brand-400 uppercase tracking-wide">{title}</span>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Line({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 mt-0.5 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] text-slate-400 dark:text-slate-500">{label}</p>
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 break-words">{value || 'N/A'}</p>
      </div>
    </div>
  )
}

// Three-column Personal / Contact / Identification snapshot shared by the customer
// profile preview and the Borrower/Co-Borrower/Guarantor blocks in Loan Detail.
export default function PersonInfoGrid({ personal, contact, identification, showIdType = true }) {
  return (
    <div className="flex flex-col sm:flex-row divide-y sm:divide-y-0 sm:divide-x divide-slate-100 dark:divide-slate-700">
      <Section icon={User} title="Personal Information">
        <Line icon={User} label="Khmer Name" value={personal.khName} />
        <Line icon={User} label="English Name" value={personal.enName} />
        <Line icon={Calendar} label="Date of Birth" value={personal.dob} />
        <Line icon={VenusAndMars} label="Gender" value={personal.gender} />
        <Line icon={Heart} label="Marital Status" value={personal.maritalStatus} />
      </Section>
      <Section icon={Phone} title="Contact Information">
        <Line icon={Phone} label="Phone Number" value={contact.phone} />
        <Line icon={Mail} label="Email" value={contact.email} />
        <Line icon={MapPin} label="Current Address" value={contact.currentAddress} />
        <Line icon={MapPin} label="Permanent Address" value={contact.permanentAddress} />
      </Section>
      <Section icon={IdCard} title="Identification">
        <Line icon={IdCard} label="National ID" value={identification.idNo} />
        <Line icon={Flag} label="Nationality" value="Khmer" />
        {showIdType && <Line icon={IdCard} label="ID Type" value={identification.idType} />}
      </Section>
    </div>
  )
}
