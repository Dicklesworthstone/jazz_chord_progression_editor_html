type Exclude<T, U> = T extends U ? never : T;
type Extract<T, U> = T extends U ? T : never;
type Pick<T, K extends keyof T> = { [Property in K]: T[Property] };
type Readonly<T> = { readonly [Property in keyof T]: T[Property] };
type Omit<T, K extends keyof any> = Pick<T, Exclude<keyof T, K>>;

interface ReadonlyArray<T> {
  readonly length: number;
  readonly [index: number]: T;
}

interface Array<T> extends ReadonlyArray<T> {
  length: number;
  [index: number]: T;
}
