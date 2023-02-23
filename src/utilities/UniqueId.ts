/**
 * @internal
 */
export class UniqueId {
  _id: number;

  constructor() {
    this._id = 0;
  }

  gen(): string {
    return (this._id++).toString();
  }
}
