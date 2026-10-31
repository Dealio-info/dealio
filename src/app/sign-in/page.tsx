import { SignInForm } from "./sign-in-form";

export const metadata = { title: "Sign in · Dealio" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next = "/", error } = await searchParams;

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dealio</h1>
        <p className="text-muted-foreground text-sm">Sign in to continue.</p>
      </div>

      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error === "missing_code"
            ? "That sign-in link was incomplete. Please request a new one."
            : "That sign-in link could not be used. It may have expired."}
        </p>
      )}

      <SignInForm next={next} />
    </main>
  );
}
