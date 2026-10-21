import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { errorMessage } from "../lib/api";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});
type FormValues = z.infer<typeof schema>;

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    try {
      await login(values.email, values.password);
      navigate("/dashboard", { replace: true });
    } catch (e) {
      setServerError(errorMessage(e, "Login failed"));
    }
  });

  return (
    <div className="flex h-full items-center justify-center">
      <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-sm ring-1 ring-pearl-100">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-pearl-900">Grand Pearl Marquee</h1>
          <p className="text-sm text-pearl-500">Sign in to the management ERP</p>
        </div>

        {serverError && (
          <div className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            {serverError}
          </div>
        )}

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-pearl-700">Email</label>
            <input
              type="email"
              autoComplete="username"
              {...register("email")}
              className="mt-1 w-full rounded-md border border-pearl-200 px-3 py-2 text-sm focus:border-pearl-500 focus:outline-none"
            />
            {errors.email && (
              <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-pearl-700">Password</label>
            <input
              type="password"
              autoComplete="current-password"
              {...register("password")}
              className="mt-1 w-full rounded-md border border-pearl-200 px-3 py-2 text-sm focus:border-pearl-500 focus:outline-none"
            />
            {errors.password && (
              <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-md bg-pearl-600 px-3 py-2 text-sm font-medium text-white hover:bg-pearl-700 disabled:opacity-60"
          >
            {isSubmitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
