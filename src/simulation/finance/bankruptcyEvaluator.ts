export function evaluateBankruptcy(cash: number, bankruptcyLimit: number, sandbox: boolean) {
  return !sandbox && Number.isFinite(cash) && cash < bankruptcyLimit;
}
