import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-24">
      <h1 className="text-4xl font-semibold tracking-tight">Dealio</h1>
      <p className="text-lg">Customer advocacy platform for SaaS sales teams.</p>
      <p className="opacity-70">
        Scaffold only. The application starts at Task 2 (schema and test harness). See{" "}
        <code>docs/decisions.md</code> for what has been settled and{" "}
        <code>CLAUDE.md</code> for the architecture rules.
      </p>
    </main>
  );
}
