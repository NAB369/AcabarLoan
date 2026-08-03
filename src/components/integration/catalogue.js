// Providers that can be added from Integrations → Add Integration. This is the build's
// catalogue: the templates say what each connection is and what it is able to exchange,
// while the credentials, switches and history are created empty per install (see
// buildIntegration) exactly like the seeded connections in mockData.
//
// A provider listed here is also removable again from the landing page — the seeded
// connections are not, since there would be no template to put them back from.
export const INTEGRATION_CATALOGUE = [
  {
    id: 'bakong',
    name: 'Bakong',
    category: 'Payments',
    tagline: 'Collect repayments over the NBC Bakong network, including KHQR, and pull settlement back in',
    accountLabel: 'Bakong Account ID',
    unit: 'transaction',
    baseUrl: 'https://api-bakong.nbc.gov.kh/v1',
    syncEvery: 15,
    scopes: [
      { id: 'push-khqr',    direction: 'Outbound', label: 'Generate KHQR for due installments', desc: 'Each installment falling due gets a KHQR the borrower can scan from any Bakong-member bank app', enabled: true },
      { id: 'pull-txn',     direction: 'Inbound',  label: 'Import received transactions',       desc: 'Transfers received are matched to the installment by reference and posted as repayment', enabled: true },
      { id: 'pull-settle',  direction: 'Inbound',  label: 'Daily settlement file',              desc: 'End-of-day settlement is pulled and reconciled against posted repayments', enabled: false },
    ],
  },
  {
    id: 'cbc',
    name: 'Credit Bureau Cambodia',
    category: 'Credit Bureau',
    tagline: 'Pull borrower and guarantor credit reports, and file monthly loan performance back to CBC',
    accountLabel: 'Subscriber Code',
    unit: 'report',
    baseUrl: 'https://api.creditbureau.com.kh/v2',
    syncEvery: 1440,
    scopes: [
      { id: 'pull-report',   direction: 'Inbound',  label: 'Fetch credit reports',      desc: 'Report and score for each party on an application, read into the loan’s CBC tab', enabled: true },
      { id: 'push-monthly',  direction: 'Outbound', label: 'File monthly performance',  desc: 'Outstanding balance and repayment conduct for every active loan, submitted on the monthly cycle', enabled: true },
      { id: 'pull-alerts',   direction: 'Inbound',  label: 'Borrower alerts',           desc: 'Notice when an existing borrower takes on new debt elsewhere or falls into arrears', enabled: false },
    ],
  },
  {
    id: 'telegram',
    name: 'Telegram Bot',
    category: 'Messaging',
    tagline: 'Send repayment reminders and overdue notices to borrowers and officers through a Telegram bot',
    accountLabel: 'Bot Username',
    unit: 'message',
    baseUrl: 'https://api.telegram.org',
    syncEvery: 360,
    scopes: [
      { id: 'send-reminders', direction: 'Outbound', label: 'Send due-date reminders',  desc: 'The reminder built on a loan’s Reminder panel is delivered to the borrower’s chat', enabled: true },
      { id: 'send-overdue',   direction: 'Outbound', label: 'Send overdue notices',     desc: 'An installment past its due date triggers a notice to the borrower and the assigned officer', enabled: true },
      { id: 'send-internal',  direction: 'Outbound', label: 'Notify approval line',     desc: 'Applications waiting on a reviewer are announced in the officers’ channel', enabled: false },
    ],
  },
]

// A newly added connection starts with no credentials and nothing exchanged — it is not
// "connected" until a key is saved on its Connection tab, same as a seeded provider that
// has been disconnected.
export function buildIntegration(template) {
  return {
    ...template,
    status: 'disconnected',
    environment: 'sandbox',
    account: '',
    apiKey: '',
    autoSync: false,
    lastSyncAt: null,
    logs: [],
    // Marks this as catalogue-added, so the landing page offers to remove it again
    fromCatalogue: true,
  }
}
