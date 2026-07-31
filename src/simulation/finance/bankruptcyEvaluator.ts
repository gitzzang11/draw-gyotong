import type { BankruptcyEvaluation } from "./financeTypes";

export function evaluateBankruptcy(cash: number, bankruptcyLimit: number, sandbox: boolean): BankruptcyEvaluation {
  const isBankrupt = !sandbox && Number.isFinite(cash) && cash < bankruptcyLimit;
  return {
    isBankrupt,
    reason: isBankrupt ? `자금이 파산 한도 ${bankruptcyLimit} 미만입니다.` : undefined,
    debtAmount: Math.max(0, -finite(cash)),
  };
}

function finite(value: number) {
  return Number.isFinite(value) ? value : 0;
}
