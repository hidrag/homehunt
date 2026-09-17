import React from "react";
import { useSelector } from "react-redux";
import { ShieldCheck } from "lucide-react";

const Admin = () => {
  const { user } = useSelector((state) => state.auth);

  return (
    <div className="container mx-auto px-4 py-12">
      <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-indigo-50 p-3 text-indigo-600">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Admin Area</h1>
            <p className="text-sm text-gray-500">
              Administrator access verified for {user?.name}
            </p>
          </div>
        </div>
        <div className="mt-6 rounded-lg bg-gray-50 p-6 text-sm text-gray-600 border border-gray-100">
          <p>
            This is the protected administration portal. Full admin moderation
            tools and platform analytics are scheduled for Sprint 7.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Admin;
