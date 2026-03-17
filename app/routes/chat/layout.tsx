import type { Route } from "./+types/layout";
import { Outlet, Link, Form, useLoaderData } from "react-router";
import { getSession } from "~/sessions";
import { useState, useEffect } from "react";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Chat - OWU" },
    { name: "description", content: "Chat with AI models" },
  ];
}

/**
 * Loader: Require authentication and load user's chat sessions
 */
export async function loader({ request }: Route.LoaderArgs) {
  const session = await getSession(request.headers.get("Cookie"));
  const { requireUser } = await import("~/lib/server/session.server");
  const { getUserChatSessions } = await import("~/lib/server/ownership.server");

  // Require authentication - redirects to login if not authenticated
  const user = requireUser(session);

  // Load user's chat sessions
  const sessions = await getUserChatSessions(user);

  return { user, sessions };
}

export default function ChatLayout() {
  const { user, sessions } = useLoaderData<typeof loader>();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Handle responsive detection
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth >= 768) {
        setIsMobileMenuOpen(false);
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Close mobile menu when clicking outside
  useEffect(() => {
    if (isMobileMenuOpen) {
      const handleClickOutside = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (!target.closest('[data-sidebar]') && !target.closest('[data-menu-button]')) {
          setIsMobileMenuOpen(false);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isMobileMenuOpen]);

  return (
    <div className="h-screen flex overflow-hidden bg-white dark:bg-gray-950">
      {/* Mobile menu overlay */}
      {isMobile && isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 animate-fade-in"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar - ChatGPT style dark sidebar */}
      <aside
        data-sidebar
        className={`
          fixed md:static inset-y-0 left-0 z-50
          w-72 md:w-72
          bg-gray-900 text-gray-100
          flex flex-col
          transform transition-transform duration-300 ease-in-out
          ${isMobile ? (isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full') : 'translate-x-0'}
        `}
      >
        {/* Sidebar header */}
        <div className="p-3 flex items-center justify-between border-b border-gray-800">
          <Link to="/" className="flex items-center gap-2 px-2">
            <div className="w-8 h-8 bg-white text-gray-900 rounded-lg flex items-center justify-center font-bold text-sm">
              O
            </div>
            <span className="font-semibold text-gray-100">OWU</span>
          </Link>
          {isMobile && (
            <button
              onClick={() => setIsMobileMenuOpen(false)}
              className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-gray-100"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* New chat button */}
        <div className="p-3">
          <Link
            to="/chat"
            onClick={() => isMobile && setIsMobileMenuOpen(false)}
            className="w-full border border-gray-700 hover:border-gray-600 text-gray-100 py-2.5 px-4 rounded-lg transition-all flex items-center gap-3 text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New chat
          </Link>
        </div>

        {/* Chat history */}
        <div className="flex-1 overflow-y-auto px-3">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 px-2 mt-2">
            Recent
          </div>
          {sessions.length === 0 ? (
            <div className="text-center py-8 px-2">
              <div className="w-8 h-8 bg-gray-800 rounded-lg flex items-center justify-center mx-auto mb-3">
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <p className="text-sm text-gray-500">
                No conversations yet
              </p>
            </div>
          ) : (
            <div className="space-y-0.5">
              {sessions.map((session) => (
                <Link
                  key={session.id}
                  to={`/chat/${session.id}`}
                  onClick={() => isMobile && setIsMobileMenuOpen(false)}
                  className="block px-3 py-2.5 rounded-lg hover:bg-gray-800 text-sm transition-colors group text-gray-300 hover:text-gray-100"
                  title={session.title}
                >
                  <div className="flex items-start gap-3">
                    <svg className="w-4 h-4 text-gray-500 mt-0.5 flex-shrink-0 group-hover:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                    <span className="truncate flex-1 text-left">{session.title}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* User section */}
        <div className="p-3 border-t border-gray-800">
          {/* Admin link - only for admins */}
          {user.role === 'admin' && (
            <Link
              to="/admin"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 hover:text-gray-100 transition-colors mb-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Settings
            </Link>
          )}

          {/* Back to home */}
          <Link
            to="/"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-800 hover:text-gray-100 transition-colors mb-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
            Home
          </Link>

          {/* User info and logout */}
          <div className="pt-2 border-t border-gray-800 mt-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 px-2">
                <div className="w-7 h-7 rounded-full bg-green-600 flex items-center justify-center text-white text-xs font-medium">
                  {user.username.charAt(0).toUpperCase()}
                </div>
                <span className="text-sm text-gray-300 truncate max-w-[120px]">{user.username}</span>
              </div>
              <Form method="post" action="/logout">
                <button
                  type="submit"
                  className="p-2 rounded-lg text-gray-400 hover:text-gray-100 hover:bg-gray-800 transition-colors"
                  title="Log out"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </button>
              </Form>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0 bg-white dark:bg-gray-950">
        {/* Mobile header */}
        {isMobile && (
          <header className="h-14 border-b border-gray-200 dark:border-gray-800 flex items-center px-4 bg-white dark:bg-gray-950">
            <button
              data-menu-button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 -ml-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="ml-3 font-semibold">OWU Chat</span>
          </header>
        )}
        <Outlet />
      </main>
    </div>
  );
}
