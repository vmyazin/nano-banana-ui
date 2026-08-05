export type DraftValue = string | number | boolean;

/**
 * The part of a control definition that decides whether a value still fits.
 * Structural on purpose: the fal and Kie catalogues declare their own field
 * types, and both satisfy this.
 */
export interface CarryOverField {
  key: string;
  type: 'text' | 'number' | 'boolean' | 'select' | string;
  defaultValue?: DraftValue;
  options?: Array<{ label: string; value: string | number }>;
}

/**
 * Whether a control would accept this value. Shared with ModelControls so the
 * rule that decides what carries over is the same one that decides what
 * renders — otherwise a value could survive a provider switch and then be
 * silently replaced by the default at paint time.
 */
export function isValueCompatible(
  field: CarryOverField,
  value: DraftValue | undefined
): value is DraftValue {
  if (field.type === 'text') return typeof value === 'string';
  if (field.type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (field.type === 'boolean') return typeof value === 'boolean';
  if (typeof value !== 'string' && typeof value !== 'number') return false;

  return !field.options || field.options.some((option) => Object.is(option.value, value));
}

/**
 * Overlay whatever the user last chose onto a model's defaults, keeping only
 * the values the new model can actually express. Switching from a model that
 * offers 21:9 to one that does not leaves the aspect ratio at the new default
 * rather than sending it something it would reject.
 */
export function carryOverValues<T extends DraftValue>(
  fields: CarryOverField[],
  defaults: Record<string, T>,
  remembered: Record<string, DraftValue>
): Record<string, T> {
  const carried = { ...defaults };

  for (const field of fields) {
    if (!(field.key in defaults)) continue;
    const value = remembered[field.key];
    if (value === undefined) continue;
    if (isValueCompatible(field, value)) carried[field.key] = value as T;
  }

  return carried;
}
