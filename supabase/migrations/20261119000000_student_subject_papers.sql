-- Exam dates per paper, not per subject.
--
-- A GCSE subject is sat as two or three papers on different days, each in a morning or
-- an afternoon session, so one student_subjects.exam_date could only ever hold one of
-- them. The planner now counts down to each paper and schedules toward the next one.
--
-- student_subjects.exam_date is backfilled into paper 1 and then left in place, unused:
-- dropping it would break the planner query of any deployment still running the old
-- client until the new one is live. Drop it in a later migration.
--
-- The student's own predicted grade goes in student_subjects.current_grade, which has
-- existed since 20260702190000 and was never written.

create table if not exists public.student_subject_papers (
  id uuid primary key default gen_random_uuid(),
  student_subject_id uuid not null references public.student_subjects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  paper_number smallint not null check (paper_number between 1 and 9),
  exam_date date,
  session text check (session in ('morning', 'afternoon')),
  created_at timestamptz not null default now(),
  unique (student_subject_id, paper_number)
);

create index if not exists student_subject_papers_user_idx
  on public.student_subject_papers (user_id);

alter table public.student_subject_papers enable row level security;

drop policy if exists "Users can view their own subject papers" on public.student_subject_papers;
create policy "Users can view their own subject papers"
  on public.student_subject_papers for select
  using (auth.uid() = user_id);

-- user_id alone is not enough on write: it must also own the subject the paper hangs
-- off, or a student could attach rows to someone else's student_subjects id.
drop policy if exists "Users can create their own subject papers" on public.student_subject_papers;
create policy "Users can create their own subject papers"
  on public.student_subject_papers for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.student_subjects s
      where s.id = student_subject_id and s.user_id = auth.uid()
    )
  );

drop policy if exists "Users can update their own subject papers" on public.student_subject_papers;
create policy "Users can update their own subject papers"
  on public.student_subject_papers for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.student_subjects s
      where s.id = student_subject_id and s.user_id = auth.uid()
    )
  );

drop policy if exists "Users can delete their own subject papers" on public.student_subject_papers;
create policy "Users can delete their own subject papers"
  on public.student_subject_papers for delete
  using (auth.uid() = user_id);

drop policy if exists "Parents can view linked students subject papers" on public.student_subject_papers;
create policy "Parents can view linked students subject papers"
  on public.student_subject_papers for select
  using (public.is_parent_of_student(user_id));

insert into public.student_subject_papers (student_subject_id, user_id, paper_number, exam_date)
select id, user_id, 1, exam_date
from public.student_subjects
where exam_date is not null
on conflict (student_subject_id, paper_number) do nothing;
