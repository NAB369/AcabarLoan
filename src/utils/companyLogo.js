// The logo shipped with the app, used until someone uploads their own in
// Settings → Company Profile. An uploaded logo is stored on companyProfile.logo
// as a downscaled PNG data URL (see CompanyProfilePanel).
export const DEFAULT_COMPANY_LOGO = '/acabar-logo.png'

export function companyLogoSrc(profile) {
  return profile?.logo || DEFAULT_COMPANY_LOGO
}
