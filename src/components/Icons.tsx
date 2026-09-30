const base = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true } as const;

export const CheckIcon = ({ className }: { className?: string }) => (
  <svg {...base} className={className}><path d="M20 6 9 17l-5-5" /></svg>
);
export const ArrowRight = ({ className }: { className?: string }) => (
  <svg {...base} className={className}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
);
export const ArrowDown = ({ className }: { className?: string }) => (
  <svg {...base} className={className}><path d="M12 5v14M6 13l6 6 6-6" /></svg>
);
export const PrintIcon = ({ className }: { className?: string }) => (
  <svg {...base} className={className}><path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2M7 14h10v7H7z" /></svg>
);
export const CloseIcon = ({ className }: { className?: string }) => (
  <svg {...base} className={className}><path d="M18 6 6 18M6 6l12 12" /></svg>
);
