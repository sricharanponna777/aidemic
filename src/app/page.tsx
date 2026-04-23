"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase-client";

export default function Home() {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const checkAuth = async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        router.push("/dashboard");
      } else {
        router.push("/login");
      }
      setIsChecking(false);
    };

    checkAuth();
  }, [router, supabase]);

  if (isChecking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-blue-600 dark:from-blue-800 to-blue-800 dark:to-blue-950">
        <p className="text-lg text-white">Loading AIDemic...</p>
      </div>
    );
  }

  return null;
}
