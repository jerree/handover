// Step 8: demo mode switch + sample data. Set DEMO_MODE to true to show
// /demo-controls and all demo tooling.
export const DEMO_MODE = false;

export const SAMPLE_BUSINESS = {
  name: 'Bluebird Bakery',
  type: 'bakery',
  ownerName: 'Amara',
};

export const SAMPLE_TRUSTED = {
  name: 'Ngozi',
  relationship: 'Sister',
};

export type SampleSection =
  | 'first_72'
  | 'people'
  | 'money'
  | 'routines'
  | 'locations'
  | 'promises'
  | 'templates';

export interface SampleEntry {
  section: SampleSection;
  title: string;
  body: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  priority?: number;
}

export const SAMPLE_ENTRIES: SampleEntry[] = [
  {
    section: 'first_72',
    title: 'Call the flour supplier before Wednesday',
    body: "Weekly flour order must be placed by Tuesday 5pm or Thursday's baking stops. Order 10 bags of bread flour and 4 bags of cake flour.",
    contactName: 'Mr. Adeyemi',
    contactPhone: '0800 000 0001',
    contactEmail: 'orders@mill-supplier.example.com',
    priority: 5,
  },
  {
    section: 'first_72',
    title: 'Tell the cafe their Wednesday delivery will be late',
    body: 'The cafe expects 40 rolls and 12 loaves every Wednesday at 7am. Call them first thing, then use the message template.',
    contactName: 'Mrs. Okafor',
    contactPhone: '0800 000 0002',
    contactEmail: 'hello@sunrise-cafe.example.com',
    priority: 5,
  },
  {
    section: 'first_72',
    title: 'Pay the shop rent on the 1st',
    body: 'Rent is due on the 1st of each month. Pay it first if cash is tight.',
    priority: 4,
  },
  {
    section: 'people',
    title: 'Helper: Tunde (weekend baker)',
    body: 'Works Saturdays 5am to 11am. Knows the bread recipes and the oven. Paid weekly in cash on Saturday after the shift.',
    contactName: 'Tunde',
    contactPhone: '0800 000 0003',
  },
  {
    section: 'people',
    title: 'Accountant: Ms. Bello',
    body: 'Handles monthly accounts and tax filing. Send her the sales book on the 28th of each month.',
    contactName: 'Ms. Bello',
    contactPhone: '0800 000 0004',
    contactEmail: 'accounts@bello-advisors.example.com',
  },
  {
    section: 'money',
    title: 'Monthly bills and due dates',
    body: 'Shop rent due on the 1st. Oven loan repayment due on the 15th. Electricity paid by the 20th. Pay rent first if cash is tight.',
  },
  {
    section: 'money',
    title: 'Customers who owe money',
    body: 'Sunrise Cafe pays invoices every second Friday. The school canteen usually pays 30 days late, so remind them gently on day 25.',
  },
  {
    section: 'routines',
    title: 'Weekly routine',
    body: 'Monday: place flour and egg orders. Wednesday: deliver to the cafe at 7am. Friday: send invoices. Saturday: Tunde helps with the weekend rush.',
  },
  {
    section: 'routines',
    title: 'Daily opening routine',
    body: 'Switch on the oven at 4:30am. Check the fridge temperature. Start the first dough batch by 5am. Open the shop at 7am.',
  },
  {
    section: 'locations',
    title: 'Keys and spare keys',
    body: "Main shop key is on the hook behind the till. Spare key is with the owner's sister. The back storeroom key is in the red tin on the top shelf.",
  },
  {
    section: 'locations',
    title: 'Passwords and important papers',
    body: "Logins are kept in a password manager, and the master key is held by the owner's sister. Business registration papers and the oven loan agreement are in the blue folder in the bottom drawer.",
  },
  {
    section: 'promises',
    title: 'Wedding cake for Saturday the 24th',
    body: 'Three-tier vanilla cake, deposit already paid, pickup at 10am. Name on the order: Grace.',
    contactName: 'Grace',
    contactPhone: '0800 000 0005',
  },
  {
    section: 'promises',
    title: 'School canteen standing order',
    body: '60 bread rolls every Monday and Thursday, delivered by 8am. Invoice sent monthly.',
    contactName: 'Mr. Ibe (canteen)',
    contactPhone: '0800 000 0006',
  },
  {
    section: 'templates',
    title: 'Message to customers',
    body: "Hello, this is a message from Bluebird Bakery. We're temporarily unable to take new orders, but your existing orders are being looked after. We'll update you as soon as we can. Thank you for your patience.",
  },
  {
    section: 'templates',
    title: 'Message to suppliers',
    body: 'Hello, this is a message from Bluebird Bakery. Payments and orders may be delayed for a few days. Please hold current orders and contact [trusted person\u2019s name] on this number for any urgent matter.',
  },
];
