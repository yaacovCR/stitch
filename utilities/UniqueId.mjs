/**
 * @internal
 */
export class UniqueId {
  constructor() {
    this._id = 0;
  }
  gen() {
    return (this._id++).toString();
  }
}
