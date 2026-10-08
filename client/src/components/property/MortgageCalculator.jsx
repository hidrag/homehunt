import React, { useMemo, useState } from 'react';
import { calculateEMI, buildAmortization, loanFromPrice } from '../../lib/mortgageCalculator';

const formatINR = (n) =>
  typeof n === 'number'
    ? new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
    : '—';

const NumberField = ({ label, value, onChange, min, max, step, suffix }) => (
  <label className="block">
    <span className="mb-1 block text-xs font-medium text-gray-500">{label}</span>
    <div className="relative">
      <input
        type="number"
        inputMode="decimal"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-11 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
      {suffix && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
          {suffix}
        </span>
      )}
    </div>
  </label>
);

/**
 * S14 (ADR-038) — EMI estimator. Estimates only; not a lending offer.
 * The math lives in lib/mortgageCalculator (published formula, server-tested).
 */
const MortgageCalculator = ({ price }) => {
  const [downPercent, setDownPercent] = useState('20');
  const [rate, setRate] = useState('8.5');
  const [years, setYears] = useState('20');

  const composition = useMemo(
    () => loanFromPrice(Number(price), Number(downPercent)),
    [price, downPercent],
  );

  const emi = useMemo(
    () =>
      composition.ok
        ? calculateEMI(composition.loanPrincipal, Number(rate), Math.round(Number(years) * 12))
        : composition,
    [composition, rate, years],
  );

  const schedule = useMemo(
    () => (emi.ok ? buildAmortization(composition.loanPrincipal, Number(rate), Math.round(Number(years) * 12)) : null),
    [emi, composition, rate, years],
  );

  const [showSchedule, setShowSchedule] = useState(false);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-1 text-lg font-semibold text-gray-900">Mortgage estimator</h2>
      <p className="mb-4 text-xs text-gray-500">Estimate only — not a lending offer or financial advice.</p>

      <div className="space-y-4">
        <NumberField
          label="Down payment"
          value={downPercent}
          onChange={setDownPercent}
          min={0}
          max={99}
          step={1}
          suffix="%"
        />
        <NumberField label="Interest rate (p.a.)" value={rate} onChange={setRate} min={0} max={30} step={0.1} suffix="%" />
        <NumberField label="Tenure" value={years} onChange={setYears} min={1} max={50} step={1} suffix="years" />

      </div>

      {!composition.ok && <p className="mt-3 text-xs text-red-600">{composition.error.message}</p>}
      {composition.ok && !emi.ok && <p className="mt-3 text-xs text-red-600">{emi.error.message}</p>}

      {composition.ok && emi.ok && (
        <div className="mt-5 space-y-2 border-t border-gray-100 pt-4 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Monthly EMI</span>
            <span className="text-lg font-bold text-indigo-700">{formatINR(emi.monthly)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Loan amount</span>
            <span className="font-medium text-gray-900">{formatINR(composition.loanPrincipal)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Total interest</span>
            <span className="font-medium text-gray-900">{formatINR(emi.totalInterest)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-500">Total payable</span>
            <span className="font-medium text-gray-900">{formatINR(emi.totalPayment)}</span>
          </div>

          {schedule?.ok && (
            <button
              type="button"
              onClick={() => setShowSchedule((v) => !v)}
              className="mt-2 text-xs font-medium text-indigo-600 hover:text-indigo-800"
            >
              {showSchedule ? 'Hide' : 'Show'} amortization schedule
            </button>
          )}
          {showSchedule && schedule?.ok && (
            <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-gray-100">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-gray-50 text-gray-500">
                  <tr>
                    <th className="p-2 font-medium">#</th>
                    <th className="p-2 font-medium">Interest</th>
                    <th className="p-2 font-medium">Principal</th>
                    <th className="p-2 font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.rows.map((row) => (
                    <tr key={row.month} className="border-t border-gray-50">
                      <td className="p-2 text-gray-400">{row.month}</td>
                      <td className="p-2">{row.interest.toLocaleString('en-IN')}</td>
                      <td className="p-2">{row.principal.toLocaleString('en-IN')}</td>
                      <td className="p-2">{row.closing.toLocaleString('en-IN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MortgageCalculator;
