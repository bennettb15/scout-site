import { forwardRef } from "react";

function createIcon(paths, options = {}) {
  const Icon = forwardRef(function Icon(
    { color = "currentColor", size = 24, strokeWidth = 2, className, children, ...props },
    ref
  ) {
    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
        {...options.attrs}
        {...props}
      >
        {paths}
        {children}
      </svg>
    );
  });
  return Icon;
}

export const ArrowRight = createIcon(<path d="M5 12h14M13 5l7 7-7 7" />);
export const Building2 = createIcon(
  <>
    <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18" />
    <path d="M6 12H4a2 2 0 0 0-2 2v8" />
    <path d="M18 9h2a2 2 0 0 1 2 2v11" />
    <path d="M10 6h4M10 10h4M10 14h4M10 18h4" />
  </>
);
export const Camera = createIcon(
  <>
    <path d="M14.5 4 16 6h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3l1.5-2z" />
    <circle cx="12" cy="13" r="3.5" />
  </>
);
export const Check = createIcon(<path d="m5 12 4 4L19 6" />);
export const CheckCircle2 = createIcon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12 2.5 2.5L16 9" />
  </>
);
export const ChevronDown = createIcon(<path d="m6 9 6 6 6-6" />);
export const ChevronLeft = createIcon(<path d="m15 18-6-6 6-6" />);
export const ChevronRight = createIcon(<path d="m9 18 6-6-6-6" />);
export const ClipboardList = createIcon(
  <>
    <path d="M9 3h6l1 2h2a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2z" />
    <path d="M9 5h6M8 11h.01M11 11h5M8 16h.01M11 16h5" />
  </>
);
export const Clock = createIcon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>
);
export const Download = createIcon(<path d="M12 3v12m0 0 4-4m-4 4-4-4M5 21h14" />);
export const FileText = createIcon(
  <>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <path d="M14 2v6h6M8 13h8M8 17h6" />
  </>
);
export const Flag = forwardRef(function Flag(
  { color = "currentColor", size = 24, className, children, ...props },
  ref
) {
  return (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color}
      stroke={color}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path d="M5 21V4.5c0-.8.7-1.5 1.5-1.5h7.2c.9 0 1.7.3 2.4.8l.4.3c.7.5 1.5.8 2.4.8H20v10h-1.1c-.9 0-1.7-.3-2.4-.8l-.4-.3c-.7-.5-1.5-.8-2.4-.8H7v8z" />
      {children}
    </svg>
  );
});
export const Home = createIcon(
  <>
    <path d="m3 11 9-8 9 8" />
    <path d="M5 10v11h14V10M9 21v-7h6v7" />
  </>
);
export const KeyRound = createIcon(
  <>
    <circle cx="8" cy="15" r="4" />
    <path d="m11 12 9-9M17 6l3 3M14 9l2 2" />
  </>
);
export const LogOut = createIcon(
  <>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5M21 12H9" />
  </>
);
export const Mail = createIcon(
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </>
);
export const MapPin = createIcon(
  <>
    <path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0z" />
    <circle cx="12" cy="10" r="3" />
  </>
);
export const Menu = createIcon(<path d="M4 6h16M4 12h16M4 18h16" />);
export const Phone = createIcon(
  <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8 10a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2z" />
);
export const Pencil = createIcon(
  <>
    <path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
    <path d="m15 5 4 4" />
  </>
);
export const Plus = createIcon(<path d="M12 5v14M5 12h14" />);
export const RefreshCw = createIcon(
  <>
    <path d="M3 12a9 9 0 0 1 9-9 9.8 9.8 0 0 1 6.7 2.7L21 8" />
    <path d="M21 3v5h-5" />
    <path d="M21 12a9 9 0 0 1-9 9 9.8 9.8 0 0 1-6.7-2.7L3 16" />
    <path d="M8 16H3v5" />
  </>
);
export const Search = createIcon(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </>
);
export const ShieldCheck = createIcon(
  <>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <path d="m9 12 2 2 4-5" />
  </>
);
export const Sparkles = createIcon(<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM5 17l.8 2.2L8 20l-2.2.8L5 23l-.8-2.2L2 20l2.2-.8zM19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8z" />);
export const Trash2 = createIcon(
  <>
    <path d="M3 6h18" />
    <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
  </>
);
export const UserPlus = createIcon(
  <>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M19 8v6M22 11h-6" />
  </>
);
export const X = createIcon(<path d="M18 6 6 18M6 6l12 12" />);
export const Zap = createIcon(<path d="M13 2 3 14h8l-1 8 10-12h-8z" />);
