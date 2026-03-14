import * as React from 'react';

/**
 * Accessible text field.
 * - Always has an id and name
 * - Associates a <label> via htmlFor
 * - If you don’t want a visible label, pass labelHidden to use a screen-reader-only label
 */
type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  id?: string;          // optional; auto-generated if omitted
  label: string;        // required (visible or hidden)
  labelHidden?: boolean;
  name?: string;        // default: same as id
};

export default function TextField({
  id: idProp,
  name: nameProp,
  label,
  labelHidden,
  className = '',
  ...rest
}: Props) {
  const autoId = React.useId();
  const id = idProp || `field-${autoId}`;
  const name = nameProp || id;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={labelHidden ? 'sr-only' : 'text-sm font-medium text-slate-700'}>
        {label}
      </label>
      <input
        id={id}
        name={name}
        className={`rounded-xl border border-slate-200 px-3 py-2 outline-none focus:ring-2 focus:ring-ocean-200 ${className}`}
        data-testid={(rest as Record<string, unknown>)['data-testid'] as string || `text-field-${id}`}
        {...rest}
      />
    </div>
  );
}
