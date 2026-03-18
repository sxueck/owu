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
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-white">
      <div className="w-full max-w-[420px] animate-slide-up">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-[2rem] font-semibold tracking-[-0.03em] text-[var(--chat-ink)]">欢迎回来</h1>
          <p className="text-[var(--chat-muted)] mt-3 text-[15px]">
            登录您的 OWU 账户
          </p>
        </div>

        {/* Login Card */}
        <div className="rounded-[24px] border border-[var(--chat-line)] bg-white p-6 shadow-[0_24px_48px_rgba(15,23,42,0.06)]">
          <Form method="post" className="space-y-5">
            {/* General error */}
            {actionData?.errors?.general && (
              <div className="mb-4 rounded-[16px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 animate-fade-in">
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
                className="block text-sm font-medium mb-2 text-[var(--chat-ink)]"
              >
                邮箱或用户名
              </label>
              <input
                type="text"
                id="emailOrUsername"
                name="emailOrUsername"
                defaultValue={actionData?.values?.emailOrUsername || ""}
                placeholder="请输入邮箱或用户名"
                className={`w-full px-4 py-3 rounded-[16px] border bg-white focus:outline-none transition-all ${
                  actionData?.errors?.emailOrUsername
                    ? 'border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-100'
                    : 'border-[var(--chat-line)] hover:border-[var(--chat-accent)]/40 focus:border-[var(--chat-accent)] focus:ring-2 focus:ring-[var(--chat-accent-soft)]'
                }`}
                autoComplete="username"
                autoFocus
              />
              {actionData?.errors?.emailOrUsername && (
                <p className="mt-2 text-sm text-red-600">
                  {actionData.errors.emailOrUsername}
                </p>
              )}
            </div>

            {/* Password field */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium mb-2 text-[var(--chat-ink)]"
              >
                密码
              </label>
              <input
                type="password"
                id="password"
                name="password"
                placeholder="请输入密码"
                className={`w-full px-4 py-3 rounded-[16px] border bg-white focus:outline-none transition-all ${
                  actionData?.errors?.password
                    ? 'border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-100'
                    : 'border-[var(--chat-line)] hover:border-[var(--chat-accent)]/40 focus:border-[var(--chat-accent)] focus:ring-2 focus:ring-[var(--chat-accent-soft)]'
                }`}
                autoComplete="current-password"
              />
              {actionData?.errors?.password && (
                <p className="mt-2 text-sm text-red-600">
                  {actionData.errors.password}
                </p>
              )}
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-[var(--chat-forest)] text-white py-3 rounded-full font-medium hover:bg-[#1b4fb9] focus:outline-none focus:ring-2 focus:ring-[var(--chat-accent)] focus:ring-offset-2 focus:ring-offset-white disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[var(--chat-forest)] transition-all duration-200"
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

          <div className="mt-6 text-center text-sm text-[var(--chat-muted)]">
            还没有账户？{" "}
            <Link
              to="/register"
              className="text-[var(--chat-accent)] hover:text-[#1b4fb9] font-medium"
            >
              立即注册
            </Link>
          </div>
        </div>

      </div>
    </div>
  );
}
