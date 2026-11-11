USE carewell_hci;

-- Add patient credentials. Existing patients remain in the database but must register
-- an email/password account before using protected appointment features.
ALTER TABLE patients
  ADD COLUMN password_hash VARCHAR(255) NULL AFTER email;

-- Email is the login identifier. MySQL permits multiple NULL values in a unique index.
ALTER TABLE patients
  ADD UNIQUE KEY unique_patient_email (email);

-- Release cancelled slots while preserving uniqueness for active appointments.
-- MySQL allows multiple NULL generated values, so cancelled appointments no longer
-- reserve a slot; confirmed/completed appointments keep active_slot = 1.
ALTER TABLE appointments
  DROP INDEX unique_slot,
  ADD COLUMN active_slot TINYINT
    GENERATED ALWAYS AS (CASE WHEN status = 'cancelled' THEN NULL ELSE 1 END) STORED,
  ADD UNIQUE KEY unique_active_doctor_slot
    (doctor_id, appointment_date, appointment_time, active_slot);
