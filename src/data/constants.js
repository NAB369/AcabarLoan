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
