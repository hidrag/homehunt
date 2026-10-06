import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import visitApi from '../../services/visitApi';

const schema = yup.object({
  date: yup.string().required('Choose a date'),
  time: yup.string().required('Choose a time'),
  duration: yup.number().typeError('Choose a duration').oneOf([30, 60, 90, 120]).required(),
  note: yup.string().max(1000, 'Keep notes under 1000 characters'),
});

const VisitForm = ({ propertyId }) => {
  const [message, setMessage] = useState(null);
  const { register, handleSubmit, formState: { errors, isSubmitting }, reset } = useForm({
    resolver: yupResolver(schema), defaultValues: { duration: 60 },
  });
  const onSubmit = async ({ date, time, duration, note }) => {
    setMessage(null);
    try {
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
      const local = new Date(`${date}T${time}:00`);
      const offset = -local.getTimezoneOffset();
      const sign = offset >= 0 ? '+' : '-';
      const pad = (n) => String(Math.floor(Math.abs(n))).padStart(2, '0');
      const iso = `${date}T${time}:00${sign}${pad(offset / 60)}:${pad(offset % 60)}`;
      const end = new Date(local.getTime() + Number(duration) * 60000);
      // Use the END slot's own local calendar date: a late-night slot can
      // cross midnight and the start `date` would put endAt on the wrong day.
      const pad2 = (n) => String(n).padStart(2, '0');
      const endDay = `${end.getFullYear()}-${pad2(end.getMonth() + 1)}-${pad2(end.getDate())}`;
      const endOffset = -end.getTimezoneOffset();
      const endIso = `${endDay}T${end.toTimeString().slice(0, 5)}:00${endOffset >= 0 ? '+' : '-'}${pad(endOffset / 60)}:${pad(endOffset % 60)}`;
      await visitApi.create({ propertyId, startAt: iso, endAt: endIso, note: note || '', timezone });
      reset({ duration: 60 }); setMessage({ type: 'success', text: 'Visit request sent. The agent will respond soon.' });
    } catch (error) { setMessage({ type: 'error', text: error.response?.data?.error?.message || 'Could not request this visit.' }); }
  };
  const field = 'mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200';
  return <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm" aria-labelledby="visit-heading">
    <h2 id="visit-heading" className="mb-4 text-xl font-semibold text-gray-900">Schedule a visit</h2>
    {message && <p role={message.type === 'error' ? 'alert' : 'status'} className={`mb-4 rounded-lg p-3 text-sm ${message.type === 'error' ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}>{message.text}</p>}
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium text-gray-700">Date<input type="date" min={new Date().toISOString().slice(0, 10)} {...register('date')} className={field} />{errors.date && <span className="text-xs text-red-600">{errors.date.message}</span>}</label><label className="text-sm font-medium text-gray-700">Time<input type="time" {...register('time')} className={field} />{errors.time && <span className="text-xs text-red-600">{errors.time.message}</span>}</label></div>
      <label className="block text-sm font-medium text-gray-700">Duration<select {...register('duration')} className={field}>{[30, 60, 90, 120].map((n) => <option key={n} value={n}>{n} minutes</option>)}</select></label>
      <label className="block text-sm font-medium text-gray-700">Note (optional)<textarea rows="3" {...register('note')} className={field} placeholder="Anything the agent should know?" />{errors.note && <span className="text-xs text-red-600">{errors.note.message}</span>}</label>
      <button disabled={isSubmitting} className="min-h-11 w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{isSubmitting ? 'Sending…' : 'Request visit'}</button>
    </form>
  </section>;
};
export default VisitForm;
