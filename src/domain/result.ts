/** Relative diagnostic path. Nested adapters prefix this path without rewriting it. */
export type DomainPath = readonly (string | number)[];

/** Every public fallible F1 value operation returns a stable code and path. */
export type PathRefusal<Shape extends Readonly<{ code: string }>> = Readonly<
  Shape & { path: DomainPath }
>;

export type DomainResult<Value, Refusal> =
  | Readonly<{ ok: true; value: Value }>
  | Readonly<{ ok: false; refusal: Refusal }>;

export type Comparison = -1 | 0 | 1;
