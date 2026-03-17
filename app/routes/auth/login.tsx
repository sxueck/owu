import type { Route } from "./+types/login";
import { Link, redirect, Form, useActionData, useNavigation } from "react-router";
import { getSession, commitSession } from "~/sessions";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "登录 - OWU" },
    { name: "description", content: "登录 OWU" },
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
 * Action: Handle login form submission
 */
export async function action({ request }: Route.ActionArgs) {
  const session = await getSession(request.headers.get("Cookie"));
  const formData = await request.formData();
  const { verifyUserCredentials, toSessionData } = await import("~/lib/server/auth.server");
  const { createUserSession } = await import("~/lib/server/session.server");
  
  const emailOrUsername = formData.get("emailOrUsername") as string;
  const password = formData.get("password") as string;
  
  // Validation
  const errors: Record<string, string> = {};
  
  if (!emailOrUsername || emailOrUsername.trim() === "") {
    errors.emailOrUsername = "请输入邮箱或用户名";
  }
  
  if (!password || password === "") {
    errors.password = "请输入密码";
  }
  
  if (Object.keys(errors).length > 0) {
    return { errors, values: { emailOrUsername } };
  }
  
  // Verify credentials
  const user = await verifyUserCredentials(emailOrUsername.trim(), password);
  
  if (!user) {
    return { 
      errors: { general: "邮箱/用户名或密码错误" },
      values: { emailOrUsername }
    };
  }
  
  // Create session
  createUserSession(session, toSessionData(user));
  
  // Redirect to chat with session cookie
  return redirect("/chat", {
    headers: {
      "Set-Cookie": await commitSession(session),
    },
  });
}

export default function LoginPage() {
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
          <h1 className="text-2xl font-bold tracking-tight">欢迎回来</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            登录您的 OWU 账户
          </p>
        </div>

        {/* Login Card */}
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

            {/* Email/Username field */}
            <div>
              <label
                htmlFor="emailOrUsername"
                className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300"
              >
                邮箱或用户名
              </label>
              <input
                type="text"
                id="emailOrUsername"
                name="emailOrUsername"
                defaultValue={actionData?.values?.emailOrUsername || ""}
                placeholder="you@example.com"
                className={`w-full px-4 py-2.5 rounded-xl border bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                  actionData?.errors?.emailOrUsername
                    ? 'border-red-500 focus:border-red-500'
                    : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600'
                }`}
                autoComplete="username"
                autoFocus
              />
              {actionData?.errors?.emailOrUsername && (
                <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">
                  {actionData.errors.emailOrUsername}
                </p>
              )}
            </div>

            {/* Password field */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300"
              >
                密码
              </label>
              <input
                type="password"
                id="password"
                name="password"
                placeholder="请输入密码"
                className={`w-full px-4 py-2.5 rounded-xl border bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all ${
                  actionData?.errors?.password
                    ? 'border-red-500 focus:border-red-500'
                    : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600'
                }`}
                autoComplete="current-password"
              />
              {actionData?.errors?.password && (
                <p className="mt-1.5 text-sm text-red-600 dark:text-red-400">
                  {actionData.errors.password}
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
                  登录中...
                </span>
              ) : (
                "登录"
              )}
            </button>
          </Form>

          <div className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
            还没有账户？{" "}
            <Link
              to="/register"
              className="text-blue-600 hover:text-blue-700 font-medium hover:underline"
            >
              立即注册
            </Link>
          </div>
        </div>

        {/* Hint for default admin */}
        <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
          <p className="text-xs text-blue-700 dark:text-blue-400 text-center">
            <strong>默认管理员：</strong>用户名 <code className="bg-blue-100 dark:bg-blue-800 px-1.5 py-0.5 rounded">admin</code>，密码 <code className="bg-blue-100 dark:bg-blue-800 px-1.5 py-0.5 rounded">admin123</code>
          </p>
        </div>
      </div>
    </div>
  );
}
