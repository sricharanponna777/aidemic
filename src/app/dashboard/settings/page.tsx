"use client";

import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase-client";
import { ThemeMode, useTheme } from "@/hooks/useTheme";
import { useSfxMuted } from "@/hooks/useSfxMuted";
import { useRouter } from "next/navigation";
import { BookOpen, LogOut, Moon, Sun, Volume2, VolumeX } from "lucide-react";
import { useEffect, useState } from "react";
import { buttonStyles } from "@/components/ui/button";

export default function Settings() {
  const { session, profile: loadedProfile } = useAuth();
  const router = useRouter();
  const supabase = createClient();
  const [isLoading, setIsLoading] = useState(false);
  const [isThemeSaving, setIsThemeSaving] = useState(false);
  const { theme, setTheme } = useTheme();
  const { muted, toggleMuted } = useSfxMuted();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [isProfileSaving, setIsProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSaved, setProfileSaved] = useState(false);
  const [loadedProfileId, setLoadedProfileId] = useState<string | null>(null);

  useEffect(() => {
    if (loadedProfile?.theme === "light" || loadedProfile?.theme === "dark") {
      setTheme(loadedProfile.theme);
    }
  }, [loadedProfile?.theme, setTheme]);

  if (loadedProfile && loadedProfile.id !== loadedProfileId) {
    setLoadedProfileId(loadedProfile.id);
    setFirstName(loadedProfile.first_name ?? "");
    setLastName(loadedProfile.last_name ?? "");
    setUsername(loadedProfile.username ?? "");
  }

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user.id) return;
    setIsProfileSaving(true);
    setProfileError("");
    setProfileSaved(false);
    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();
    const trimmedUsername = username.trim();
    const { error } = await supabase
      .from("user_profiles")
      .update({
        first_name: trimmedFirstName,
        last_name: trimmedLastName,
        full_name: `${trimmedFirstName} ${trimmedLastName}`.trim(),
        username: trimmedUsername,
      })
      .eq("id", session.user.id);
    if (error) {
      setProfileError(
        error.code === "23505" ? "That username is already taken. Please choose another." : error.message
      );
    } else {
      setProfileSaved(true);
    }
    setIsProfileSaving(false);
  };

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
    if (error) console.error("Failed to save theme preference:", error.message);
    setIsThemeSaving(false);
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Settings</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Manage your account and preferences</p>
      </div>

      <form
        onSubmit={handleProfileSave}
        className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/6 dark:bg-[#131B2E] dark:shadow-none sm:p-8"
      >
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Profile</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Update your name and username.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">First name</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-600 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Last name</label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-600 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              pattern="[a-zA-Z0-9_]{3,20}"
              title="3-20 characters: letters, numbers, and underscores only"
              className="w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-600 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:placeholder-gray-400"
            />
          </div>
        </div>
        {profileError && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">{profileError}</p>
        )}
        <div className="mt-4 flex items-center gap-3">
          <button type="submit" disabled={isProfileSaving} className={buttonStyles({ variant: "primary" })}>
            {isProfileSaving ? "Saving..." : "Save changes"}
          </button>
          {profileSaved && !isProfileSaving && (
            <span className="text-sm text-gray-500 dark:text-gray-400">Saved.</span>
          )}
        </div>
      </form>

      {loadedProfile?.role !== "teacher" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/6 dark:bg-[#131B2E] dark:shadow-none">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Subjects</h2>
              </div>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Manage saved qualifications from the main Subjects page.
              </p>
            </div>
            <Link href="/dashboard/subjects" className={buttonStyles({ variant: "secondary" })}>
              Subjects
            </Link>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/6 dark:bg-[#131B2E] dark:shadow-none sm:p-8">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Appearance</h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Pick the mode that feels best for your Flashcard reviews.</p>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <button
            type="button"
            onClick={() => handleThemeChange("light")}
            className={buttonStyles({
              variant: "plain",
              size: "none",
              className: `justify-start rounded-lg border p-4 text-left ${
                theme === "light"
                  ? "border-indigo-500 bg-indigo-50 shadow-sm dark:border-indigo-400 dark:bg-indigo-900/20"
                  : "border-slate-200 bg-slate-50 hover:bg-slate-100 dark:border-white/6 dark:bg-white/8 dark:hover:bg-white/12"
              }`,
            })}
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
            className={buttonStyles({
              variant: "plain",
              size: "none",
              className: `justify-start rounded-lg border p-4 text-left ${
                theme === "dark"
                  ? "border-indigo-500 bg-indigo-50 shadow-sm dark:border-indigo-400 dark:bg-indigo-900/20"
                  : "border-slate-200 bg-slate-50 hover:bg-slate-100 dark:border-white/6 dark:bg-white/8 dark:hover:bg-white/12"
              }`,
            })}
          >
            <span className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
              <Moon className="h-4 w-4 text-indigo-500" />
              Dark mode
            </span>
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">Lower glare for long, late-night sessions.</p>
          </button>
        </div>
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          {isThemeSaving ? "Saving preference..." : "Preference is saved to your profile."}
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-white/6 dark:bg-[#131B2E] dark:shadow-none sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Sound effects</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">Clicks and keystrokes make a subtle sound as you use AIDemic.</p>
          </div>
          <button
            type="button"
            onClick={toggleMuted}
            aria-pressed={!muted}
            className={buttonStyles({ variant: muted ? "secondary" : "primary" })}
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            {muted ? "Muted" : "On"}
          </button>
        </div>
      </div>

      <div className="rounded-2xl bg-red-50 p-6 dark:bg-red-950/60 dark:ring-1 dark:ring-red-800/70 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <LogOut className="h-6 w-6 text-red-600 dark:text-red-400" />
          <h2 className="text-xl font-bold text-red-900 dark:text-red-100">Sign Out</h2>
        </div>
        <p className="mb-6 text-sm text-red-700 dark:text-red-300">Sign out of your account on this device. You&apos;ll need to sign in again to continue.</p>
        <button onClick={handleSignOut} disabled={isLoading} className={buttonStyles({ variant: "danger" })}>
          {isLoading ? "Signing out..." : "Sign Out"}
        </button>
      </div>
    </div>
  );
}
