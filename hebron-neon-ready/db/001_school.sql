-- HEBRON SCHOOL · Production foundation v1. Run in the intended Neon branch.
-- Every row is assigned to a school. All dates are DATE or TIMESTAMPTZ; money is integer paise.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS schools (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, timezone text NOT NULL DEFAULT 'Asia/Kolkata',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS academic_years (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL REFERENCES schools(id),
 label text NOT NULL, starts_on date, ends_on date, active boolean NOT NULL DEFAULT false,
 UNIQUE(school_id,label)
);
CREATE TABLE IF NOT EXISTS classes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL REFERENCES schools(id),
 academic_year_id uuid REFERENCES academic_years(id), name text NOT NULL,
 class_teacher_id uuid, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id,academic_year_id,name)
);
CREATE TABLE IF NOT EXISTS staff_users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL REFERENCES schools(id),
 email text NOT NULL, name text NOT NULL, password_hash text NOT NULL,
 roles text[] NOT NULL DEFAULT ARRAY['teacher']::text[], status text NOT NULL DEFAULT 'invited'
   CHECK (status IN ('invited','active','disabled')),
 must_change_password boolean NOT NULL DEFAULT true, profile_complete boolean NOT NULL DEFAULT false,
 phone text, qualification text, years_experience integer, address text, subjects text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id,email)
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_staff_email_global ON staff_users(lower(email));
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='classes_class_teacher_id_fkey') THEN
    ALTER TABLE classes ADD CONSTRAINT classes_class_teacher_id_fkey FOREIGN KEY(class_teacher_id) REFERENCES staff_users(id);
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS staff_class_assignments (
 staff_id uuid NOT NULL REFERENCES staff_users(id), class_id uuid NOT NULL REFERENCES classes(id),
 PRIMARY KEY(staff_id,class_id)
);
CREATE TABLE IF NOT EXISTS sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), staff_id uuid NOT NULL REFERENCES staff_users(id),
 token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 revoked_at timestamptz
);
CREATE TABLE IF NOT EXISTS students (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL REFERENCES schools(id),
 class_id uuid NOT NULL REFERENCES classes(id), admission_number text NOT NULL, name text NOT NULL,
 guardian_name text, guardian_phone text, preferred_language text NOT NULL DEFAULT 'en' CHECK(preferred_language IN ('en','ml')),
 whatsapp_consent boolean NOT NULL DEFAULT false, status text NOT NULL DEFAULT 'active',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(school_id,admission_number)
);
CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_id);
CREATE TABLE IF NOT EXISTS student_imports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL REFERENCES schools(id),
 created_by uuid NOT NULL REFERENCES staff_users(id), created_at timestamptz NOT NULL DEFAULT now(),
 total_rows integer NOT NULL, accepted_rows integer NOT NULL, rejected_rows integer NOT NULL,
 report jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE TABLE IF NOT EXISTS attendance_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_id uuid NOT NULL REFERENCES students(id),
 on_date date NOT NULL, status text NOT NULL CHECK (status IN ('present','absent','late','half')),
 marked_by uuid REFERENCES staff_users(id), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(student_id,on_date)
);
CREATE TABLE IF NOT EXISTS student_observations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_id uuid NOT NULL REFERENCES students(id),
 created_by uuid NOT NULL REFERENCES staff_users(id), on_date date NOT NULL,
 kind text NOT NULL CHECK(kind IN ('homework','uniform','books','late','punctuality','cleanliness','outcome')),
 outcome text NOT NULL CHECK(outcome IN ('good','needs_improvement','not_observed','missing','incomplete','late')),
 comments text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS teacher_escalations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_id uuid NOT NULL REFERENCES students(id),
 teacher_id uuid NOT NULL REFERENCES staff_users(id), title text NOT NULL, details text,
 urgency text NOT NULL DEFAULT 'normal' CHECK(urgency IN ('normal','high')),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','resolved')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS fee_charges (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_id uuid NOT NULL REFERENCES students(id),
 category text NOT NULL, amount_paise bigint NOT NULL CHECK(amount_paise >= 0), due_on date,
 created_at timestamptz NOT NULL DEFAULT now(), created_by uuid REFERENCES staff_users(id)
);
CREATE TABLE IF NOT EXISTS fee_discounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_id uuid NOT NULL REFERENCES students(id),
 reason text NOT NULL, amount_paise bigint NOT NULL CHECK(amount_paise > 0),
 approved_by uuid NOT NULL REFERENCES staff_users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS fee_payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_id uuid NOT NULL REFERENCES students(id),
 amount_paise bigint NOT NULL CHECK(amount_paise > 0), payment_method text NOT NULL
   CHECK(payment_method IN ('Cash','UPI','Bank transfer','Cheque','Other')),
 reference text, paid_on date NOT NULL, note text, recorded_by uuid NOT NULL REFERENCES staff_users(id),
 status text NOT NULL DEFAULT 'posted' CHECK(status IN ('posted','reversed')),
 idempotency_key text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(idempotency_key)
);
CREATE TABLE IF NOT EXISTS fee_payment_reversals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), payment_id uuid NOT NULL UNIQUE REFERENCES fee_payments(id),
 reason text NOT NULL, reversed_by uuid NOT NULL REFERENCES staff_users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS parent_message_queue (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_id uuid NOT NULL REFERENCES students(id),
 message_type text NOT NULL, rendered_message text NOT NULL, status text NOT NULL DEFAULT 'draft',
 recipient_snapshot text NOT NULL, queued_by uuid REFERENCES staff_users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), school_id uuid NOT NULL REFERENCES schools(id),
 actor_id uuid REFERENCES staff_users(id), entity_type text NOT NULL, entity_id uuid,
 action text NOT NULL, details jsonb NOT NULL DEFAULT '{}'::jsonb, occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_school_time ON audit_events(school_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance_entries(on_date,status);
CREATE INDEX IF NOT EXISTS idx_payments_student_date ON fee_payments(student_id,paid_on DESC);

-- Do not add demo user passwords or real student data to this migration.
-- After migration, use: npm run db:migrate; npm run db:bootstrap (protected and local only).
