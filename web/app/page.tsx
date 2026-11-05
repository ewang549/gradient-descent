import { Suspense } from "react";
import { Calculator } from "@/components/Calculator";

export default function Home() {
  return (
    <main className="relative">
      {/* the calculator reads the URL, so it renders on the client; the shell above it is static */}
      <Suspense fallback={<div className="min-h-dvh" />}>
        <Calculator />
      </Suspense>
    </main>
  );
}
