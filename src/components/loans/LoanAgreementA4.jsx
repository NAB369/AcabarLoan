import { formatVal } from '../../utils/format'
import { khmerMoneyWords } from '../../utils/khmerWords'

// ── A4 replica of the institution's Khmer loan agreement (កិច្ចសន្យាខ្ចីប្រាក់) ──
// The printed form staff currently fill by hand, with every blank the loan record can answer
// already filled in. Blanks the app does not model (ID issue date and issuing authority, the
// witness, guarantor collateral) stay as dotted rules to be completed on paper — printing a
// guess into a contract someone signs is worse than leaving the line for a pen.
//
// The PRINTED TERMS are reproduced exactly as the paper form carries them, including the fixed
// percentages in articles 3, 4, 5 and 7. Only the blanks are filled. The loan's own penalty rate
// is deliberately NOT substituted into article 5: those figures are the institution's standard
// contract wording, and a system that quietly rewrites the terms of a signed agreement to match
// a per-loan setting would be changing the contract, not filling the form.

const LENDER = {
  name: 'គ្រឹះស្ថានឥណទានជនបទ អាខាបារ ម.ក',
  representative: 'ហាន ដុងអ៊ុក',
  title: 'នាយកប្រតិបត្តិ',
}

// The document is written in Khmer, so the values that name a thing are translated; digits are
// left in Latin numerals, which is how a Cambodian MFI prints money and dates on a system-
// generated contract and removes any ambiguity about an amount.
const GENDER_KH = { Male: 'ប្រុស', Female: 'ស្រី' }
const ID_TYPE_KH = {
  'National ID': 'អត្តសញ្ញាណប័ណ្ណ',
  'Passport': 'លិខិតឆ្លងដែន',
  'Family Book': 'សៀវភៅគ្រួសារ',
  'Birth Certificate': 'សំបុត្រកំណើត',
  'Residency Confirmation Letter': 'លិខិតបញ្ជាក់ទីលំនៅ',
  'Driver License': 'បណ្ណបើកបរ',
}

const dmy = value => {
  if (!value) return ''
  const d = new Date(String(value).length <= 10 ? `${value}T00:00:00` : value)
  return isNaN(d.getTime()) ? '' : `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

const pct = value => {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return ''
  return `${Math.round(n * 10000) / 10000}%`
}

// A value the record answers, printed on the rule the paper form leaves for it. An unanswered
// blank keeps its rule at full width so the form is still usable with a pen.
function Fill({ value, min = 70, bold = true }) {
  const text = (value === 0 || value) ? String(value) : ''
  return (
    <span
      className={`inline-block px-1 text-center align-bottom border-b border-dotted border-slate-500 ${bold && text ? 'font-bold text-slate-900' : 'text-slate-900'}`}
      style={{ minWidth: min }}
    >
      {text || ' '}
    </span>
  )
}

function Box({ on, children }) {
  return <span className="whitespace-nowrap">{on ? '☑' : '☐'}{children}</span>
}

// Marked as one unit so the PDF export never cuts a page through the middle of an article —
// see keepWhole where this sheet is downloaded.
function Article({ n, children }) {
  return (
    <p data-agreement-block className="mb-2 leading-[1.9] text-justify">
      <span className="font-bold">ប្រការ{n}:</span> {children}
    </p>
  )
}

function Party({ person, relationLabel }) {
  const p = person || {}
  return (
    <>
      ឈ្មោះ<Fill value={p.khName || p.enName} min={150} />ភេទ<Fill value={GENDER_KH[p.gender] || ''} min={40} />
      ថ្ងៃខែឆ្នាំកំណើត<Fill value={dmy(p.dob)} min={85} />សញ្ជាតិ<Fill value={p.khName || p.enName ? 'ខ្មែរ' : ''} min={45} />
      ឯកសារកំណត់អត្តសញ្ញាណ<Fill value={ID_TYPE_KH[p.idType] || p.idType || ''} min={95} />
      លេខ<Fill value={p.idNo} min={90} />ចុះថ្ងៃទី<Fill value="" min={70} />ចេញដោយ<Fill value="" min={80} />
      {relationLabel && <>ត្រូវជា<Fill value={p.relation || ''} min={60} /></>}
    </>
  )
}

function AddressLine({ address }) {
  const a = address && typeof address === 'object' ? address : {}
  return (
    <>
      អាសយដ្ឋានបច្ចុប្បន្នផ្ទះលេខ<Fill value={a.house} min={45} />ផ្លូវលេខ<Fill value={a.street} min={45} />ក្រុមទី<Fill value="" min={35} />
      ភូមិ<Fill value={a.village} min={90} />ឃុំ/សង្កាត់<Fill value={a.commune} min={95} />
      ស្រុក/ខណ្ឌ/ក្រុង<Fill value={a.district} min={95} />ខេត្ត/រាជធានី<Fill value={a.province} min={90} />
    </>
  )
}

function AssetRows({ items, count = 3 }) {
  const rows = Array.from({ length: count }, (_, i) => (items || [])[i] || null)
  return (
    <div className="ml-6 mb-2">
      {rows.map((item, i) => (
        <div key={i} data-agreement-block className="mb-1">
          {['១', '២', '៣'][i]}-
          <Fill value={item ? [item.label, item.docNo].filter(Boolean).join(' ') : ''} min={250} />
          ចំនួន<Fill value={item ? (item.quantity ?? 1) : ''} min={55} />
          តម្លៃ<Fill value={item?.value || ''} min={150} />
        </div>
      ))}
      <div data-agreement-block>៤-ទ្រព្យសម្បត្តិផ្សេងៗ <Fill value="" min={430} /></div>
    </div>
  )
}

const COLLATERAL_KH = { Land: 'ដីធ្លី', House: 'ផ្ទះ', Vehicle: 'យានយន្ត' }

export default function LoanAgreementA4({ loan = {}, customer = {}, collectionRate = 0, adminFeeRate = 0, sheetRef }) {
  const currency = loan.currency || 'USD'
  const coBorrower = (loan.coBorrowers || [])[0] || null
  const guarantors = loan.guarantors || []
  const collaterals = (loan.collaterals || []).map(c => ({
    label: COLLATERAL_KH[c.type] || c.type || '',
    docNo: c.docNo || '',
    value: c.value ? formatVal(c.value, currency, 1) : '',
  }))

  // The contract is made on the day it is drawn up. A loan still In Progress has no signing date
  // on file, and dating it from the planned disbursement would put a date on the page that has
  // not happened yet.
  const today = new Date()

  const address = (customer.currentAddress && typeof customer.currentAddress === 'object')
    ? customer.currentAddress
    : (loan.currentAddress || {})

  // Both rates are held per year everywhere in the app; the contract asks for the charge per
  // instalment period, which for a monthly loan is a twelfth.
  const perPeriod = rate => (Number(rate) > 0 ? Number(rate) / 12 : 0)
  const weekly = /week/i.test(loan.repaymentType || '')

  return (
    <div
      ref={sheetRef}
      className="printable-area schedule-sheet bg-white text-slate-800 border border-slate-200 rounded-xl px-10 py-8 mx-auto w-full max-w-[210mm] shadow-sm text-[14px]"
      style={{ fontFamily: "'Kantumruy Pro', 'Outfit', sans-serif" }}
    >
      {/* Kingdom heading + the two reference numbers the form carries in its top corners */}
      <div className="relative mb-4">
        <div className="text-center font-bold text-[17px] leading-7">
          <div>ព្រះរាជាណាចក្រកម្ពុជា</div>
          <div>ជាតិ សាសនា ព្រះមហាក្សត្រ</div>
        </div>
        <div className="absolute right-0 top-0 text-right leading-7">
          <div>អតិថិជនលេខ<Fill value={customer.code || loan.customerCode} min={95} /></div>
          <div>កិច្ចសន្យាលេខ<Fill value={loan.ref} min={95} /></div>
        </div>
      </div>

      <div className="text-center mb-1">
        <span className="font-bold text-[19px] underline underline-offset-4">កិច្ចសន្យាខ្ចីប្រាក់</span>
      </div>
      <div className="text-center mb-3">
        ធ្វើនៅថ្ងៃទី<Fill value={String(today.getDate()).padStart(2, '0')} min={40} />
        ខែ<Fill value={String(today.getMonth() + 1).padStart(2, '0')} min={40} />
        ឆ្នាំ<Fill value={today.getFullYear()} min={55} />
      </div>
      <div className="text-center font-bold mb-2">រវាង</div>

      <p data-agreement-block className="mb-2 leading-[1.9] text-justify">
        <span className="font-bold">១. ភាគីឲ្យខ្ចីប្រាក់៖</span> <span className="font-bold">{LENDER.name}</span> តំណាងដោយលោក{' '}
        <span className="font-bold">{LENDER.representative}</span> តួនាទីជា <span className="font-bold">{LENDER.title}</span>{' '}
        តទៅនេះហៅកាត់ថា ភាគី «ក»។
      </p>
      <div className="text-center font-bold mb-2">និង</div>

      <p data-agreement-block className="mb-2 leading-[1.9] text-justify">
        <span className="font-bold">២. ភាគីខ្ចីប្រាក់៖</span> <Party person={customer} />
        និងឈ្មោះ <Party person={coBorrower} relationLabel />
      </p>
      <p data-agreement-block className="mb-3 leading-[1.9] text-justify">
        <AddressLine address={address} /> តទៅនេះហៅកាត់ថា ភាគី «ខ»។
      </p>

      <p className="mb-3 leading-[1.9] text-justify">
        ភាគី«ខ»បានសុំខ្ចីប្រាក់ ហើយ ភាគី«ក» បានយល់ព្រមឲ្យខ្ចីប្រាក់ទៅតាមលក្ខខណ្ឌនិងប្រការទាំងឡាយដែលមានចែងដូចខាងក្រោម៖
      </p>

      <p className="font-bold mb-2">៣. កាតព្វកិច្ចរបស់គូភាគី</p>

      <Article n="១">
        ភាគី «ខ» បានសុំខ្ចីប្រាក់ ហើយភាគី«ក»បានយល់ព្រមឲ្យខ្ចីប្រាក់ ចំនួន
        <Fill value={formatVal(loan.amount, currency, 1)} min={150} /> (ជាលាយលក្ខណ៍អក្សរ
        <Fill value={loan.amount ? khmerMoneyWords(loan.amount, currency) : ''} min={250} />)។ យកទៅប្រើប្រាស់លើ
        <Fill value={loan.reasonCredit} min={200} /> ហើយភាគី«ខ» សន្យាថាមិនប្រើប្រាស់ប្រាក់កម្ចីនេះទៅលើសកម្មភាព
        ឬមុខរបរផ្ទុយនឹងច្បាប់ ប្រឆាំងនឹងក្រមសីលធម៌ក្នុងសង្គម និងមិនប៉ះពាល់ ឬបំផ្លាញបរិស្ថាន។
        ភាគី «ខ» យល់ព្រមដោយស្ម័គ្រចិត្តឲ្យភាគី «ក» តាមដាន និងត្រួតពិនិត្យ សកម្មភាពការងារអាជីវកម្មជាប្រចាំ។
      </Article>

      <Article n="២">
        កិច្ចសន្យាខ្ចីប្រាក់នេះ ភាគី «ខ» និងភាគី «ក» បានព្រមព្រៀងក្នុងការខ្ចី និងឲ្យខ្ចីប្រាក់សម្រាប់រយៈពេល
        <Fill value={loan.installments} min={55} />
        <span className="mx-1"><Box on={weekly}>សប្តាហ៍</Box> <Box on={!weekly}>ខែ</Box></span>
        ហើយ ភាគី «ខ» បានព្រមព្រៀងដោយស្ម័គ្រចិត្តបង់ការប្រាក់ឲ្យភាគី «ក» ក្នុងអត្រា
        <Fill value={pct(perPeriod(loan.interestRate))} min={70} />
        សេវាប្រមូល<Fill value={pct(perPeriod(collectionRate))} min={70} />
        សេវារដ្ឋបាល<Fill value={adminFeeRate > 0 ? `${pct(adminFeeRate)} (តែម្តង)` : ''} min={95} />
        ក្នុង
        <span className="mx-1">
          <Box on={weekly}>មួយសប្តាហ៍</Box> <Box on={false}>ពីរសប្តាហ៍</Box> <Box on={!weekly}>មួយខែ</Box>
        </span>
        លើប្រាក់ដើមជំពាក់សរុបដែលនៅលើដៃភាគី «ខ» ទៅតាមចំនួនថ្ងៃនៃការប្រើប្រាស់។
      </Article>

      <Article n="៣">
        ក្នុងករណីអតិថិជនស្នើកម្ចីថ្មីឡើងវិញ ដោយអតិថិជនចង់ទូទាត់ប្រាក់កម្ចីចាស់ដែលនៅសល់ជាមួយប្រាក់កម្ចីថ្មី
        នោះត្រូវបានកំណត់អោយអតិថិជនបង់សេវាបុនហិរញ្ញប្បទាន ២% លើកម្ចីចាស់។
      </Article>

      <Article n="៤">
        ភាគី «ខ» បានព្រមព្រៀងដោយស្ម័គ្រចិត្ត និងយល់ច្បាស់ពីនីតិវិធីបង់ប្រាក់រំលស់គឺ ភាគី «ខ» ត្រូវបង់ការប្រាក់និងប្រាក់ដើម
        ឲ្យបានទៀងទាត់តាមតារាងសងប្រាក់ឥណទាន។ ក្នុងករណីភាគី «ខ» បានបង់កម្ចីផ្តាច់មុនពាក់កណ្តាលនៃតារាងសងប្រាក់នោះ
        ភាគី «ខ» បានព្រមព្រៀងដោយស្ម័គ្រចិត្តបង់ ៣% នៃប្រាក់ដើមដែលនៅសល់។
      </Article>

      <Article n="៥">
        ក្នុងករណីភាគី «ខ» ខកខានមិនបានសងប្រាក់គ្រប់ចំនួនតាមតារាងសងប្រាក់ឥណទាន នោះភាគី «ខ» យល់ព្រមបង់ប្រាក់ពិន័យ
        ឲ្យភាគី «ក» ប្រាក់ពិន័យនេះត្រូវគណនាស្មើនឹង ២% នៃអត្រាការប្រាក់ដែលបានខ្ចីលើចំនួនទឹកប្រាក់ដែលខកខានមុនបានសង
        ឲ្យទៅតាមចំនួនថ្ងៃនៃការយឺតយ៉ាវ។
      </Article>

      <Article n="៦">
        ភាគី «ខ» សុខចិត្តដាក់វត្ថុ ឬទ្រព្យសម្បត្តិដូចខាងក្រោម ដើម្បីធានាប្រាក់កម្ចីនេះដោយសន្យាមិនលក់ដូរ
        ឬធ្វើសម្បទានអោយអ្នកផ្សេងឡើយ នៅពេលដែលខ្លួនមិនទាន់សងប្រាក់គ្រប់ចំនួន។
      </Article>
      <AssetRows items={collaterals} />

      <Article n="៧">
        សំណងនៃការខូចខាត ២៤% ក្នុងមួយ(១)ឆ្នាំ នៃប្រាក់ដើមនៅជំពាក់ សរសេរជាអក្សរ( ម្ភៃបួនភាគរយ ក្នុងមួយឆ្នាំ)
        និងរយៈពេលនៃការធានានេះអស់សុពលភាពលុះត្រាណាតែបំណុលត្រូវបានទូរទាត់សងគ្រប់ចំនួនទៅអោយភាគី(ក)ដែលជាម្ចាស់បំណុល។
      </Article>

      <Article n="៨">
        ប្រសិនបើភាគី «ខ» ខកខានមិនបានសងប្រាក់តាមពេលកំណត់នៃការសងប្រាក់ឥណទាន នោះភាគី «ខ» សុខចិត្តលក់វត្ថុ
        ឬទ្រព្យសម្បត្តិដែលបានដាក់ធានាសំណងខាងលើ ដើម្បីយកប្រាក់មកសងអោយភាគី «ក» ទាំងអស់ដែលរួមមានប្រាក់ដើម
        ការប្រាក់ និងប្រាក់ពិន័យ (ប្រសិនបើមាន)។
      </Article>

      <Article n="៩">
        ប្រសិនបើក្នុងករណីដែលភាគី «ខ» ពុំអាចលក់ដាច់នូវទ្រព្យសម្បត្តិដែលបានដាក់ធានា ដើម្បីយកប្រាក់មកទូទាត់ឲ្យភាគី «ក»
        រយៈពេលមួយខែ នោះភាគី «ខ» សុខចិត្តឲ្យអ្នកធានាបំណុលដែលខ្លួនបានធានាសងជំនួស ឬភាគី «ក» រឹបអូស ឬលក់ថ្លៃ
        នូវទ្រព្យសម្បត្តិដែលបានដាក់ធានាខាងលើ ឬទ្រព្យសម្បត្តិផ្សេងៗទៀតដែលមាន ដើម្បីសងទៅភាគី «ក» ឲ្យបានគ្រប់ទាំងអស់
        នូវប្រាក់ដែលនៅជំពាក់ (ទាំងប្រាក់ដើម ការប្រាក់ និងប្រាក់ពិន័យ)។
      </Article>

      <Article n="១០">
        ក្នុងករណីមានពាក្យបណ្តឹងមានការប្តឹងទៅអាជ្ញាធរមូលដ្ឋាន ឬតុលាការដើម្បីទាមទារយកមកវិញ នូវប្រាក់បំណុលភាគី «ខ»
        នោះភាគី «ក» មានសិទ្ធិទាមទារពីភាគី «ខ» ជាការចាំបាច់នូវថ្លៃឈ្នួលតាមផ្លូវច្បាប់ ថ្លៃចំណាយសម្រាប់កិច្ចការតុលាការ
        រួមទាំងសេវាមេធាវី ថ្លៃចំណាយលើការខាតបង់ពេលវេលា និងថ្លៃចៃដន្យផ្សេងទៀត។
      </Article>

      <Article n="១១">
        ភាគី «ខ» យល់ព្រមថាក្នុងពេលប្តូរអាសយដ្ឋានដែលបានបញ្ជាក់ក្នុងកិច្ចសន្យាខ្ចីប្រាក់នេះ ភាគី «ខ»
        ត្រូវជូនដំណឹងជាលាយលក្ខណ៍អក្សរជាមុនអោយទៅភាគី «ក» អំពីការផ្លាស់ប្តូរនោះ។
      </Article>

      <Article n="១២">
        ក្នុងករណីមរណភាព ឬក្នុងករណីមិនអាចអនុវត្តន៍កិច្ចសន្យាបានមុនចប់អាណត្តិ អ្នកស្នងស្របច្បាប់ ឬទាយាទរបស់ភាគីទាំងពីរ
        ជាអ្នកអនុវត្តន៍កិច្ចសន្យាបន្ត។
      </Article>

      <p className="font-bold mb-2 mt-3">៤. ការធានាដោយបុគ្គល៖</p>

      <Article n="១៣">
        <Party person={guarantors[0]} relationLabel />
        និងឈ្មោះ <Party person={guarantors[1]} relationLabel />
        <span className="block mt-1">
          <AddressLine address={guarantors[0]?.currentAddress} />
        </span>
        បានឯកភាព និងព្រមព្រៀងធ្វើជាអ្នកធានាអោយភាគី «ខ» ក្នុងការសងប្រាក់សំណងខាងលើជូនភាគី «ក» អោយបានគ្រប់ចំនួន
        ទាំងអស់រួមមានប្រាក់ដើម ការប្រាក់ ប្រាក់ពិន័យនិងចំណាយចៃដន្យផ្សេងៗ (ប្រសិនបើមាន)។
      </Article>

      <Article n="១៤">
        អ្នកធានាបានព្រមព្រៀងដាក់តម្កល់នូវវត្ថុ ឬទ្រព្យសម្បត្តិដែលជាកម្មសិទ្ធិរបស់ខ្លួនដូចខាងក្រោម ជូនភាគី «ក»
        ដោយសន្យាមិនលក់ផ្ទេរ ឬធ្វើសម្បទានឲ្យអ្នកផ្សេងមុនពេលដែលភាគី «ខ» មិនទាន់សងប្រាក់គ្រប់ចំនួនឲ្យភាគី «ក»។
      </Article>
      <AssetRows items={[]} />

      <Article n="១៥">
        ប្រសិនបើភាគី «ខ» មានការយឺតយ៉ាវក្នុងការសងប្រាក់មកភាគី «ក» លើសរយៈពេលមួយខែ នោះភាគីអ្នកធានា សុខចិត្តលក់
        នូវវត្ថុ ឬទ្រព្យសម្បត្តិដែលបានដាក់តម្កល់នានាខាងលើដើម្បីដកប្រាក់មកទូទាត់ជូនភាគី «ក» ជំនួសឲ្យភាគី «ខ» ទាំងអស់
        (ទាំងប្រាក់ដើម ការប្រាក់ ប្រាក់ពិន័យនិងការចំណាយដែលចៃដន្យទាំងឡាយដែលអាចមាន) ដោយឥតប្រកែកឡើយ។
      </Article>

      <p className="font-bold mb-2 mt-3">៥. សុពលភាពនៃកិច្ចសន្យាខ្ចីប្រាក់</p>

      <Article n="១៦">
        រាល់ឯកសារដូចជា ពាក្យសុំចុះឈ្មោះខ្ចីប្រាក់ តារាងសំរង់ព័ត៌មានរបស់អតិថិជន តារាងសំរង់ព័ត៌មានរបស់អ្នកធានា
        កាលវិភាគសងប្រាក់ បង្កាន់ដៃបើកប្រាក់ បង្កាន់ដៃបង់ប្រាក់ បង្កាន់ដៃទទួលបណ្ណកម្មសិទ្ធិតម្កល់ទ្រព្យធានា
        និងរាល់ឯកសារផ្សេងៗទៀត ត្រូវបានចាត់ទុកជាឧបសម្ព័ន្ធនៃកិច្ចសន្យានេះ ហើយមានសុពលភាពចាប់ពីថ្ងៃចុះហត្ថលេខានេះ
        តទៅដូចគ្នាទាំងអស់។
      </Article>

      <Article n="១៧">
        ភាគី «ក» ភាគី «ខ» និងភាគីអ្នកធានាសន្យាគោរពយ៉ាងម៉ឺងម៉ាត់នូវរាល់ប្រការនៃខសន្យានានាខាងលើ។
        ក្នុងករណីមានការអនុវត្តន៍ផ្ទុយ ឬមិនគោរពលើលក្ខខ័ណ្ឌណាមួយនៃកិច្ចសន្យានេះ ភាគីនោះត្រូវទទួលខុសត្រូវ
        ចំពោះមុខច្បាប់ជាធរមាន ដោយឡែករាល់ការកែប្រែលើចំណុចណាមួយនៃកិច្ចសន្យាខ្ចីប្រាក់នេះ ដាច់ខាតត្រូវមាន
        កិច្ចព្រមព្រៀងរវាងភាគី «ក» ភាគី «ខ» និងភាគីអ្នកធានា។
      </Article>

      <Article n="១៨">
        កិច្ចសន្យាខ្ចីប្រាក់នេះធ្វើជា ០៣ច្បាប់គឺសម្រាប់ភាគី «ក» ចំនួន០១ច្បាប់ដើម ភាគី «ខ» ចំនួន០១ច្បាប់ថតចម្លង
        និងភាគីអ្នកធានាចំនួន០១ច្បាប់ថតចម្លង ហើយមានសុពលភាពចាប់ពីថ្ងៃចុះហត្ថលេខា ឬផ្តិតមេដៃស្តាំនេះរហូតដល់ភាគី «ក»
        បានបញ្ជាក់ថាភាគី «ខ» បានសងបំណុលគ្រប់ចំនួន។
      </Article>

      <Article n="១៩">
        គូភាគីបានអាននិងយល់ព្រមដោយស្ម័គ្រចិត្តនិងប្តេជ្ញាគោរពតាមប្រការទាំងអស់នៃកិច្ចសន្យាខ្ចីប្រាក់
        ដោយគ្មានការបង្ខិតបង្ខំ។
      </Article>

      {/* Signature blocks. Kept whole so a page break never separates a name from the space
          above it that the thumbprint goes in. */}
      <div data-agreement-block className="grid grid-cols-2 gap-8 mt-8">
        <div className="text-center">
          <p className="font-bold mb-16">ស្នាមមេដៃស្តាំភាគីខ្ចីប្រាក់ភាគី «ខ»</p>
          <div className="flex justify-center gap-6">
            <span>ឈ្មោះ<Fill value={customer.khName || customer.enName} min={110} bold={false} /></span>
            <span>ឈ្មោះ<Fill value={coBorrower?.khName || coBorrower?.enName} min={110} bold={false} /></span>
          </div>
        </div>
        <div className="text-center">
          <p className="font-bold mb-16">តំណាងភាគីឲ្យខ្ចីប្រាក់ភាគី «ក»</p>
          <div className="flex justify-center">
            <Fill value={LENDER.representative} min={230} bold={false} />
          </div>
        </div>
      </div>

      <div data-agreement-block className="grid grid-cols-2 gap-8 mt-8">
        <div className="text-center">
          <p className="font-bold mb-16">ស្នាមមេដៃសាក្សី</p>
          <div className="flex justify-center">
            <span>ឈ្មោះ<Fill value="" min={180} bold={false} /></span>
          </div>
        </div>
        <div className="text-center">
          <p className="font-bold mb-16">ស្នាមមេដៃភាគីអ្នកធានា</p>
          <div className="flex justify-center gap-6">
            <span>ឈ្មោះ<Fill value={guarantors[0]?.khName || guarantors[0]?.enName} min={110} bold={false} /></span>
            <span>ឈ្មោះ<Fill value={guarantors[1]?.khName || guarantors[1]?.enName} min={110} bold={false} /></span>
          </div>
        </div>
      </div>
    </div>
  )
}
