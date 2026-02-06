"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { createBrowserClient } from "@/lib/supabase/client";

function LoginForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [error, setError] = useState(searchParams.get("error") ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("login");

  const redirect = searchParams.get("redirect") ?? "/dashboard";

  async function signInWithOAuth(provider: "google" | "github") {
    const supabase = createBrowserClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) setError(error.message);
  }

  async function signInWithEmail(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const supabase = createBrowserClient();

    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      setLoading(false);
      if (error) {
        setError(error.message);
      } else {
        setError("");
        setMode("login");
        alert("Check your email for a confirmation link.");
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      setLoading(false);
      if (error) {
        setError(error.message);
      } else {
        router.push(redirect);
      }
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">
          {mode === "login" ? "Sign in to Litmus" : "Create an account"}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {mode === "login"
            ? "Sign in to submit agents, run benchmarks, and write reviews."
            : "Create an account to get started with Litmus."}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-red-500 text-center">{error}</p>}

        <form onSubmit={signInWithEmail} className="space-y-3">
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
          />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            disabled={loading}
          />
          <Button type="submit" className="w-full" disabled={loading}>
            {loading
              ? "Loading..."
              : mode === "login"
                ? "Sign In"
                : "Sign Up"}
          </Button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          {mode === "login" ? (
            <>
              Don&apos;t have an account?{" "}
              <button
                type="button"
                className="underline hover:text-foreground"
                onClick={() => { setMode("signup"); setError(""); }}
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                className="underline hover:text-foreground"
                onClick={() => { setMode("login"); setError(""); }}
              >
                Sign in
              </button>
            </>
          )}
        </p>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
          </div>
        </div>

        <Button className="w-full" variant="outline" onClick={() => signInWithOAuth("google")}>
          Continue with Google
        </Button>
        <Button className="w-full" variant="outline" onClick={() => signInWithOAuth("github")}>
          Continue with GitHub
        </Button>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="container mx-auto px-4 md:px-6 flex items-center justify-center min-h-[60vh]">
      <Suspense fallback={<Skeleton className="w-full max-w-md h-[300px]" />}>
        <LoginForm />
      </Suspense>
    </div>
  );
}
