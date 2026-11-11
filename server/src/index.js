require('dotenv').config();
const { sendAppointmentConfirmation, sendAppointmentRescheduled } = require('./email');
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const MySQLStoreFactory = require('express-mysql-session');
const bcrypt = require('bcryptjs');
const db = require('./db');

const app = express();
const PORT = Number(process.env.PORT || 5000);
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';
const SESSION_SECRET = process.env.SESSION_SECRET || 'change-this-development-secret-before-deployment';
const SLOT_TIMES = ['09:00', '10:30', '11:00', '13:00', '14:30', '15:00'];
const MySQLStore = MySQLStoreFactory(session);
const sessionStore = new MySQLStore({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'carewell_hci',
  createDatabaseTable: true
});

app.use(cors({ origin: FRONTEND_ORIGIN.split(','), credentials: true }));
app.use(express.json());
app.use(session({
  name: 'carewell.sid',
  secret: SESSION_SECRET,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 24 * 7
  }
}));

function requirePatient(req, res, next) {
  if (!req.session || !req.session.patientId) {
    return res.status(401).json({ error: 'Please log in to view or manage appointments.', code: 'AUTH_REQUIRED' });
  }
  next();
}
function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) && !Number.isNaN(Date.parse(`${value}T00:00:00`));
}
function validSlot(value) { return SLOT_TIMES.includes(String(value || '').slice(0, 5)); }

app.get('/api/health', async (req, res) => {
  try { await db.query('SELECT 1'); res.json({ status: 'ok', database: 'connected' }); }
  catch (e) { console.error('Health check failed:', e.message); res.status(503).json({ status: 'error', message: 'Database unavailable' }); }
});

// Patient authentication. Passwords are stored as bcrypt hashes; the session cookie is HttpOnly.

app.post('/api/auth/register', async (req, res) => {
    const { full_name, phone, email, password } = req.body || {};

    // Validate registration details
    if (!full_name?.trim() || !phone?.trim() || !email?.trim() || !password) {
        return res.status(400).json({
            error: 'Please complete all registration fields.'
        });
    }

    if (password.length < 8) {
        return res.status(400).json({
            error: 'Password must contain at least 8 characters.'
        });
    }

    const normalizedEmail = email.trim().toLowerCase();

    try {
        // Check whether the email is already registered
        const [existing] = await db.query(
            'SELECT id FROM patients WHERE email = ? LIMIT 1',
            [normalizedEmail]
        );

        if (existing.length) {
            return res.status(409).json({
                error: 'An account with this email already exists.'
            });
        }

        // Securely hash the password
        const passwordHash = await bcrypt.hash(password, 12);

        // Save the new patient
        const [result] = await db.query(
            `INSERT INTO patients
            (full_name, phone, email, password_hash)
            VALUES (?, ?, ?, ?)`,
            [
                full_name.trim(),
                phone.trim(),
                normalizedEmail,
                passwordHash
            ]
        );

        // Create the patient's login session
        await new Promise((resolve, reject) => {
            req.session.regenerate(err => {
                if (err) reject(err);
                else resolve();
            });
        });

        req.session.patientId = result.insertId;
        req.session.patientName = full_name.trim();

        await new Promise((resolve, reject) => {
            req.session.save(err => {
                if (err) reject(err);
                else resolve();
            });
        });

        return res.status(201).json({
            patient: {
                id: result.insertId,
                full_name: full_name.trim(),
                email: normalizedEmail
            },
            message: 'Account created successfully.'
        });

    } catch (e) {
        if (e.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                error: 'An account with this email already exists.'
            });
        }

        console.error('Registration failed:', e.message);

        return res.status(500).json({
            error: 'Unable to create your account right now.'
        });
    }
});

app.post('/api/appointments', requirePatient, async (req, res) => {
    const {
        doctor_id,
        appointment_date,
        appointment_time,
        reason,
        reminder_channel = 'sms'
    } = req.body || {};

    // Validate booking details
    if (
        !doctor_id ||
        !validDate(appointment_date) ||
        !validSlot(appointment_time)
    ) {
        return res.status(400).json({
            error: 'Choose a valid doctor, date and available time.'
        });
    }

    if (appointment_date < new Date().toISOString().slice(0, 10)) {
        return res.status(400).json({
            error: 'Appointments cannot be booked in the past.'
        });
    }

    if (!['sms', 'email', 'none'].includes(reminder_channel)) {
        return res.status(400).json({
            error: 'Invalid reminder preference.'
        });
    }

    const conn = await db.getConnection();

    let appointmentId;
    let emailDetails;
    let committed = false;

    try {
        await conn.beginTransaction();

        // Confirm that the doctor exists and lock the doctor record
        const [doctors] = await conn.query(
            'SELECT id FROM doctors WHERE id = ? FOR UPDATE',
            [doctor_id]
        );

        if (!doctors.length) {
            await conn.rollback();
            return res.status(404).json({
                error: 'Doctor not found.'
            });
        }

        // Prevent double-booking
        const [existing] = await conn.query(
            `SELECT id FROM appointments
             WHERE doctor_id = ?
             AND appointment_date = ?
             AND appointment_time = ?
             AND status = 'confirmed'
             FOR UPDATE`,
            [doctor_id, appointment_date, appointment_time]
        );

        if (existing.length) {
            await conn.rollback();
            return res.status(409).json({
                error: 'Sorry, this slot has just been booked. Please choose another time.',
                code: 'SLOT_TAKEN'
            });
        }

        // Save appointment
        const [insert] = await conn.query(
            `INSERT INTO appointments
            (doctor_id, patient_id, appointment_date, appointment_time, reason, reminder_channel)
            VALUES (?, ?, ?, ?, ?, ?)`,
            [
                doctor_id,
                req.session.patientId,
                appointment_date,
                appointment_time,
                reason || 'Routine check-up',
                reminder_channel
            ]
        );

        appointmentId = insert.insertId;

        // Retrieve patient and doctor information for the confirmation email
        const [details] = await conn.query(
            `SELECT
                p.full_name AS patient_name,
                p.email AS patient_email,
                d.name AS doctor_name,
                d.specialty,
                d.hospital
             FROM patients p
             JOIN doctors d ON d.id = ?
             WHERE p.id = ?`,
            [doctor_id, req.session.patientId]
        );

        if (details.length) {
            emailDetails = {
                to: details[0].patient_email,
                patientName: details[0].patient_name,
                doctorName: details[0].doctor_name,
                specialty: details[0].specialty,
                hospital: details[0].hospital,
                appointmentDate: appointment_date,
                appointmentTime: appointment_time,
                appointmentId
            };
        }

        // Confirm the appointment in the database
        await conn.commit();
        committed = true;

    } catch (e) {
        // Only roll back if the transaction has not been committed
        if (!committed) {
            try {
                await conn.rollback();
            } catch (rollbackError) {
                console.error('Rollback failed:', rollbackError.message);
            }
        }

        if (e.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                error: 'Sorry, this slot has just been booked. Please choose another time.',
                code: 'SLOT_TAKEN'
            });
        }

        console.error('Booking failed:', e.message);

        return res.status(500).json({
            error: 'Unable to book appointment.'
        });

    } finally {
        conn.release();
    }

    // Send confirmation email after the appointment is safely saved
    let emailSent = false;

    try {
        if (emailDetails && emailDetails.to) {
            await sendAppointmentConfirmation(emailDetails);
            emailSent = true;
            console.log(`Confirmation email sent for appointment ${appointmentId}`);
        } else {
            console.log(`No patient email available for appointment ${appointmentId}`);
        }
    } catch (emailError) {
        console.error('Confirmation email failed:', emailError.message);
    }

    return res.status(201).json({
        id: appointmentId,
        message: 'Appointment confirmed.',
        emailSent
    });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email?.trim() || !password) return res.status(400).json({ error: 'Enter your email and password.' });
  try {
    const [rows] = await db.query('SELECT id, full_name, email, password_hash FROM patients WHERE email = ? LIMIT 1', [email.trim().toLowerCase()]);
    if (!rows.length || !rows[0].password_hash || !(await bcrypt.compare(password, rows[0].password_hash))) {
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }
    req.session.regenerate(err => {
      if (err) return res.status(500).json({ error: 'Could not start your session.' });
      req.session.patientId = rows[0].id;
      req.session.patientName = rows[0].full_name;
      req.session.save(saveErr => saveErr ? res.status(500).json({ error: 'Could not save your session.' }) : res.json({ patient: { id: rows[0].id, full_name: rows[0].full_name, email: rows[0].email } }));
    });
  } catch (e) { console.error('Login failed:', e.message); res.status(500).json({ error: 'Unable to log in right now.' }); }
});

app.get('/api/auth/me', async (req, res) => {
  if (!req.session.patientId) return res.status(401).json({ error: 'Not logged in.' });
  try {
    const [rows] = await db.query('SELECT id, full_name, email, phone, date_of_birth FROM patients WHERE id = ? LIMIT 1', [req.session.patientId]);
    if (!rows.length) { req.session.destroy(() => {}); return res.status(401).json({ error: 'Session is no longer valid.' }); }
    res.json({ patient: rows[0] });
  } catch (e) { res.status(500).json({ error: 'Could not verify session.' }); }
});


// Patients can update only their own profile.
app.put('/api/auth/profile', requirePatient, async (req, res) => {
  const { full_name, phone, email, date_of_birth = null } = req.body || {};
  if (!full_name?.trim() || !phone?.trim() || !email?.trim()) {
    return res.status(400).json({ error: 'Full name, phone number and email are required.' });
  }
  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  if (date_of_birth && (!validDate(date_of_birth) || date_of_birth > new Date().toISOString().slice(0, 10))) {
    return res.status(400).json({ error: 'Enter a valid date of birth.' });
  }
  try {
    const [existing] = await db.query(
      'SELECT id FROM patients WHERE email = ? AND id <> ? LIMIT 1',
      [normalizedEmail, req.session.patientId]
    );
    if (existing.length) return res.status(409).json({ error: 'That email address is already used by another account.' });

    await db.query(
      'UPDATE patients SET full_name = ?, phone = ?, email = ?, date_of_birth = ? WHERE id = ?',
      [full_name.trim(), phone.trim(), normalizedEmail, date_of_birth || null, req.session.patientId]
    );
    req.session.patientName = full_name.trim();
    const patient = {
      id: req.session.patientId,
      full_name: full_name.trim(),
      phone: phone.trim(),
      email: normalizedEmail,
      date_of_birth: date_of_birth || null
    };
    return res.json({ message: 'Profile updated successfully.', patient });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'That email address is already used by another account.' });
    console.error('Profile update failed:', e.message);
    return res.status(500).json({ error: 'Unable to update your profile right now.' });
  }
});

// Account deletion requires the patient's current password and removes their appointment history.
app.delete('/api/auth/profile', requirePatient, async (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: 'Enter your password to confirm account deletion.' });
  const patientId = req.session.patientId;
  const conn = await db.getConnection();
  try {
    const [patients] = await conn.query(
      'SELECT password_hash FROM patients WHERE id = ? LIMIT 1',
      [patientId]
    );
    if (!patients.length || !patients[0].password_hash || !(await bcrypt.compare(password, patients[0].password_hash))) {
      return res.status(401).json({ error: 'The password you entered is incorrect.' });
    }
    await conn.beginTransaction();
    await conn.query('DELETE FROM appointments WHERE patient_id = ?', [patientId]);
    await conn.query('DELETE FROM patients WHERE id = ?', [patientId]);
    await conn.commit();

    req.session.destroy(err => {
      res.clearCookie('carewell.sid', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
      if (err) return res.status(500).json({ error: 'Account deleted, but the session could not be closed. Please log in again.' });
      return res.json({ message: 'Your account has been permanently deleted.' });
    });
  } catch (e) {
    try { await conn.rollback(); } catch (_) {}
    console.error('Account deletion failed:', e.message);
    return res.status(500).json({ error: 'Unable to delete your account right now.' });
  } finally {
    conn.release();
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(err => {
    res.clearCookie('carewell.sid', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
    if (err) return res.status(500).json({ error: 'Could not log out.' });
    res.json({ message: 'You have been logged out.' });
  });
});

// Doctor directory remains public; private appointment information and slot availability require login.
app.get('/api/doctors', async (req, res) => {
  try {
    const { q = '', specialty = 'All specialties' } = req.query;
    let sql = 'SELECT * FROM doctors WHERE 1=1', params = [];
    if (q) { sql += ' AND (name LIKE ? OR specialty LIKE ? OR hospital LIKE ?)'; params.push(...Array(3).fill(`%${q}%`)); }
    if (specialty !== 'All specialties') { sql += ' AND specialty = ?'; params.push(specialty); }
    sql += ' ORDER BY rating DESC';
    const [rows] = await db.query(sql, params); res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Could not load doctors.' }); }
});
app.get('/api/doctors/:id', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM doctors WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Doctor not found.' });
    res.json(rows[0]);
  } catch (e) { res.status(500).json({ error: 'Could not load doctor.' }); }
});

app.get('/api/doctors/:id/slots', requirePatient, async (req, res) => {
  const { date } = req.query;
  if (!validDate(date) || date < new Date().toISOString().slice(0, 10)) return res.status(400).json({ error: 'Choose a valid future date.' });
  try {
    const [doctors] = await db.query('SELECT id FROM doctors WHERE id = ?', [req.params.id]);
    if (!doctors.length) return res.status(404).json({ error: 'Doctor not found.' });
    const [booked] = await db.query("SELECT TIME_FORMAT(appointment_time, '%H:%i') AS time FROM appointments WHERE doctor_id = ? AND appointment_date = ? AND status = 'confirmed'", [req.params.id, date]);
    const taken = new Set(booked.map(row => row.time));
    const today = new Date().toISOString().slice(0, 10);
    const now = new Date();
    const slots = SLOT_TIMES.map(time => {
      const [hour, minute] = time.split(':').map(Number);
      const isPast = date === today && (hour < now.getHours() || (hour === now.getHours() && minute <= now.getMinutes()));
      return { time, available: !taken.has(time) && !isPast, reason: taken.has(time) ? 'Booked' : (isPast ? 'Time passed' : null) };
    });
    res.json({ date, slots });
  } catch (e) { res.status(500).json({ error: 'Could not load appointment slots.' }); }
});

app.get('/api/appointments', requirePatient, async (req, res) => {
  try {
    const [rows] = await db.query(`SELECT a.*, d.name doctor_name, d.specialty, d.hospital, d.location
      FROM appointments a JOIN doctors d ON a.doctor_id = d.id
      WHERE a.patient_id = ? ORDER BY a.appointment_date DESC, a.appointment_time DESC`, [req.session.patientId]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Could not load appointments.' }); }
});

app.post('/api/appointments', requirePatient, async (req, res) => {
  const { doctor_id, appointment_date, appointment_time, reason, reminder_channel = 'sms' } = req.body || {};
  if (!doctor_id || !validDate(appointment_date) || !validSlot(appointment_time)) return res.status(400).json({ error: 'Choose a valid doctor, date and available time.' });
  if (appointment_date < new Date().toISOString().slice(0, 10)) return res.status(400).json({ error: 'Appointments cannot be booked in the past.' });
  if (!['sms', 'email', 'none'].includes(reminder_channel)) return res.status(400).json({ error: 'Invalid reminder preference.' });
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [doctors] = await conn.query('SELECT id FROM doctors WHERE id = ? FOR UPDATE', [doctor_id]);
    if (!doctors.length) { await conn.rollback(); return res.status(404).json({ error: 'Doctor not found.' }); }
    const [existing] = await conn.query("SELECT id FROM appointments WHERE doctor_id = ? AND appointment_date = ? AND appointment_time = ? AND status = 'confirmed' FOR UPDATE", [doctor_id, appointment_date, appointment_time]);
    if (existing.length) { await conn.rollback(); return res.status(409).json({ error: 'Sorry, this slot has just been booked. Please choose another time.', code: 'SLOT_TAKEN' }); }
    const [insert] = await conn.query(`INSERT INTO appointments (doctor_id, patient_id, appointment_date, appointment_time, reason, reminder_channel)
      VALUES (?, ?, ?, ?, ?, ?)`, [doctor_id, req.session.patientId, appointment_date, appointment_time, reason || 'Routine check-up', reminder_channel]);
    await conn.commit();
    res.status(201).json({ id: insert.insertId, message: 'Appointment confirmed.' });
  } catch (e) {
    await conn.rollback();
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Sorry, this slot has just been booked. Please choose another time.', code: 'SLOT_TAKEN' });
    console.error('Booking failed:', e.message); res.status(500).json({ error: 'Unable to book appointment.' });
  } finally { conn.release(); }
});


app.patch('/api/appointments/:id', requirePatient, async (req, res) => {
  const { appointment_date, appointment_time, status } = req.body || {};
  const conn = await db.getConnection();
  let emailDetails = null;
  let wasRescheduled = false;

  try {
    await conn.beginTransaction();
    const [rows] = await conn.query(
      "SELECT *, DATE_FORMAT(appointment_date, '%Y-%m-%d') AS appointment_date_text, TIME_FORMAT(appointment_time, '%H:%i') AS appointment_time_text FROM appointments WHERE id = ? AND patient_id = ? FOR UPDATE",
      [req.params.id, req.session.patientId]
    );
    if (!rows.length) {
      await conn.rollback();
      return res.status(404).json({ error: 'Appointment not found.' });
    }

    const current = rows[0];
    if (status === 'cancelled') {
      if (current.status !== 'confirmed') {
        await conn.rollback();
        return res.status(409).json({ error: 'Only confirmed appointments can be cancelled.' });
      }
      await conn.query("UPDATE appointments SET status = 'cancelled' WHERE id = ?", [req.params.id]);
    } else if (appointment_date && appointment_time) {
      if (current.status !== 'confirmed') {
        await conn.rollback();
        return res.status(409).json({ error: 'Only confirmed appointments can be rescheduled.' });
      }
      if (appointment_date === current.appointment_date_text && String(appointment_time).slice(0, 5) === current.appointment_time_text) {
        await conn.rollback();
        return res.status(400).json({ error: 'Choose a different date or time to reschedule.' });
      }
      if (!validDate(appointment_date) || !validSlot(appointment_time) || appointment_date < new Date().toISOString().slice(0, 10)) {
        await conn.rollback();
        return res.status(400).json({ error: 'Choose a valid future date and time.' });
      }
      const [conflict] = await conn.query(
        "SELECT id FROM appointments WHERE doctor_id = ? AND appointment_date = ? AND appointment_time = ? AND status = 'confirmed' AND id <> ? FOR UPDATE",
        [current.doctor_id, appointment_date, appointment_time, req.params.id]
      );
      if (conflict.length) {
        await conn.rollback();
        return res.status(409).json({ error: 'That time is no longer available. Please choose another slot.' });
      }

      await conn.query(
        'UPDATE appointments SET appointment_date = ?, appointment_time = ? WHERE id = ?',
        [appointment_date, appointment_time, req.params.id]
      );

      const [details] = await conn.query(
        `SELECT p.full_name AS patient_name, p.email AS patient_email,
                d.name AS doctor_name, d.specialty, d.hospital
         FROM patients p
         JOIN appointments a ON a.patient_id = p.id
         JOIN doctors d ON d.id = a.doctor_id
         WHERE a.id = ? AND p.id = ?`,
        [req.params.id, req.session.patientId]
      );
      if (details.length && details[0].patient_email) {
        emailDetails = {
          to: details[0].patient_email,
          patientName: details[0].patient_name,
          doctorName: details[0].doctor_name,
          specialty: details[0].specialty,
          hospital: details[0].hospital,
          appointmentDate: appointment_date,
          appointmentTime: appointment_time,
          previousDate: current.appointment_date_text,
          previousTime: current.appointment_time_text,
          appointmentId: Number(req.params.id)
        };
      }
      wasRescheduled = true;
    } else {
      await conn.rollback();
      return res.status(400).json({ error: 'No valid appointment change was supplied.' });
    }

    await conn.commit();
  } catch (e) {
    try { await conn.rollback(); } catch (_) {}
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'That time is no longer available.' });
    console.error('Appointment update failed:', e.message);
    return res.status(500).json({ error: 'Could not update appointment.' });
  } finally {
    conn.release();
  }

  let emailSent = false;
  if (wasRescheduled && emailDetails) {
    try {
      await sendAppointmentRescheduled(emailDetails);
      emailSent = true;
      console.log(`Reschedule email sent for appointment ${req.params.id}`);
    } catch (emailError) {
      console.error('Reschedule email failed:', emailError.message);
    }
  }

  return res.json({
    message: wasRescheduled
      ? (emailSent ? 'Appointment rescheduled. A confirmation email has been sent.' : 'Appointment rescheduled, but the confirmation email could not be sent.')
      : 'Appointment cancelled.',
    emailSent
  });
});

app.get('/api/reminders', requirePatient, async (req, res) => {
  try {
    const [rows] = await db.query(`SELECT a.id, a.appointment_date, a.appointment_time, a.reminder_channel, a.status, d.name doctor_name
      FROM appointments a JOIN doctors d ON a.doctor_id = d.id
      WHERE a.patient_id = ? AND a.status = 'confirmed' AND a.appointment_date >= CURDATE()
      ORDER BY a.appointment_date, a.appointment_time`, [req.session.patientId]);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: 'Could not load reminders.' }); }
});

app.listen(PORT, () => console.log(`Carewell API running on http://localhost:${PORT}`));
