const paths = {
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
  tune: <><path d="M4 7h4m6 0h6M4 17h10m6 0h0" /><circle cx="11" cy="7" r="3" /><circle cx="17" cy="17" r="3" /></>,
  pin: <><path d="m9 3 12 12-4 1-3 4-4-6-6-4 4-3 1-4ZM9 15l-6 6" /></>,
  flag: <><path d="M5 21V4c5-4 9 4 14 0v10c-5 4-9-4-14 0" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  undo: <><path d="m8 4-5 5 5 5M3 9h11a6 6 0 0 1 0 12" /></>,
  link: <><path d="m10 13 4-4M8 15l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 3 1-1a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 0)" /></>,
  arrowOutward: <path d="M7 17 17 7M7 7h10v10" />,
  chevronLeft: <path d="m14 6-6 6 6 6" />,
  chevronRight: <path d="m10 6 6 6-6 6" />,
  trash: <><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" /></>,
  edit: <><path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14v6Z" /></>,
  cloudOff: <><path d="M7 7a7 7 0 0 1 13 4 4 4 0 0 1 1 7M17 19H6a4 4 0 0 1-2-7M3 3l18 18" /></>,
  refresh: <><path d="M20 10a8 8 0 1 0-1 7M20 4v6h-6" /></>,
  inventory: <><path d="m12 3 9 5v8l-9 5-9-5V8l9-5Z" /><path d="m3 8 9 5 9-5M12 13v8M7.5 5.5l9 5" /></>,
  check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
  wallet: <><path d="M20 8V6a2 2 0 0 0-2-2H6a3 3 0 0 0 0 6h15v10H6a3 3 0 0 1-3-3V7" /><path d="M21 13h-5v4h5" /></>,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  payment: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M3 10h18M7 15h3" /></>,
  note: <><path d="M14 3H5v18h14V8l-5-5Z" /><path d="M14 3v5h5M8 12h8M8 16h5" /></>,
}

// Local SVGs keep essential controls legible without an external icon font.
export default function InterfaceIcon({ name, className = '' }) {
  return (
    <svg className={`interface-icon ${className}`} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  )
}
