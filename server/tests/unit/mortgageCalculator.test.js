/**
 * S14 (ADR-038) — EMI financial model unit suite.
 *
 * The server-side test home for the shared client/server math module
 * (locked ruling: no client test framework — server Jest imports the
 * server copy directly; the client copy is byte-identical).
 */
import {
  calculateEMI,
  buildAmortization,
  loanFromPrice,
  EMI_LIMITS,
} from '../../src/lib/mortgageCalculator.js';

describe('S14 mortgageCalculator — calculateEMI (published formula)', () => {
  it('matches known published loan numbers (₹50L, 8.5%, 20y -> ₹43,391/mo)', () => {
    const r = calculateEMI(5000000, 8.5, 240);
    expect(r.ok).toBe(true);
    // Standard amortization tables for 5,000,000 @ 8.5% / 240 months:
    // EMI = 43,390.6... -> rounds to 43,391.
    expect(r.monthly).toBe(43391);
    expect(r.totalPayment).toBe(43391 * 240);
    expect(r.totalInterest).toBe(r.totalPayment - 5000000);
  });

  it('zero-rate loan degenerates gracefully to P/n', () => {
    const r = calculateEMI(120000, 0, 12);
    expect(r.monthly).toBe(10000);
    expect(r.totalInterest).toBe(0);
  });

  it('single-month loan repays principal plus one month of interest', () => {
    const r = calculateEMI(100000, 12, 1);
    // r = 0.01 -> EMI = P * 1.01 = 101,000
    expect(r.monthly).toBe(101000);
    expect(r.totalInterest).toBe(1000);
  });

  it('handles the maximum tenure without overflow', () => {
    const r = calculateEMI(EMI_LIMITS.maxPrincipal, 12, EMI_LIMITS.maxTenureMonths);
    expect(r.ok).toBe(true);
    expect(Number.isFinite(r.monthly)).toBe(true);
    expect(r.monthly).toBeGreaterThan(0);
  });

  it('rejects out-of-bounds and non-scalar inputs per field', () => {
    expect(calculateEMI(0, 8, 240).error.field).toBe('principal');
    expect(calculateEMI(-500000, 8, 240).error.field).toBe('principal');
    expect(calculateEMI(1e11, 8, 240).error.field).toBe('principal');
    expect(calculateEMI('5000000', 8, 240).error.field).toBe('principal');
    expect(calculateEMI(NaN, 8, 240).error.field).toBe('principal');
    expect(calculateEMI(5000000, -0.1, 240).error.field).toBe('annualRatePercent');
    expect(calculateEMI(5000000, 31, 240).error.field).toBe('annualRatePercent');
    expect(calculateEMI(5000000, 8, 0).error.field).toBe('tenureMonths');
    expect(calculateEMI(5000000, 8, 601).error.field).toBe('tenureMonths');
    expect(calculateEMI(5000000, 8, 240.5).error.field).toBe('tenureMonths');
  });

  it('zero down payment is a valid composition (full principal financed)', () => {
    const r = loanFromPrice(5000000, 0);
    expect(r).toEqual({ ok: true, downPayment: 0, loanPrincipal: 5000000 });
  });

  it('composes loan principal from price and down-payment percent', () => {
    const r = loanFromPrice(5000000, 20);
    expect(r).toEqual({ ok: true, downPayment: 1000000, loanPrincipal: 4000000 });
  });

  it('rejects >=100% or negative down payment', () => {
    expect(loanFromPrice(5000000, 100).ok).toBe(false);
    expect(loanFromPrice(5000000, -1).ok).toBe(false);
  });
});

describe('S14 mortgageCalculator — amortization schedule', () => {
  it('produces one row per month and closes the balance at zero', () => {
    const { ok, rows } = buildAmortization(1200000, 9, 24);
    expect(ok).toBe(true);
    expect(rows).toHaveLength(24);
    expect(rows[0].month).toBe(1);
    expect(rows[0].opening).toBe(1200000);
    // Interest-only first month at 9% annual on 12L: 12,000,000/100 *9 /12 = 9000.
    expect(rows[0].interest).toBe(9000);
    const last = rows[rows.length - 1];
    expect(last.closing).toBe(0);
    // Principal column sums exactly back to the loan (final row absorbs drift).
    const principalSum = rows.reduce((acc, row) => acc + row.principal, 0);
    expect(principalSum).toBe(1200000);
  });

  it('interest-free schedule has zero interest in every row', () => {
    const { ok, rows } = buildAmortization(120000, 0, 12);
    expect(ok).toBe(true);
    expect(rows.every((row) => row.interest === 0)).toBe(true);
    expect(rows[11].principal).toBe(10000);
  });

  it('propagates input rejection', () => {
    expect(buildAmortization(0, 8, 12).ok).toBe(false);
  });
});
