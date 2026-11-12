import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { Navigate, useNavigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { extractErrorMessage } from "../services/api";

interface SetupForm {
  username: string;
  email: string;
  full_name: string;
  mobile: string;
  password: string;
  confirm_password: string;
}

export const SetupOwnerPage: React.FC = () => {
  const { user, ownerInitialized, setupOwner } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<SetupForm>();

  if (user) return <Navigate to="/" replace />;
  if (ownerInitialized === true) return <Navigate to="/login" replace />;

  const onSubmit = async (data: SetupForm) => {
    setServerError(null);
    try {
      await setupOwner({
        username: data.username,
        email: data.email,
        full_name: data.full_name,
        mobile: data.mobile || undefined,
        password: data.password,
      });
      navigate("/", { replace: true });
    } catch (err) {
      setServerError(extractErrorMessage(err));
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-navy-900 via-navy-800 to-navy-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="h-12 w-12 rounded-xl bg-navy-800 text-gold-400 flex items-center justify-center shadow">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-gold-600">
              First-Time ERP Initialization
            </p>
            <h1 className="text-xl font-bold text-navy-900">Sri Vasavi Textiles — Owner Setup</h1>
          </div>
        </div>

        <p className="text-sm text-slate-600 mb-6">
          Create the primary Business Owner administrator account. The Owner holds full access to all modules, financial statements, permissions, and settings.
        </p>

        {serverError && (
          <div className="mb-4 rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-text">Full Name</label>
              <input
                className="input-field"
                placeholder="e.g. Vasavi Proprietor"
                {...register("full_name", { required: "Full name is required" })}
              />
              {errors.full_name && <p className="text-xs text-rose-600 mt-1">{errors.full_name.message}</p>}
            </div>
            <div>
              <label className="label-text">Username</label>
              <input
                className="input-field"
                placeholder="owner"
                {...register("username", {
                  required: "Username is required",
                  minLength: { value: 3, message: "Minimum 3 characters" },
                })}
              />
              {errors.username && <p className="text-xs text-rose-600 mt-1">{errors.username.message}</p>}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-text">Email</label>
              <input
                type="email"
                className="input-field"
                placeholder="owner@srivasavitextiles.com"
                {...register("email", { required: "Email is required" })}
              />
              {errors.email && <p className="text-xs text-rose-600 mt-1">{errors.email.message}</p>}
            </div>
            <div>
              <label className="label-text">Mobile Number</label>
              <input className="input-field" placeholder="+91 9876543210" {...register("mobile")} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label-text">Password</label>
              <input
                type="password"
                className="input-field"
                {...register("password", {
                  required: "Password is required",
                  minLength: { value: 8, message: "Minimum 8 characters" },
                })}
              />
              {errors.password && <p className="text-xs text-rose-600 mt-1">{errors.password.message}</p>}
            </div>
            <div>
              <label className="label-text">Confirm Password</label>
              <input
                type="password"
                className="input-field"
                {...register("confirm_password", {
                  validate: (val) => val === watch("password") || "Passwords do not match",
                })}
              />
              {errors.confirm_password && (
                <p className="text-xs text-rose-600 mt-1">{errors.confirm_password.message}</p>
              )}
            </div>
          </div>

          <button type="submit" disabled={isSubmitting} className="btn-primary w-full py-2.5">
            {isSubmitting ? "Initializing ERP..." : "Create Owner Account & Enter ERP"}
          </button>
        </form>
      </div>
    </div>
  );
};

