/**
 * S14 (ADR-038) — Mortgage / EMI financial model.
 *
 * Pure, dependency-free ESM shared math module. The client keeps a
 * byte-identical copy at client/src/lib/mortgageCalculator.js (locked
 * ruling Q5: no client test framework; server Jest unit tests import THIS
 * file directly, and the published-formula contract below is the tested
 * surface). Never import Node built-ins here.
 *
 * Published formula (reducing balance):
 *   r   = annualRate / 12 / 100            (monthly decimal rate)
 *   EMI = P * r * (1 + r)^n / ((1 + r)^n - 1)
 *   r === 0        ->  EMI = P / n         (interest-free limit case)
 * Every monetary output is rounded to whole rupees (Math.round).
 *
 * This is an ESTIMATE ONLY — not a lending offer or financial advice.
 *
 * Input bounds (reject outside): fee simple scalars only —
 *   principal: finite, 0 < P <= 1e10
 *   annualRatePercent: finite, 0 <= rate <= 30
 *   tenureMonths: integer, 1 <= n <= 600
 */

export const EMI_LIMITS = {
  maxPrincipal: 1e10,
  maxRatePercent: 30,
  minTenureMonths: 1,
  maxTenureMonths: 600,
};

const fail = (field, message) => ({ ok: false, error: { field, message } });

const invalidNumber = (value) => typeof value !== 'number' || !Number.isFinite(value);

/**
 * @returns {{ok:true, principal:number, monthly:number, totalPayment:number,
 *            totalInterest:number, tenureMonths:number}
 *          | {ok:false, error:{field:string, message:string}}}
 */
export const calculateEMI = (principal, annualRatePercent, tenureMonths) => {
  if (invalidNumber(principal) || principal <= 0 || principal > EMI_LIMITS.maxPrincipal) {
    return fail('principal', 'Principal must be a positive number up to 1e10');
  }
  if (invalidNumber(annualRatePercent) || annualRatePercent < 0 || annualRatePercent > EMI_LIMITS.maxRatePercent) {
    return fail('annualRatePercent', 'Annual rate must be between 0 and 30 percent');
  }
  if (
    invalidNumber(tenureMonths) ||
    !Number.isInteger(tenureMonths) ||
    tenureMonths < EMI_LIMITS.minTenureMonths ||
    tenureMonths > EMI_LIMITS.maxTenureMonths
  ) {
    return fail('tenureMonths', 'Tenure must be a whole number of months between 1 and 600');
  }

  const r = annualRatePercent / 12 / 100;
  const n = tenureMonths;
  const rawMonthly =
    r === 0 ? principal / n : (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  const monthly = Math.round(rawMonthly);
  const totalPayment = monthly * n;
  const totalInterest = totalPayment - principal;

  return { ok: true, principal, monthly, totalPayment, totalInterest, tenureMonths: n };
};

/**
 * Amortization schedule (per-month rows) for the accepted inputs.
 * @returns {{ok:true, rows:Array<{month:number, opening:number, interest:number, principal:number, closing:number}>} | {ok:false, error}}
 */
export const buildAmortization = (principal, annualRatePercent, tenureMonths) => {
  const emi = calculateEMI(principal, annualRatePercent, tenureMonths);
  if (!emi.ok) return emi;
  const r = annualRatePercent / 12 / 100;
  const rows = [];
  let opening = principal;
  for (let month = 1; month <= tenureMonths; month += 1) {
    const interest = Math.round(opening * r);
    let principalPaid = emi.monthly - interest;
    if (month === tenureMonths) principalPaid = opening; // final row absorbs rounding drift
    const closing = Math.max(0, opening - principalPaid);
    rows.push({ month, opening: Math.round(opening), interest, principal: principalPaid, closing });
    opening = closing;
  }
  return { ok: true, rows };
};

/**
 * Loan composition from a listing price and a down-payment percentage.
 * @returns {{ok:true, downPayment:number, loanPrincipal:number} | {ok:false, error}}
 */
export const loanFromPrice = (price, downPaymentPercent) => {
  if (invalidNumber(price) || price <= 0 || price > EMI_LIMITS.maxPrincipal) {
    return fail('price', 'Price must be a positive number');
  }
  if (invalidNumber(downPaymentPercent) || downPaymentPercent < 0 || downPaymentPercent >= 100) {
    return fail('downPaymentPercent', 'Down payment must be between 0 and 99 percent');
  }
  return {
    ok: true,
    downPayment: Math.round((price * downPaymentPercent) / 100),
    loanPrincipal: Math.round(price - (price * downPaymentPercent) / 100),
  };
};
