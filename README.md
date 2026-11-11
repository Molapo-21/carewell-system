# Carewell HCI Appointment System

React + Vite frontend, Express API, and MySQL database.

## New in v1.1

- Patient registration and login using bcrypt password hashes.
- Server-side sessions stored in MySQL; the session cookie is HttpOnly.
- Appointment list, slot availability, booking, rescheduling and cancellation require an authenticated patient.
- Appointment queries are scoped to the signed-in patient's ID.
- Live slot availability is loaded from MySQL. Unavailable and elapsed slots are disabled in the interface.
- Booking is checked again inside a transaction. A database unique key is the final concurrency safeguard, so simultaneous requests cannot reserve the same active doctor/date/time slot.
- Cancelled appointments release their slot through a generated `active_slot` column.

## Setup on Windows

1. Install Node.js LTS and MySQL 8.
2. In the project root, run `npm install`.
3. Copy `.env.example` to `.env` and enter your local MySQL credentials. Set a long random `SESSION_SECRET`.
4. For a new database, run `database/schema.sql` in MySQL Workbench.
5. If upgrading the previous Carewell database, first check for duplicate non-empty patient emails:

   ```sql
   USE carewell_hci;
   SELECT LOWER(email), COUNT(*) AS total
   FROM patients WHERE email IS NOT NULL AND email <> ''
   GROUP BY LOWER(email) HAVING COUNT(*) > 1;
   ```

   Resolve any duplicates before running `database/migrations/001_patient_auth_and_slots.sql`. The migration adds the password hash, unique email, and active-slot uniqueness rule. Existing legacy patient records with an email but no password hash can claim that record by registering with the same email; registration adds the password hash to that patient row. An email already associated with an account cannot be registered again.
6. Start the project with `npm run dev`.
7. Open the Vite URL shown in the terminal (usually `http://localhost:5173` or `5174`). The API is `http://localhost:5000`.

## Patient workflow

1. Browse the public doctor directory.
2. Select a doctor. Log in or create an account to view live appointment slots.
3. Select a date and an available slot.
4. Confirm the reason and reminder preference. Patient identity comes from the authenticated session, not from client-supplied patient IDs or names.
5. View only your own appointments under **My appointments**.
6. Log out to destroy the server session.

## API endpoints

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me`
- `POST /api/auth/logout`
- `GET /api/doctors`
- `GET /api/doctors/:id`
- `GET /api/doctors/:id/slots?date=YYYY-MM-DD` (login required)
- `GET /api/appointments` (login required; current patient only)
- `POST /api/appointments` (login required)
- `PATCH /api/appointments/:id` (login required; current patient only)

## Security notes

This is a local academic/demo application. Before public deployment, use HTTPS, set `NODE_ENV=production`, use a strong unique `SESSION_SECRET`, restrict CORS to the exact deployed frontend origin, and review rate limiting, password reset, email verification and account recovery. The app does not send real SMS/email reminders; it stores the selected reminder preference.


## Patient profile and rescheduling updates

- Signed-in patients can open **Profile** from the top navigation at `/profile`.
- The profile page displays full name, phone number, email address and date of birth.
- Patients can edit those details. Email addresses must be unique.
- Patients can permanently delete their account after confirming their password. This also deletes appointment records linked to that account.
- When an appointment is successfully rescheduled, Carewell sends an email to the patient's registered email address with the previous and updated appointment details. The existing SMTP settings in `.env` are used.
