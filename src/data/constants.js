import { KH_PROVINCES } from './geoData'

export const EMPTY_ADDRESS = { province: '', district: '', commune: '', village: '', house: '', street: '' }

// Loan origination branches — one per province, Phnom Penh's named HQ rather than
// "Phnom Penh Branch" since that's where the company itself is based. Shared by the loan
// wizard/detail branch pickers and the real bank account modal's branch field.
export const BRANCHES = KH_PROVINCES.map(p => p === 'Phnom Penh' ? 'Phnom Penh HQ' : `${p} Branch`)

export const OCCUPATIONS = [
  'Accountant', 'Bank Employee', 'Business Owner', 'Carpenter', 'Construction Worker',
  'Doctor', 'Domestic Worker', 'Electrician', 'Engineer', 'Farmer', 'Fisherman',
  'Garment Factory Worker', 'Government Officer', 'Hairdresser', 'Homemaker',
  'Hotel Staff', 'Mechanic', 'Military Officer', 'Moto Taxi Driver', 'NGO Worker',
  'Nurse', 'Police Officer', 'Restaurant Owner', 'Retired', 'Shop Owner',
  'Small Business Trader', 'Street Vendor', 'Student', 'Tailor', 'Taxi Driver',
  'Teacher', 'Tour Guide', 'Tuk Tuk Driver', 'Other',
]

export const IDENTITY_DOC_TYPES = ['National ID', 'Passport', 'Family Book', 'Residency Confirmation Letter', 'Birth Certificate', 'Other']
export const FINANCIAL_DOC_TYPES = ['Transaction Record', 'Payslip', 'Bank Statement', 'Certificate of Employment', 'Business License', 'Other']

export const COLLATERAL_DOC_TYPES_BY_TYPE = {
  'Land': ['Hard Title Certificate', 'Soft Title Certificate', 'Land Title Copy', 'Cadastral Map', 'Land Valuation Report', 'Property Photos', 'Sale & Purchase Agreement', 'Property Tax Receipt', 'Land Measurement Report'],
  'Vehicle': ['Vehicle Registration Card', 'Vehicle Ownership Certificate', 'Vehicle Valuation Report', 'Vehicle Insurance Certificate', 'Vehicle Inspection Certificate', 'Purchase Invoice / Sale Agreement', 'Road Tax Receipt', 'Vehicle Photos'],
  'House': ['House Ownership Certificate', 'Land Title / Ownership Certificate', 'Construction Permit', 'House Valuation Report', 'Property Photos', 'Property Tax Receipt', 'Sale & Purchase Agreement', 'Insurance Certificate', 'Floor Plan / Building Layout'],
}

export function getCollateralDocTypes(collateralType) {
  return COLLATERAL_DOC_TYPES_BY_TYPE[collateralType] || ['Valuation Report', 'Other']
}

// How a loan retires its principal. Amortizing is the ordinary product — a level instalment that
// closes the balance on the last one. Balloon leaves a share of the principal standing to the end
// and collects it as the final instalment, which is what a seasonal borrower needs: an
// agricultural loan services interest through the growing months and clears the principal after
// harvest, and land-title-secured lending is written the same way. Decline retires an equal slice
// of principal every month and charges interest on what is still outstanding, so the instalment
// starts high and falls — the borrower pays less interest overall than on the level product, which
// suits a salaried borrower who wants the loan off their books quickly. See amortizePeriods in
// utils/format.js for how one calculation covers all three, and BALLOON_INTEREST_ONLY_PERCENT for
// the interest-only case a 100% residual amounts to.
export const LOAN_STRUCTURES = ['Amortizing', 'Balloon', 'Decline']

// What the officer chooses between in the wizard. The label is deliberately longer than the stored
// value on Decline ("Decline Schedule") — the stored value is what every schedule rebuild branches
// on and must stay stable, the label is what a loan officer reads.
export const LOAN_STRUCTURE_OPTIONS = [
  {
    value: 'Amortizing',
    label: 'Amortizing',
    tag: 'Recommended',
    description: 'Equal payments covering interest & principal.',
  },
  {
    value: 'Balloon',
    label: 'Balloon',
    tag: 'Low start',
    description: 'Small monthly payments + large final sum.',
  },
  {
    value: 'Decline',
    label: 'Decline Schedule',
    tag: 'Fast payoff',
    description: 'Higher payments initially that decrease.',
  },
]

export const BALLOON_INTEREST_ONLY_PERCENT = 100
// What a balloon is quoted at when the officer hasn't said otherwise. A third of the principal
// left to the end is the common shape here; interest-only is the deliberate 100% choice, not
// something to land on by default.
export const DEFAULT_BALLOON_PERCENT = 30

export const RELATIONS = ['Spouse', 'Parent', 'Child', 'Sibling', 'Relative', 'Friend', 'Business Partner', 'Colleague', 'Other']

export const REGISTRATION_STATUSES = ['Registered', 'Pending Registration', 'Unregistered']

export const LAND_TITLE_TYPES = ['Hard Title', 'Soft Title', 'Certificate of Occupancy', 'Other']
export const LAND_USE_TYPES = ['Residential', 'Commercial', 'Agricultural', 'Industrial', 'Mixed Use', 'Other']

export const HOUSE_TYPES = ['Single Family House', 'Villa', 'Townhouse', 'Flat / Apartment', 'Other']
export const CONSTRUCTION_TYPES = ['Concrete', 'Wood', 'Steel Frame', 'Brick', 'Mixed', 'Other']

export const ENCUMBRANCE_STATUSES = ['Clear / Unencumbered', 'Mortgaged', 'Under Litigation', 'Other']

// ─── Payroll: employee register ───────────────────────────────────────────────
export const LEGAL_ID_TYPES = ['National ID', 'Passport', 'Family Book', 'Driver License', 'Other']

export const NATIONALITIES = [
  'Cambodian', 'Chinese', 'Filipino', 'French', 'Indian', 'Indonesian', 'Japanese',
  'Korean', 'Lao', 'Malaysian', 'Singaporean', 'Thai', 'Vietnamese', 'American',
  'Australian', 'British', 'Other',
]

// Dial codes offered beside a phone field — Cambodia first, then the countries staff
// records most often carry.
export const PHONE_CODES = ['+855', '+66', '+84', '+856', '+65', '+60', '+62', '+63', '+86', '+81', '+82', '+91', '+44', '+61', '+1', '+33']

export const COUNTRIES = [
  'Cambodia', 'China', 'France', 'India', 'Indonesia', 'Japan', 'Korea', 'Laos',
  'Malaysia', 'Philippines', 'Singapore', 'Thailand', 'United Kingdom',
  'United States', 'Vietnam', 'Other',
]

// ─── Cash count: notes and coins a till is counted in ─────────────────────────
// Highest first, so a cashier counts down the drawer the way they stack it. Riel
// circulates as notes only; the US coins below the dollar are listed because a branch
// taking dollar cash over the counter does receive them as change.
//
// The cent has to be on the list even though US coins barely circulate in Cambodia:
// an amortized installment lands on figures like 582.88, so a drawer holding one can
// only be counted exactly if every cent of it is countable. Without the 1¢ row the
// smallest step would be 5¢ and such a till would report SHORT or OVER however
// carefully it was counted. Where the branch settles the odd cents in riel instead,
// they are counted in the riel till — the two drawers are counted separately.
export const CASH_DENOMINATIONS = {
  USD: [100, 50, 20, 10, 5, 2, 1, 0.5, 0.25, 0.1, 0.05, 0.01],
  KHR: [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 100],
}
