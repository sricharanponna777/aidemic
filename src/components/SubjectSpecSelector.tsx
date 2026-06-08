'use client';

import Link from 'next/link';
import { Settings } from 'lucide-react';
import { SearchSelect } from '@/components/SearchSelect';
import { buttonStyles } from '@/components/ui/button';
import {
  getSavedSpecLabel,
  type UserSubject,
} from '@/lib/ai/subjectConfig';

type SubjectSpecSelectorProps = {
  subjects: UserSubject[];
  isLoading?: boolean;
  selectedSubjectId: string;
  onSubjectChange: (subjectId: string) => void;
};

export function getSelectedSpecLabel(subject: UserSubject | null, creationOption = '') {
  return getSavedSpecLabel(subject, creationOption);
}

export function SubjectSpecSelector({
  subjects,
  isLoading = false,
  selectedSubjectId,
  onSubjectChange,
}: SubjectSpecSelectorProps) {
  const formatQualification = (subject: UserSubject) => {
    return getSavedSpecLabel(subject) || 'Qualification not set';
  };

  return (
    <div>
      {isLoading ? (
        <div className="h-10 animate-pulse rounded-lg bg-slate-100 dark:bg-white/8" />
      ) : subjects.length === 0 ? (
        <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          Add at least one subject on the Subjects page before using AI generation.
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
          <SearchSelect
            label="Qualification"
            value={selectedSubjectId}
            onChange={onSubjectChange}
            options={subjects.map((subject) => ({
              value: subject.id,
              label: formatQualification(subject),
            }))}
            placeholder="Search qualifications..."
            className="block text-sm font-medium text-slate-700 dark:text-slate-300"
            inputClassName="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal outline-none focus:border-indigo-400 dark:border-slate-600 dark:bg-[#0A0F1E] dark:text-slate-100"
          />
          <Link
            href="/dashboard/subjects"
            className={buttonStyles({ variant: 'secondary', size: 'sm', className: 'h-10' })}
          >
            <Settings className="h-3.5 w-3.5" />
            Manage
          </Link>
        </div>
      )}
    </div>
  );
}
