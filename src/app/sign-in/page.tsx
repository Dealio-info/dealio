import { EntryFrame } from "@/components/brand/entry-frame";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SignInForm } from "./sign-in-form";

export const metadata = { title: "Sign in · Dealio" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next = "/", error } = await searchParams;

  return (
    <EntryFrame>
      <Card className="shadow-glow">
        <CardHeader>
          <CardTitle className="text-xl">Sign in</CardTitle>
          <p className="text-muted-foreground text-sm">Sign in to continue.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <p role="alert" className="text-destructive text-sm">
              {error === "missing_code"
                ? "That sign-in link was incomplete. Please request a new one."
                : "That sign-in link could not be used. It may have expired."}
            </p>
          )}
          <SignInForm next={next} />
        </CardContent>
      </Card>
    </EntryFrame>
  );
}
