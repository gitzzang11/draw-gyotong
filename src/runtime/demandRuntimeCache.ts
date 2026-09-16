/** Runtime-only signatures used to invalidate demand-derived calculations. */
export class DemandRuntimeCache {
  private structureSignatureState = "";
  private serviceSignatureState = "";
  private contextSignatureState = "";

  get structureSignature(): string {
    return this.structureSignatureState;
  }

  get serviceSignature(): string {
    return this.serviceSignatureState;
  }

  get contextSignature(): string {
    return this.contextSignatureState;
  }

  setStructureSignature(signature: string): void {
    this.structureSignatureState = signature;
  }

  setServiceSignature(signature: string): void {
    this.serviceSignatureState = signature;
  }

  setContextSignature(signature: string): void {
    this.contextSignatureState = signature;
  }

  invalidate(): void {
    this.structureSignatureState = "";
    this.serviceSignatureState = "";
    this.contextSignatureState = "";
  }
}
