import { useEffect } from 'react';

export function usePageTitle(title: string | null): void {
  useEffect(() => {
    document.title = title ? `${title} | Handover` : 'Handover — your business, written down';
  }, [title]);
}
