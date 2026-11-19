export function Logo({
  variant = 'light',
  className,
  hMark = false,
}: {
  variant?: 'light' | 'dark';
  className?: string;
  hMark?: boolean;
}) {
  return (
    <span
      className={`brand-logo${hMark ? ' brand-logo-h' : ''}${className ? ` ${className}` : ''}`}
    >
      <svg
        className="brand-mark"
        viewBox="0 0 120 120"
        aria-hidden="true"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path d="M16 112V52A44 44 0 0 1 104 52V112Z" fill="#D9480F" />
        <rect x="38" y="52" width="14" height="46" rx="7" fill="#FBF5EE" />
        <rect x="68" y="52" width="14" height="46" rx="7" fill="#FBF5EE" />
        <rect x="48" y="70" width="24" height="12" fill="#FBF5EE" />
      </svg>
      <span
        className="s brand-word"
        style={{ color: variant === 'dark' ? '#FBF5EE' : '#2A1A12' }}
      >
        {hMark ? 'andover' : 'Handover'}
        <span style={{ color: variant === 'dark' ? '#F4A261' : '#D9480F' }}>.</span>
      </span>
    </span>
  );
}

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 120 120"
      role="img"
      aria-label="Handover logo mark"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M16 112V52A44 44 0 0 1 104 52V112Z" fill="#D9480F" />
      <rect x="38" y="52" width="14" height="46" rx="7" fill="#FBF5EE" />
      <rect x="68" y="52" width="14" height="46" rx="7" fill="#FBF5EE" />
      <rect x="48" y="70" width="24" height="12" fill="#FBF5EE" />
    </svg>
  );
}