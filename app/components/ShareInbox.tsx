"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { listenShared, putInbox } from "@/lib/shareTarget";
import { fixAppRoute } from "@/lib/platform";
import { installBack } from "@/lib/back";

/** Mounted once in the layout. App only: fixes deep-path reloads and receives files from the Android share sheet
 * (they open the send sheet on the home page). */
export default function ShareInbox() {
  const router = useRouter();
  const path = usePathname() || "/";
  useEffect(() => {
    fixAppRoute();
    installBack();
  }, []);
  useEffect(
    () =>
      listenShared(
        (f) => {
          putInbox(f);
          if (path !== "/" && path !== "/index.html") router.push("/");
        },
        () => {}
      ),
    [path, router]
  );
  return null;
}
