import { redirect } from "next/navigation";
import { env } from "@/lib/env";
import { isAuthenticated, signIn, verifyPassword } from "@/lib/auth";

/**
 * Sign-in page.
 *
 * A Server Action rather than a client component with fetch: the password never
 * enters client JavaScript state, and there is no API route to rate-limit
 * separately.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;

  // Already signed in — no reason to show the form.
  if (await isAuthenticated()) redirect(params.next ?? "/");

  async function authenticate(formData: FormData): Promise<void> {
    "use server";

    const password = formData.get("password");
    const next = formData.get("next");
    const target = typeof next === "string" && next.startsWith("/") ? next : "/";

    if (typeof password !== "string" || password.length === 0) {
      redirect(`/login?error=1&next=${encodeURIComponent(target)}`);
    }

    const ok = await verifyPassword(password, env.OWNER_PASSWORD_HASH);
    if (!ok) {
      // One undifferentiated failure message: distinguishing "no password
      // supplied" from "wrong password" tells an attacker nothing useful, and
      // distinguishing "misconfigured hash" would leak deployment state.
      redirect(`/login?error=1&next=${encodeURIComponent(target)}`);
    }

    await signIn();
    redirect(target);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold tracking-tight">Recipes</h1>
      <p className="mt-1 text-sm text-text-muted">This collection is private.</p>

      <form action={authenticate} className="mt-8 flex flex-col gap-3">
        <input type="hidden" name="next" value={params.next ?? "/"} />
        <label htmlFor="password" className="text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          required
          className="rounded-card border border-border bg-surface px-3 py-2 text-base outline-none focus:border-accent"
        />
        {params.error ? (
          <p className="text-sm text-danger" role="alert">
            Incorrect password.
          </p>
        ) : null}
        <button
          type="submit"
          className="mt-2 rounded-card bg-accent px-3 py-2 font-medium text-white transition-opacity hover:opacity-90"
        >
          Sign in
        </button>
      </form>
    </main>
  );
}
