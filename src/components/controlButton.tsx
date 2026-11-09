import {
  forwardRef,
  useInsertionEffect,
  type ButtonHTMLAttributes,
  type CSSProperties,
} from "react";
import { Icon } from "@iconify/react";

const STYLE_ID = "control-btn-styles";

const CSS = `
.control-btn {
  --size: 56px;
  --ring: max(2px, calc(var(--size) * 0.03));
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);

  position: relative;
  isolation: isolate;
  display: inline-grid;
  place-items: center;
  width: var(--size);
  height: var(--size);
  padding: 0;
  border: var(--ring) solid #a2a2a2;
  border-radius: 50%;
  background: linear-gradient(
    180deg,
    #dddddd 0%,
    #ebebeb 30%,
    #f6f6f6 65%,
    #ffffff 100%
  );
  box-shadow:
    inset 0 0 0 2px rgba(255, 255, 255, 0.55),
    inset 0 -2px 6px rgba(255, 255, 255, 0.9);
  color: #7d7d7d;
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  touch-action: manipulation;
  transform: scale(1);
  transition: transform 180ms var(--ease-out);
}

.control-btn svg {
  display: block;
  pointer-events: none;
}

.control-btn::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: 50%;
  pointer-events: none;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.06), rgba(0, 0, 0, 0) 70%);
  box-shadow:
    inset 0 calc(var(--size) * 0.08) calc(var(--size) * 0.14) rgba(0, 0, 0, 0.28),
    inset 0 -2px 6px rgba(255, 255, 255, 0.6);
  opacity: 0;
  transition: opacity 180ms var(--ease-out);
}

.control-btn:active:not(:disabled) {
  transform: scale(0.94);
  transition-duration: 100ms;
}
.control-btn:active:not(:disabled)::after {
  opacity: 1;
  transition-duration: 100ms;
}

.control-btn:focus-visible {
  outline: 3px solid rgba(59, 130, 246, 0.6);
  outline-offset: 3px;
}

.control-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

@media (prefers-reduced-motion: reduce) {
  .control-btn,
  .control-btn:active:not(:disabled) {
    transform: none;
  }
}
`;

function ensureStyles() {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = STYLE_ID;
  el.textContent = CSS;
  document.head.appendChild(el);
}

export interface ControlButtonProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "style" | "children"
> {
  icon: string;
  label: string;
  size?: number;
  iconSize?: number;
  style?: CSSProperties;
}

export const ControlButton = forwardRef<HTMLButtonElement, ControlButtonProps>(
  function ControlButton(
    {
      icon,
      label,
      size = 56,
      iconSize,
      className,
      style,
      type = "button",
      ...rest
    },
    ref,
  ) {
    useInsertionEffect(ensureStyles, []);

    const px = iconSize ?? Math.round(size * 0.45);

    return (
      <button
        ref={ref}
        type={type}
        aria-label={label}
        className={className ? `control-btn ${className}` : "control-btn"}
        style={{ "--size": `${size}px`, ...style } as CSSProperties}
        {...rest}
      >
        <Icon icon={icon} width={px} height={px} aria-hidden="true" />
      </button>
    );
  },
);

export default ControlButton;
