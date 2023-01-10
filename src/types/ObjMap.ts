export interface ObjMap<T> {
  [key: string]: T;
}

export interface ReadOnlyObjMap<T> {
  readonly [key: string]: T;
}
