import { forwardRef, useId, type InputHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

// ─────────────────────────────────────────────────────────────────────────────
// Input — labeled rounded text field for forms and auth pages.
// ─────────────────────────────────────────────────────────────────────────────
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, className, id: idProp, ...rest },
  ref,
) {
  const autoId = useId();
  const id = idProp ?? autoId;
  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="block text-xs font-bold text-slate-700 mb-1.5 ml-1">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        className={cn(
          "w-full bg-white border rounded-2xl px-4 py-3 text-sm font-medium text-slate-900 outline-none transition",
          "placeholder:text-slate-400",
          error
            ? "border-red-400 focus:border-red-500 focus:ring-2 focus:ring-red-100"
            : "border-slate-200 focus:border-primary-500 focus:ring-2 focus:ring-primary-100",
        )}
        {...rest}
      />
      {error ? (
        <p className="text-[11px] font-bold text-red-600 mt-1.5 ml-1">{error}</p>
      ) : hint ? (
        <p className="text-[11px] font-medium text-slate-400 mt-1.5 ml-1">{hint}</p>
      ) : null}
    </div>
  );
});
