import React, { useState } from "react";
import { useForm } from "react-hook-form";
import { Navigate, useNavigate } from "react-router-dom";
import { Eye, EyeOff, KeyRound, Lock, Phone, User as UserIcon, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api, extractErrorMessage } from "../services/api";

interface LoginForm {
  username_or_email: string;
  password: string;
}

export const LoginPage: React.FC = () => {
  const { user, ownerInitialized, login } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Forgot password modal state
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotIdentifier, setForgotIdentifier] = useState("");
  const [forgotMobile, setForgotMobile] = useState("");
  const [forgotNewPass, setForgotNewPass] = useState("");
  const [forgotConfirmPass, setForgotConfirmPass] = useState("");
  const [forgotShowPass, setForgotShowPass] = useState(false);
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotSuccess, setForgotSuccess] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>();

  const enteredUsername = watch("username_or_email");

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

  const handleOpenForgot = () => {
    setForgotIdentifier(enteredUsername || "");
    setForgotMobile("");
    setForgotNewPass("");
    setForgotConfirmPass("");
    setForgotError(null);
    setForgotSuccess(null);
    setForgotOpen(true);
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError(null);
    setForgotSuccess(null);

    if (!forgotIdentifier.trim()) {
      setForgotError("Please enter your registered Username or Email.");
      return;
    }
    if (!forgotMobile.trim()) {
      setForgotError("Please enter your registered Mobile Number.");
      return;
    }
    if (forgotNewPass.length < 8) {
      setForgotError("New password must be at least 8 characters long.");
      return;
    }
    if (forgotNewPass !== forgotConfirmPass) {
      setForgotError("New password and confirmation do not match.");
      return;
    }

    setForgotSubmitting(true);
    try {
      const res = await api.post<{ message: string }>("/auth/forgot-password-reset", {
        identifier: forgotIdentifier.trim(),
        registered_mobile: forgotMobile.trim(),
        new_password: forgotNewPass,
      });
      setForgotSuccess(res.data.message || "Password reset successfully! Please sign in with your new password.");
      setTimeout(() => {
        setForgotOpen(false);
      }, 2500);
    } catch (err) {
      setForgotError(extractErrorMessage(err, "Failed to reset password. Please check your details."));
    } finally {
      setForgotSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-navy-900 via-navy-800 to-navy-900 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-8 relative">
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
            <label className="label-text">Username</label>
            <div className="relative">
              <UserIcon className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                className="input-field pl-9"
                placeholder="Enter username"
                autoComplete="username"
                {...register("username_or_email", { required: "Username is required" })}
              />
            </div>
            {errors.username_or_email && (
              <p className="text-xs text-rose-600 mt-1">{errors.username_or_email.message}</p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label-text mb-0">Password</label>
              <button
                type="button"
                onClick={handleOpenForgot}
                className="text-xs font-semibold text-navy-700 hover:text-gold-600 hover:underline transition-colors"
              >
                Forgot Password?
              </button>
            </div>
            <div className="relative">
              <Lock className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? "text" : "password"}
                className="input-field pl-9 pr-10"
                placeholder="Enter password"
                {...register("password", { required: "Password is required" })}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-navy-900 transition-colors p-1 rounded-md"
                title={showPassword ? "Hide password" : "Show password"}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.password && <p className="text-xs text-rose-600 mt-1">{errors.password.message}</p>}
          </div>

          <button type="submit" disabled={isSubmitting} className="btn-primary w-full py-2.5">
            {isSubmitting ? "Signing In..." : "Sign In to ERP"}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-slate-100 text-center">
          <p className="text-[11px] text-slate-400">
            Sri Vasavi Textiles ERP • Secured with JWT & RBAC
          </p>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {forgotOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 relative">
            <button
              onClick={() => setForgotOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-gold-50 border border-gold-200 text-gold-700">
                <KeyRound className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-navy-900">Reset Account Password</h3>
                <p className="text-xs text-slate-500">Verify your registered details to set a new password</p>
              </div>
            </div>

            {forgotError && (
              <div className="mb-4 rounded-lg bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700">
                {forgotError}
              </div>
            )}

            {forgotSuccess && (
              <div className="mb-4 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-800 font-medium">
                {forgotSuccess}
              </div>
            )}

            {!forgotSuccess && (
              <form onSubmit={handleForgotSubmit} className="space-y-3.5">
                <div>
                  <label className="label-text">Username</label>
                  <div className="relative">
                    <UserIcon className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      className="input-field pl-9 text-xs"
                      placeholder="Enter your username"
                      value={forgotIdentifier}
                      onChange={(e) => setForgotIdentifier(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="label-text">Registered Mobile Number</label>
                  <div className="relative">
                    <Phone className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      className="input-field pl-9 text-xs"
                      placeholder="Enter 10-digit mobile number"
                      value={forgotMobile}
                      onChange={(e) => setForgotMobile(e.target.value)}
                      required
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Enter the mobile number linked with your Sri Vasavi Textiles account.
                  </p>
                </div>

                <div>
                  <label className="label-text">New Password</label>
                  <div className="relative">
                    <Lock className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type={forgotShowPass ? "text" : "password"}
                      className="input-field pl-9 pr-10 text-xs"
                      placeholder="At least 8 characters"
                      value={forgotNewPass}
                      onChange={(e) => setForgotNewPass(e.target.value)}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setForgotShowPass((prev) => !prev)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-navy-900 p-1"
                      tabIndex={-1}
                    >
                      {forgotShowPass ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="label-text">Confirm New Password</label>
                  <div className="relative">
                    <Lock className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type={forgotShowPass ? "text" : "password"}
                      className="input-field pl-9 pr-10 text-xs"
                      placeholder="Re-enter new password"
                      value={forgotConfirmPass}
                      onChange={(e) => setForgotConfirmPass(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setForgotOpen(false)}
                    className="btn-secondary text-xs py-2 px-3"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={forgotSubmitting}
                    className="btn-primary text-xs py-2 px-4"
                  >
                    {forgotSubmitting ? "Resetting..." : "Reset Password"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
