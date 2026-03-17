import type { Route } from "./+types/logout";
import { redirect } from "react-router";
import { getSession, destroySession } from "~/sessions";

/**
 * Logout action - clears session and redirects to login
 */
export async function action({ request }: Route.ActionArgs) {
  const session = await getSession(request.headers.get("Cookie"));
  
  return redirect("/login", {
    headers: {
      "Set-Cookie": await destroySession(session),
    },
  });
}

/**
 * Loader also handles logout (GET request)
 */
export async function loader({ request }: Route.LoaderArgs) {
  const session = await getSession(request.headers.get("Cookie"));
  
  return redirect("/login", {
    headers: {
      "Set-Cookie": await destroySession(session),
    },
  });
}

/**
 * Logout page - immediately redirects
 */
export default function LogoutPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <p className="text-gray-600 dark:text-gray-400">Logging out...</p>
    </div>
  );
}
