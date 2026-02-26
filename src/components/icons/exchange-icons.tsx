import { SVGProps } from "react";

export function TradingViewIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 36 28" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <rect width="36" height="28" rx="4" fill="#2962FF" />
      <path d="M6 20L13 13l4 4 7-10 6 6" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="30" cy="13" r="2" fill="#fff" />
    </svg>
  );
}

export function BinanceIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 127 113" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <g fill="#F0B90B">
        <path d="M38.725 53.2 63.315 28.62l24.6 24.6 14.3-14.31L63.315 0l-38.9 38.9 14.31 14.3z" />
        <path d="m0 63.307 14.305-14.305 14.304 14.305-14.304 14.305z" />
        <path d="m38.72 73.41 24.59 24.59 24.6-24.6 14.31 14.29-.01.01-38.9 38.91-38.9-38.89-.02-.02 14.33-14.29z" />
        <path d="m97.991 63.311 14.305-14.305 14.305 14.305-14.305 14.304z" />
        <path d="M77.82 63.3h.01l-.01.01-14.51 14.52-14.51-14.5-.02-.03 2.56-2.56 1.24-1.23L63.31 48.78 77.82 63.3z" />
      </g>
    </svg>
  );
}

export function MexcIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 37 22" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <path d="M32.668 14.379l-7.18-12.454c-1.574-2.596-5.412-2.624-6.931.11l-7.539 12.951c-1.408 2.375.332 5.357 3.148 5.357h15.105c2.844 0 4.971-3.065 3.397-5.964z" fill="#00B897" />
      <path d="M22.312 15.345l-.441-.773c-.415-.718-1.326-2.264-1.326-2.264L14.47 1.759c-1.574-2.347-5.302-2.54-6.876.414L.525 14.406c-1.464 2.568.276 5.91 3.452 5.937h25.239c-3.894.028-5.136-1.988-6.904-4.998z" fill="#76FCB2" />
    </svg>
  );
}

export function PionexIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 30 24" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <defs>
        <linearGradient id="pionex-a" x1="8.85" x2="32.7" y1="11.77" y2="11.77" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF7028" />
          <stop offset="1" stopColor="#FFCD4D" />
        </linearGradient>
        <linearGradient id="pionex-b" x1="28.23" x2="-2.01" y1="9.8" y2="9.8" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF7028" />
          <stop offset="1" stopColor="#FFCD4D" />
        </linearGradient>
        <linearGradient id="pionex-c" x1="19.74" x2="1.18" y1="16.67" y2="16.67" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FF7028" />
          <stop offset="1" stopColor="#FFCD4D" />
        </linearGradient>
      </defs>
      <path d="M9.588 12.222c.808-1.491 2.367-2.419 4.062-2.419h11.648c0 3.219-2.61 5.828-5.828 5.828H7.742l1.846-3.409z" fill="url(#pionex-a)" />
      <path d="M9.588 7.383c.808 1.491 2.367 2.42 4.062 2.42h11.648c0-3.219-2.61-5.828-5.828-5.828H7.742l1.846 3.408z" fill="url(#pionex-b)" />
      <path d="M9.169 12.978c1.06-1.957 3.107-3.177 5.333-3.176l4.277.001-5.113 9.44c-.858 1.584-2.515 2.57-4.316 2.57H4.387l4.782-8.835z" fill="url(#pionex-c)" />
    </svg>
  );
}
