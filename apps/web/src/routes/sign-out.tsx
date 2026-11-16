import { useEffect, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link, useLocation } from "@tanstack/react-router";
import { signOut } from "@/lib/auth/auth-client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FormError } from "@/components/form/FormError";
import { AuthShell } from "./_unauth/-components/AuthShell";

export const Route = createFileRoute("/sign-out")({
  head: () => ({
    meta: [{ title: "Sign out · gitmatter" }, { name: "robots", content: "noindex" }],
  }),
  component: SignOut,
});

function SignOut() {
  const requested = useLocation({ select: (location) => location.state.signOutRequested === true });
  const navigate = Route.useNavigate();
  const consumedIntent = useRef(false);
  const request = useMutation({
    retry: false,
    mutationFn: async () => {
      const result = await signOut();
      if (result.error) throw new Error("Sign-out was not confirmed.");
    },
    onSuccess: () => {
      window.location.href = "/login";
    },
  });
  const { mutate } = request;
  useEffect(() => {
    // A normal router transition resolves dirty-work guards before this component mounts.
    // Direct URL entry and preloading carry no action intent and must not end a session.
    if (!requested || consumedIntent.current) return;
    consumedIntent.current = true;
    void navigate({
      replace: true,
      state: (previous) => ({ ...previous, signOutRequested: false }),
    });
    mutate();
  }, [requested, navigate, mutate]);
  const busy = requested || request.isPending || request.isSuccess;
  return (
    <main className="container mx-auto px-6 pt-page pb-12">
      <AuthShell
        title={busy ? "Signing out…" : "Sign out of gitmatter"}
        subtitle="End this browser session."
      >
        <Card>
          <CardContent className="flex flex-col gap-stack pt-6">
            {busy ? (
              <p role="status" className="text-sm text-muted-foreground">
                Waiting for sign-out confirmation. A request already sent may still finish if you
                leave this page.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                You can return to your workspace or sign out of this browser.
              </p>
            )}
            <FormError>
              {request.isError
                ? "Could not confirm sign-out. Retry, or return to your workspace to check your session."
                : null}
            </FormError>
            <Button
              disabled={busy}
              onClick={() => {
                if (!request.isPending) mutate();
              }}
            >
              {busy ? "Signing out…" : request.isError ? "Retry sign-out" : "Sign out"}
            </Button>
            {!busy && (
              <Button variant="outline" nativeButton={false} render={<Link to="/assistant" />}>
                Return to workspace
              </Button>
            )}
          </CardContent>
        </Card>
      </AuthShell>
    </main>
  );
}
