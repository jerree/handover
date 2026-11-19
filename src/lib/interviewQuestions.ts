import type { SectionId } from './supabase';

export interface InterviewQuestion {
  section: SectionId;
  prompt: string;
}

export const INTERVIEW_QUESTIONS: InterviewQuestion[] = [
  { section: 'people', prompt: 'Who do you buy from every week?' },
  { section: 'people', prompt: 'Who are your three most important customers?' },
  { section: 'people', prompt: 'Who helps you — staff, family, freelancers?' },
  { section: 'people', prompt: 'Who is your accountant or bookkeeper?' },
  { section: 'money', prompt: 'What bills come due each month, and when?' },
  { section: 'money', prompt: 'Who owes you money right now?' },
  { section: 'money', prompt: 'Who should be paid first if cash is tight?' },
  { section: 'routines', prompt: 'What does a normal Monday look like?' },
  { section: 'routines', prompt: 'What must happen every week without fail?' },
  { section: 'routines', prompt: 'What do you do at month end?' },
  { section: 'locations', prompt: 'Where are the keys, recipes, contracts and paperwork?' },
  { section: 'locations', prompt: 'How are your logins stored, and who can open that?' },
  { section: 'promises', prompt: 'What orders, deposits or appointments are open right now?' },
  { section: 'promises', prompt: 'What did you promise a customer that is not written down?' },
  {
    section: 'first_72',
    prompt: 'If you were unavailable tomorrow, what are the first three things that would go wrong?',
  },
];
