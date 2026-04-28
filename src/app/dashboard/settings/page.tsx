"use client";

import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase-client";
import { ThemeMode, useTheme } from "@/hooks/useTheme";
import { useRouter } from "next/navigation";
import { LogOut, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export default function Settings() {
  const { session, profile: loadedProfile } = useAuth();
  const router = useRouter();
  const supabase = createClient();
  const [isLoading, setIsLoading] = useState(false);
  const [isThemeSaving, setIsThemeSaving] = useState(false);
  const { theme, setTheme } = useTheme();
  useEffect(() => {
    if (loadedProfile?.theme === "light" || loadedProfile?.theme === "dark") {
      setTheme(loadedProfile.theme);
    }
  }, [loadedProfile?.theme, setTheme]);

  const handleSignOut = async () => {
    setIsLoading(true);
    await supabase.auth.signOut();
    router.push("/login");
  };

  const handleThemeChange = async (nextTheme: ThemeMode) => {
    if (nextTheme === theme) return;
    setTheme(nextTheme);
    if (!session?.user.id) return;

    setIsThemeSaving(true);
    const { error } = await supabase
      .from("user_profiles")
      .update({ theme: nextTheme })
      .eq("id", session.user.id);

    if (error) {
      console.error("Failed to save theme preference:", error.message);
    }
    setIsThemeSaving(false);
  };

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Settings</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Manage your account and preferences</p>
      </div>

      {/* Appearance Section */}
      <div className="rounded-lg bg-white p-8 shadow dark:bg-gray-800">
        <div className="mb-6">
          <h3 className="text-xl font-bold text-gray-900 dark:text-gray-100">Appearance</h3>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Pick the mode that feels best for your study sessions.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => handleThemeChange("light")}
            className={`rounded-xl border p-4 text-left transition ${
              theme === "light"
                ? "border-blue-500 bg-blue-50 shadow-sm dark:border-blue-400 dark:bg-blue-900/30"
                : "border-gray-200 bg-gray-50 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600"
            }`}
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
              <Sun className="h-4 w-4 text-amber-500" />
              Light mode
            </span>
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">Higher brightness with crisp contrast.</p>
          </button>
          <button
            type="button"
            onClick={() => handleThemeChange("dark")}
            className={`rounded-xl border p-4 text-left transition ${
              theme === "dark"
                ? "border-blue-500 bg-blue-50 shadow-sm dark:border-blue-400 dark:bg-blue-900/30"
                : "border-gray-200 bg-gray-50 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600"
            }`}
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
              <Moon className="h-4 w-4 text-indigo-500" />
              Dark mode
            </span>
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">Lower glare for long, late-night sessions.</p>
          </button>
        </div>
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">{isThemeSaving ? "Saving preference..." : "Preference is saved to your profile."}</p>
      </div>

      {/* Danger Zone */}
      <div className="rounded-lg bg-red-50 p-8 dark:bg-red-950/60 dark:ring-1 dark:ring-red-800/70">
        <div className="mb-6 flex items-center gap-3">
          <LogOut className="h-6 w-6 text-red-600 dark:text-red-400" />
          <h3 className="text-xl font-bold text-red-900 dark:text-red-100">Sign Out</h3>
        </div>

        <p className="mb-6 text-sm text-red-700 dark:text-red-300">Sign out of your account on this device. You&apos;ll need to sign in again to continue.</p>

        <button onClick={handleSignOut} disabled={isLoading} className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 px-4 rounded-xl transition duration-200">
          {isLoading ? "Signing out..." : "Sign Out"}
        </button>
      </div>
    </div>
  );
}
