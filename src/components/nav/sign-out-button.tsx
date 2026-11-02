import { Button } from "@/components/ui/button";

/**
 * A real form posting to `/sign-out`, not a fetch from a click handler, so it
 * works before hydration and cannot be triggered by a prefetch.
 */
export function SignOutButton() {
  return (
    <form action="/sign-out" method="post">
      <Button type="submit" variant="ghost" size="sm">
        Sign out
      </Button>
    </form>
  );
}
