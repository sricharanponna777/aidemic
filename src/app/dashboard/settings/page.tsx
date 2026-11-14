"use client";

import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { createClient } from "@/lib/supabase-client";
import { ThemeMode, hasChosenTheme, useTheme } from "@/hooks/useTheme";
import { useRouter } from "next/navigation";
import { BookOpen, Compass, ListChecks, LogOut, Moon, Radar, Settings as SettingsIcon, Sun, Target } from "lucide-react";
import { useEffect, useState } from "react";
import { buttonStyles } from "@/components/ui/button";
import { Alert, fieldStyles } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/feedback";
import { Chip, MonoLabel, Panel, PanelHeading, Workspace, WorkspaceBody } from "@/components/ui/telemetry";
import {
  DAILY_CARD_TARGET_RANGE,
  DEFAULT_STUDY_GOALS,
  WEEKLY_MINUTE_TARGET_RANGE,
  fetchStudyGoals,
  saveStudyGoals,
} from "@/lib/studyGoals";

function SettingsCard({
  title,
  description,
  children,
  className = "",
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`border-b border-subtle p-5 last:border-b-0 ${className}`.trim()}>
      <div className="mb-4">
        <PanelHeading>{title}</PanelHeading>
        {description && <p className="mt-1 text-[13px] text-content-subtle">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export default function Settings() {
  const { session, profile: loadedProfile } = useAuth();
  const router = useRouter();
  const supabase = createClient();
  const [isLoading, setIsLoading] = useState(false);
  const [isThemeSaving, setIsThemeSaving] = useState(false);
  const { theme, setTheme } = useTheme();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [isProfileSaving, setIsProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileSaved, setProfileSaved] = useState(false);
  const [loadedProfileId, setLoadedProfileId] = useState<string | null>(null);

  const [isChecklistRestoring, setIsChecklistRestoring] = useState(false);
  const [checklistRestored, setChecklistRestored] = useState(false);

  const [dailyTarget, setDailyTarget] = useState(DEFAULT_STUDY_GOALS.daily_card_target);
  const [weeklyTarget, setWeeklyTarget] = useState(DEFAULT_STUDY_GOALS.weekly_minute_target);
  const [isGoalsSaving, setIsGoalsSaving] = useState(false);
  const [goalsError, setGoalsError] = useState("");
  const [goalsSaved, setGoalsSaved] = useState(false);

  // The saved profile theme only seeds a device that has never picked one.
  // Applying it unconditionally undid every choice made from the header
  // toggle, so opening Settings snapped the app back to the column default.
  useEffect(() => {
    if (hasChosenTheme()) return;
    if (loadedProfile?.theme === "light" || loadedProfile?.theme === "dark") {
      setTheme(loadedProfile.theme);
    }
  }, [loadedProfile?.theme, setTheme]);

  useEffect(() => {
    const userId = session?.user?.id;
    if (!userId) return;
    let cancelled = false;
    void fetchStudyGoals(supabase, userId).then((goals) => {
      if (cancelled) return;
      setDailyTarget(goals.daily_card_target);
      setWeeklyTarget(goals.weekly_minute_target);
    });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, supabase]);

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

  const handleGoalsSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user.id) return;
    setIsGoalsSaving(true);
    setGoalsError("");
    setGoalsSaved(false);
    const { error } = await saveStudyGoals(supabase, session.user.id, {
      daily_card_target: dailyTarget,
      weekly_minute_target: weeklyTarget,
    });
    if (error) setGoalsError(error);
    else setGoalsSaved(true);
    setIsGoalsSaving(false);
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

  // Clearing the dismissal is all that is needed: the checklist hides itself
  // again the moment every step is actually done.
  const handleRestoreChecklist = async () => {
    if (!session?.user.id) return;
    setIsChecklistRestoring(true);
    const { error } = await supabase
      .from("user_profiles")
      .update({ onboarding_checklist_dismissed_at: null })
      .eq("id", session.user.id);
    setIsChecklistRestoring(false);
    if (error) {
      console.error("Failed to restore the get-started checklist:", error.message);
      return;
    }
    setChecklistRestored(true);
  };

  // Requires a loaded profile: the `!==` checks alone read a still-null profile
  // as a student, flashing student-only cards at teachers and parents.
  const isStudent = !!loadedProfile && loadedProfile.role !== "teacher" && loadedProfile.role !== "parent";

  const reportColumn = (
    <>
      <PanelHeading icon={Radar}>Account</PanelHeading>
      <Panel>
        <MonoLabel>Signed in as</MonoLabel>
        <p className="mt-1 truncate text-sm font-semibold text-content">{session?.user.email}</p>
        {loadedProfile?.role ? (
          <Chip className="mt-2 capitalize">{loadedProfile.role}</Chip>
        ) : null}
      </Panel>

      {isStudent && (
        <Panel>
          <PanelHeading icon={BookOpen} as="h3">
            Subjects
          </PanelHeading>
          <p className="mt-1 text-[13px] text-content-subtle">Manage saved qualifications from the main Subjects page.</p>
          <Link href="/dashboard/subjects" className={buttonStyles({ variant: "secondary", size: "sm", className: "mt-3 w-full justify-center" })}>
            Subjects
          </Link>
        </Panel>
      )}

      <section className="rounded-xl border border-danger/30 bg-danger-muted p-4">
        <PanelHeading icon={LogOut} as="h3">
          Sign out
        </PanelHeading>
        <p className="mt-1 text-[13px] text-content-muted">
          Sign out of your account on this device. You&apos;ll need to sign in again to continue.
        </p>
        <button
          onClick={handleSignOut}
          disabled={isLoading}
          className={buttonStyles({ variant: "danger", size: "sm", className: "mt-3 w-full justify-center" })}
        >
          {isLoading ? "Signing out…" : "Sign out"}
        </button>
      </section>
    </>
  );

  return (
    <Workspace>
      <PageHeader
        className="border-b border-subtle"
        icon={SettingsIcon}
        eyebrow="Configuration / Settings"
        title="Settings"
        description="Manage your account and preferences."
        actions={<Chip>● {theme === "dark" ? "Dark" : "Light"} mode</Chip>}
      />

      <WorkspaceBody aside={reportColumn}>

      <SettingsCard title="Profile" description="Update your name and username.">
        <form onSubmit={handleProfileSave}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="settings-first-name" className="mb-1 block">
                <MonoLabel>First name</MonoLabel>
              </label>
              <input
                id="settings-first-name"
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className={fieldStyles()}
              />
            </div>
            <div>
              <label htmlFor="settings-last-name" className="mb-1 block">
                <MonoLabel>Last name</MonoLabel>
              </label>
              <input
                id="settings-last-name"
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className={fieldStyles()}
              />
            </div>
          <div className="sm:col-span-2">
              <label htmlFor="settings-username" className="mb-1 block">
                <MonoLabel>Username</MonoLabel>
              </label>
              <input
                id="settings-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                pattern="[a-zA-Z0-9_]{3,20}"
                title="3-20 characters: letters, numbers, and underscores only"
                className={fieldStyles()}
              />
            </div>
          </div>
          {profileError && <Alert className="mt-3">{profileError}</Alert>}
        <div className="mt-4 flex items-center gap-3">
          <button type="submit" disabled={isProfileSaving} className={buttonStyles({ variant: "primary" })}>
              {isProfileSaving ? "Saving…" : "Save changes"}
            </button>
            {profileSaved && !isProfileSaving && (
            <span className="text-body text-content-subtle">Saved.</span>
            )}
          </div>
        </form>
      </SettingsCard>

      {isStudent && (
        <SettingsCard
          title="Study goals"
          description="Your dashboard tracks progress against these targets."
        >
          <form onSubmit={handleGoalsSave}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="daily-card-target" className="mb-1 block">
                  <MonoLabel className="flex items-center gap-1.5">
                    <Target className="h-3.5 w-3.5" />
                    Daily card target
                  </MonoLabel>
                </label>
                <input
                  id="daily-card-target"
                  type="number"
                  inputMode="numeric"
                  min={DAILY_CARD_TARGET_RANGE.min}
                  max={DAILY_CARD_TARGET_RANGE.max}
                  value={dailyTarget}
                  onChange={(e) => setDailyTarget(Number(e.target.value))}
                  className={fieldStyles()}
                />
                <p className="mt-1 text-caption text-content-subtle">
                  Cards to review each day ({DAILY_CARD_TARGET_RANGE.min}–{DAILY_CARD_TARGET_RANGE.max}).
                </p>
              </div>
              <div>
                <label htmlFor="weekly-minute-target" className="mb-1 block">
                <MonoLabel>Weekly study minutes</MonoLabel>
              </label>
                <input
                  id="weekly-minute-target"
                  type="number"
                  inputMode="numeric"
                  min={WEEKLY_MINUTE_TARGET_RANGE.min}
                  max={WEEKLY_MINUTE_TARGET_RANGE.max}
                  value={weeklyTarget}
                  onChange={(e) => setWeeklyTarget(Number(e.target.value))}
                  className={fieldStyles()}
                />
                <p className="mt-1 text-caption text-content-subtle">
                  Roughly {Math.round(weeklyTarget / 7)} minutes a day.
                </p>
              </div>
            </div>
            {goalsError && <Alert className="mt-3">{goalsError}</Alert>}
            <div className="mt-4 flex items-center gap-3">
              <button type="submit" disabled={isGoalsSaving} className={buttonStyles({ variant: "primary" })}>
                {isGoalsSaving ? "Saving…" : "Save goals"}
              </button>
              {goalsSaved && !isGoalsSaving && (
                <span className="text-body text-content-subtle">Saved.</span>
              )}
            </div>
          </form>
        </SettingsCard>
      )}


      <SettingsCard title="Appearance" description="Pick the mode that feels best for your reviews.">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {(
            [
              { mode: "light" as const, icon: Sun, label: "Light mode", hint: "Higher brightness with crisp contrast." },
              { mode: "dark" as const, icon: Moon, label: "Dark mode", hint: "Lower glare for long, late-night sessions." },
            ]
          ).map(({ mode, icon: Icon, label, hint }) => (
            <button
              key={mode}
              type="button"
              onClick={() => handleThemeChange(mode)}
              aria-pressed={theme === mode}
            className={buttonStyles({
                variant: "plain",
                size: "none",
                className: `flex-col items-start rounded-field border p-4 text-left transition-colors ${
                  theme === mode
                    ? "border-accent bg-accent-muted"
                    : "border-subtle bg-surface-sunken hover:border-strong"
                }`,
              })}
            >
            <span className="flex items-center gap-2 font-semibold text-content">
              <Icon className={`h-4 w-4 ${mode === "light" ? "text-warning" : "text-accent"}`} />
                {label}
              </span>
              <p className="mt-1 text-caption text-content-subtle">{hint}</p>
            </button>
          ))}
        </div>
        <p className="mt-3 text-caption text-content-subtle">
          {isThemeSaving ? "Saving preference…" : "Preference is saved to your profile."}
        </p>
      </SettingsCard>

      <SettingsCard
        title="Getting started"
        description="Take the welcome tour again, or bring back the checklist on your dashboard."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Link
            href="/onboarding/welcome"
            className={buttonStyles({
              variant: "plain",
              size: "none",
              className:
                "flex-col items-start rounded-field border border-subtle bg-surface-sunken p-4 text-left transition-colors hover:border-strong",
            })}
          >
            <span className="flex items-center gap-2 font-semibold text-content">
              <Compass className="h-4 w-4 text-accent" />
              Replay the welcome tour
            </span>
            <p className="mt-1 text-caption text-content-subtle">
              A five-minute walk through everything AIDemic can do for you.
            </p>
          </Link>

          {loadedProfile?.role !== "parent" && (
            <button
              type="button"
              onClick={handleRestoreChecklist}
              disabled={isChecklistRestoring}
              className={buttonStyles({
                variant: "plain",
                size: "none",
                className:
                  "flex-col items-start rounded-field border border-subtle bg-surface-sunken p-4 text-left transition-colors hover:border-strong",
              })}
            >
              <span className="flex items-center gap-2 font-semibold text-content">
                <ListChecks className="h-4 w-4 text-accent" />
                {checklistRestored ? "Checklist restored" : "Show the get-started checklist"}
              </span>
              <p className="mt-1 text-caption text-content-subtle">
                {checklistRestored
                  ? "It is back on your dashboard, and hides itself once every step is done."
                  : "Bring back the setup steps you dismissed. It disappears again once they are all done."}
              </p>
            </button>
          )}
        </div>
      </SettingsCard>

      </WorkspaceBody>
    </Workspace>
  );
}
