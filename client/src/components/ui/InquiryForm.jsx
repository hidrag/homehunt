import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import * as yup from 'yup';
import { useSelector } from 'react-redux';
import { useNavigate, useLocation } from 'react-router-dom';
import { Send, CheckCircle, LogIn } from 'lucide-react';
import inquiryApi from '../../services/inquiryApi';

const schema = yup.object({
  name: yup
    .string()
    .trim()
    .required('Name is required')
    .max(120, 'Name cannot exceed 120 characters'),
  email: yup
    .string()
    .trim()
    .required('Email is required')
    .email('Please enter a valid email')
    .max(254, 'Email cannot exceed 254 characters'),
  phone: yup
    .string()
    .trim()
    .max(20, 'Phone cannot exceed 20 characters'),
  message: yup
    .string()
    .trim()
    .required('Message is required')
    .min(10, 'Message must be at least 10 characters')
    .max(2000, 'Message cannot exceed 2000 characters'),
});

const InquiryForm = ({ propertyId }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isAuthenticated } = useSelector((state) => state.auth);

  const [submitError, setSubmitError] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm({
    resolver: yupResolver(schema),
    defaultValues: {
      name: user?.name || '',
      email: user?.email || '',
      phone: '',
      message: '',
    },
  });

  useEffect(() => {
    if (user?.name && !dirtyFields.name) {
      setValue('name', user.name);
    }
    if (user?.email && !dirtyFields.email) {
      setValue('email', user.email);
    }
  }, [user?.name, user?.email, setValue, dirtyFields.name, dirtyFields.email]);

  if (!isAuthenticated) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm">
        <h3 className="mb-2 text-lg font-semibold text-gray-900">
          Interested in this property?
        </h3>
        <p className="mb-4 text-sm text-gray-500">
          Sign in to contact the agent.
        </p>
        <button
          type="button"
          onClick={() => navigate('/login', { state: { from: location } })}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          <LogIn className="h-4 w-4" />
          Sign in to Inquire
        </button>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="rounded-xl border border-gray-200 bg-white p-6 text-center shadow-sm">
        <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <CheckCircle className="h-6 w-6 text-green-600" />
        </div>
        <h3 className="mb-1 text-lg font-semibold text-gray-900">
          Your inquiry has been sent
        </h3>
        <p className="text-sm text-gray-500">
          The agent will receive your message and may respond at their earliest convenience.
        </p>
        <button
          type="button"
          onClick={() => {
            setSubmitted(false);
            setSubmitError(null);
            reset({
              name: user?.name || '',
              email: user?.email || '',
              phone: '',
              message: '',
            });
          }}
          className="mt-4 text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          Send another inquiry
        </button>
      </div>
    );
  }

  const onSubmit = async (data) => {
    try {
      setSubmitError(null);
      await inquiryApi.createInquiry({
        propertyId,
        name: data.name,
        email: data.email,
        phone: data.phone || undefined,
        message: data.message,
      });
      setSubmitted(true);
    } catch (err) {
      const message = err.response?.data?.error?.message || 'Failed to send inquiry. Please try again.';
      setSubmitError(message);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      <h3 className="mb-4 text-lg font-semibold text-gray-900">
        Contact Agent
      </h3>

      {submitError && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {submitError}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label htmlFor="inquiry-name" className="block text-sm font-medium text-gray-700">
            Name <span className="text-red-500">*</span>
          </label>
          <input
            id="inquiry-name"
            type="text"
            {...register('name')}
            className={`mt-1 block w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              errors.name ? 'border-red-300' : 'border-gray-300'
            }`}
          />
          {errors.name && (
            <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="inquiry-email" className="block text-sm font-medium text-gray-700">
            Email <span className="text-red-500">*</span>
          </label>
          <input
            id="inquiry-email"
            type="email"
            {...register('email')}
            className={`mt-1 block w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              errors.email ? 'border-red-300' : 'border-gray-300'
            }`}
          />
          {errors.email && (
            <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="inquiry-phone" className="block text-sm font-medium text-gray-700">
            Phone <span className="text-gray-400">(optional)</span>
          </label>
          <input
            id="inquiry-phone"
            type="tel"
            {...register('phone')}
            className={`mt-1 block w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              errors.phone ? 'border-red-300' : 'border-gray-300'
            }`}
          />
          {errors.phone && (
            <p className="mt-1 text-xs text-red-600">{errors.phone.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="inquiry-message" className="block text-sm font-medium text-gray-700">
            Message <span className="text-red-500">*</span>
          </label>
          <textarea
            id="inquiry-message"
            rows={4}
            {...register('message')}
            placeholder="I'm interested in this property. Please provide more details..."
            className={`mt-1 block w-full rounded-md border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              errors.message ? 'border-red-300' : 'border-gray-300'
            }`}
          />
          {errors.message && (
            <p className="mt-1 text-xs text-red-600">{errors.message.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
              Sending...
            </>
          ) : (
            <>
              <Send className="h-4 w-4" />
              Send Inquiry
            </>
          )}
        </button>
      </form>
    </div>
  );
};

export default InquiryForm;
