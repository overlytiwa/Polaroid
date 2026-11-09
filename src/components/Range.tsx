import { useId } from "react";
export default function Range({
  label,
  value,
  min = 0,
  max = 100,
  step = 1,
  onChange,
  suffix = "",
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
  suffix?: string;
}) {
  const id = useId();
  return (
    <div className="range-field">
      <label htmlFor={id}>
        {label}
        <span>
          {Number(value.toFixed(2))}
          {suffix}
        </span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
