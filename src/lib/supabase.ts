import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string
);

export interface Business {
  id: string;
  name: string;
  type: string;
  description: string;
  created_at: string;
}

export interface BinderEntry {
  id: string;
  business_id: string;
  section: string;
  title: string;
  body: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  priority: number;
  source_text: string;
  updated_at: string;
}

export type SectionId =
  | 'first_72'
  | 'people'
  | 'money'
  | 'routines'
  | 'locations'
  | 'promises'
  | 'templates';

export interface SectionDef {
  id: SectionId;
  title: string;
  blurb: string;
  placeholder: string;
}

export const SECTIONS: SectionDef[] = [
  {
    id: 'first_72',
    title: 'First 72 Hours',
    blurb: 'What to do in the first three days if you suddenly cannot be reached.',
    placeholder:
      'e.g. Pause any open orders, post a short note to customers, check the calendar for appointments that need cancelling.',
  },
  {
    id: 'people',
    title: 'People',
    blurb: 'Who matters in and around the business, and how to reach them.',
    placeholder:
      'e.g. Sam handles deliveries on weekdays, reachable after 2pm. Good at solving problems without me.',
  },
  {
    id: 'money',
    title: 'Money',
    blurb: 'Where money comes in, what goes out, and what needs paying.',
    placeholder:
      'e.g. Invoices go out on the 1st from the accounting tool. Rent leaves the account on the 3rd.',
  },
  {
    id: 'routines',
    title: 'How Things Run',
    blurb: 'The daily, weekly and monthly rhythm that keeps things going.',
    placeholder:
      'e.g. Check and answer emails by 10am, prep orders in the afternoon, Friday is delivery day.',
  },
  {
    id: 'locations',
    title: 'Where Things Are',
    blurb: 'Keys, stock, equipment, documents — and who can get to them.',
    placeholder:
      'e.g. Spare keys with the neighbor. Stock is in the back room. Files are in the cloud drive.',
  },
  {
    id: 'promises',
    title: 'Customer Promises',
    blurb: 'Commitments made to customers that someone else should keep.',
    placeholder:
      'e.g. Every order gets a personal thank-you note. Monthly newsletter goes out on the last Friday.',
  },
  {
    id: 'templates',
    title: 'Message Templates',
    blurb: 'Ready-to-send words for emails and messages when the owner cannot write them.',
    placeholder:
      'e.g. "Hi, this is Sam writing on behalf of the owner. Your order is safe and we will be in touch soon."',
  },
];
