import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { Navigate, useNavigate } from "react-router-dom";
import { Lock, User as UserIcon } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { extractErrorMessage } from "../services/api";

interface LoginForm {
  username_or_email: string;
  password: string;
}

export const LoginPage: React.FC = () => {
  const { user, ownerInitialized, login } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>();

  if (ownerInitialized === false) return <Navigate to="/setup-owner" replace />;
  if (user) return <Navigate to="/" replace />;

  const onSubmit = async (data: LoginForm) => {
    setServerError(null);
    try {
      await login(data.username_or_email, data.password);
      navigate("/", { replace: true });
    } catch (err) {
      setServerError(extractErrorMessage(err, "Sign in failed. Please check your credentials."));
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-navy-900 via-navy-800 to-navy-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-8">
        <div className="text-center mb-8">
          <div className="h-14 w-14 rounded-2xl bg-navy-800 text-gold-400 font-extrabold text-xl flex items-center justify-center mx-auto shadow-lg">
            SVT
          </div>
          <p className="text-xs font-bold uppercase tracking-widest text-gold-600 mt-4">
            Enterprise Resource Planning
          </p>
          <h1 className="text-2xl font-bold text-navy-900 mt-1">SRI VASAVI TEXTILES</h1>
          <p className="text-xs text-slate-500 mt-1">Wholesale & Retail Textile Trading Management</p>
        </div>

        {serverError && (
          <div className="mb-4 rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
            {serverError}
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="label-text">Username or Email</label>
            <div className="relative">
              <UserIcon className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                className="input-field pl-9"
                placeholder="Enter username or email"
                {...register("username_or_email", { required: "Username or email is required" })}
              />
            </div>
            {errors.username_or_email && (
              <p className="text-xs text-rose-600 mt-1">{errors.username_or_email.message}</p>
            )}
          </div>

          <div>
            <label className="label-text">Password</label>
            <div className="relative">
              <Lock className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                className="input-field pl-9"
                placeholder="Enter password"
                {...register("password", { required: "Password is required" })}
              />
            </div>
            {errors.password && <p className="text-xs text-rose-600 mt-1">{errors.password.message}</p>}
          </div>

          <button type="submit" disabled={isSubmitting} className="btn-primary w-full py-2.5">
            {isSubmitting ? "Signing In..." : "Sign In to ERP"}
          </button>
        </form>
      </div>
    </div>
  );
};

