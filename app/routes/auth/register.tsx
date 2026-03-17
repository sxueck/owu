import type { Route } from "./+types/register";
import { Link, redirect, Form, useActionData, useNavigation } from "react-router";
import { getSession, commitSession } from "~/sessions";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Register - OWU" },
    { name: "description", content: "Create an OWU account" },
  ];
}

/**
 * Loader: Redirect already logged-in users to chat
 */
export async function loader({ request }: Route.LoaderArgs) {
  const session = await getSession(request.headers.get("Cookie"));
  const userId = session.get("userId");
  
  if (userId) {
    return redirect("/chat");
  }
  
  return null;
}

/**
 * Action: Handle registration form submission
 */
export async function action({ request }: Route.ActionArgs) {
  const session = await getSession(request.headers.get("Cookie"));
  const formData = await request.formData();
  const {
    registerUser,
    toSessionData,
    validatePassword,
    validateEmail,
    validateUsername,
  } = await import("~/lib/server/auth.server");
  const { createUserSession } = await import("~/lib/server/session.server");
  
  const username = formData.get("username") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const confirmPassword = formData.get("confirmPassword") as string;
  
  // Validation
  const errors: Record<string, string> = {};
  
  // Username validation
  const usernameError = validateUsername(username);
  if (usernameError) {
    errors.username = usernameError;
  }
  
  // Email validation
  const emailError = validateEmail(email);
  if (emailError) {
    errors.email = emailError;
  }
  
  // Password validation
  const passwordError = validatePassword(password);
  if (passwordError) {
    errors.password = passwordError;
  }
  
  // Confirm password
  if (password !== confirmPassword) {
    errors.confirmPassword = "Passwords do not match";
  }
  
  if (Object.keys(errors).length > 0) {
    return { errors, values: { username, email } };
  }
  
  // Register user
  const result = await registerUser({
    email: email.trim(),
    username: username.trim(),
    password,
  });
  
  if (!result.success) {
    return { 
      errors: { general: result.error },
      values: { username, email }
    };
  }
  
  // Create session
  createUserSession(session, toSessionData(result.user));
  
  // Redirect to chat with session cookie
  return redirect("/chat", {
    headers: {
      "Set-Cookie": await commitSession(session),
    },
  });
}

export default function RegisterPage() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-gray-50 dark:bg-gray-950">
      <div className="w-full max-w-md animate-slide-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-block">
            <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-600/20">
              <span className="text-white font-bold text-2xl">O</span>
            </div>
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Create account</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            Get started with OWU today
          </p>
        </div>

        {/* Register Card */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm">
          <Form method="post" className="space-y-5">
            {/* General error */}
            {actionData?.errors?.general && (
              <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm animate-fade-in">
                <div className="flex items-start gap-2">
                  <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <span>{actionData.errors.general}</span>
                </div>
              </div>
            )}

            {/* Username field */}
            <div>
              <label
                htmlFor="username"
                className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300"
              >
                Username
              </label>
              <input
                type="text"
                id="username"
                name="username"
                defaultValue={actionData?.values?.username || ""}
                placeholder="johndoe"
                className={`w-full px-4 py-2.5 rounded-xl border bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                  actionData?.errors?.username
                    ? 'border-red-500 focus:border-red-500'
                    : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600'
                }`}
                autoComplete="username"
                autoFocus
              />
              {actionData?.errors?.username ? (
                <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">
                  {actionData.errors.username}
                </p>
              ) : (
                <p className="mt-1.5 text-xs text-gray-500">
                  3-30 characters, letters, numbers, and underscores only
                </p>
              )}
            </div>

            {/* Email field */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300"
              >
                Email
              </label>
              <input
                type="email"
                id="email"
                name="email"
                defaultValue={actionData?.values?.email || ""}
                placeholder="you@example.com"
                className={`w-full px-4 py-2.5 rounded-xl border bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                  actionData?.errors?.email
                    ? 'border-red-500 focus:border-red-500'
                    : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600'
                }`}
                autoComplete="email"
              />
              {actionData?.errors?.email && (
                <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">
                  {actionData.errors.email}
                </p>
              )}
            </div>

            {/* Password field */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300"
              >
                Password
              </label>
              <input
                type="password"
                id="password"
                name="password"
                placeholder="••••••••"
                className={`w-full px-4 py-2.5 rounded-xl border bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                  actionData?.errors?.password
                    ? 'border-red-500 focus:border-red-500'
                    : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600'
                }`}
                autoComplete="new-password"
              />
              {actionData?.errors?.password ? (
                <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">
                  {actionData.errors.password}
                </p>
              ) : (
                <p className="mt-1.5 text-xs text-gray-500">
                  At least 8 characters with uppercase, lowercase, and number
                </p>
              )}
            </div>

            {/* Confirm Password field */}
            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300"
              >
                Confirm Password
              </label>
              <input
                type="password"
                id="confirmPassword"
                name="confirmPassword"
                placeholder="••••••••"
                className={`w-full px-4 py-2.5 rounded-xl border bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                  actionData?.errors?.confirmPassword
                    ? 'border-red-500 focus:border-red-500'
                    : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600'
                }`}
                autoComplete="new-password"
              />
              {actionData?.errors?.confirmPassword && (
                <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">
                  {actionData.errors.confirmPassword}
                </p>
              )}
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-blue-600 text-white py-2.5 rounded-xl font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-900 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-blue-600 shadow-sm"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Creating account...
                </span>
              ) : (
                "Create Account"
              )}
            </button>
          </Form>

          <div className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
            Already have an account?{" "}
            <Link
              to="/login"
              className="text-blue-600 hover:text-blue-700 font-medium hover:underline"
            >
              Sign in
            </Link>
          </div>
        </div>


      </div>
    </div>
  );
}
