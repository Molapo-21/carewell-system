import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Search, MapPin, Star, Clock, CalendarDays, ChevronRight, ArrowLeft, Check, Bell, Heart, X, Stethoscope, LogOut, LockKeyhole, UserRound } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
const request = async (path, options = {}) => {
  const response = await fetch(`${API}${path}`, {
    credentials: 'include',
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) { const error = new Error(data.error || 'The request could not be completed.'); error.status = response.status; error.code = data.code; throw error; }
  return data;
};
const money = n => `M${Number(n || 0).toFixed(0)}`;
const fmtDate = d => new Date(`${d}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

function useData(url) {
  const [data, setData] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const reload = () => { setLoading(true); request(url).then(setData).catch(e => setError(e.message)).finally(() => setLoading(false)); };
  useEffect(reload, [url]);
  return { data, loading, error, reload };
}
function Avatar({ initials }) { return <div className="avatar">{initials || 'DR'}</div>; }

function Header({ patient, onLogout }) {
  const loc = useLocation();
  return <header className="topbar"><Link to="/" className="brand"><span className="brandmark"><Heart size={19}/></span><span>Carewell<small>HEALTHCARE, MADE SIMPLE</small></span></Link>
    <nav><Link className={loc.pathname === '/' ? 'active' : ''} to="/">Home</Link><Link to="/appointments" className={loc.pathname === '/appointments' ? 'active' : ''}>My appointments</Link><Link className={loc.pathname === '/profile' ? 'active' : ''} to={patient ? '/profile' : '/login'}><UserRound size={14}/> Profile</Link></nav>
    <div className="header-right">{patient ? <><span className="secure"><span/> {patient.full_name}</span><button className="btn-outline" onClick={onLogout}><LogOut size={14}/> Log out</button></> : <><Link className="btn-outline" to="/login">Log in</Link><Link className="btn-primary" to="/register">Create account</Link></>}</div>
  </header>;
}
function Shell({ children, patient, onLogout }) { return <><Header patient={patient} onLogout={onLogout}/>{children}<footer><span>© 2026 Carewell · Patient portal</span><span>Need help? <a href="mailto:support@carewell.local">Contact reception</a></span></footer></>; }

function AuthPage({ mode, onAuthenticated, redirectTo }) {
  const nav = useNavigate(), loc = useLocation();
  const [form, setForm] = useState({ full_name: '', phone: '', email: '', password: '' });
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const isRegister = mode === 'register';
  const next = redirectTo || loc.state?.from || '/appointments';
  const change = e => setForm({ ...form, [e.target.name]: e.target.value });
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const data = await request(`/auth/${isRegister ? 'register' : 'login'}`, { method: 'POST', body: JSON.stringify(form) });
      onAuthenticated(data.patient); nav(next, { replace: true });
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <Shell><main className="content auth-content"><section className="auth-card"><div className="auth-icon"><LockKeyhole size={23}/></div><span className="eyebrow muted">PATIENT PORTAL</span><h1>{isRegister ? 'Create your account' : 'Welcome back'}</h1><p>{isRegister ? 'Register to view appointment availability and book your care.' : 'Log in to view your appointments and reserve a time slot.'}</p>
    <form className="patient-form auth-form" onSubmit={submit}>{isRegister && <><label>Full name *<input required name="full_name" autoComplete="name" value={form.full_name} onChange={change} placeholder="Your full name"/></label><label>Phone number *<input required name="phone" autoComplete="tel" value={form.phone} onChange={change} placeholder="+266 5XXX XXXX"/></label></>}
      <label>Email address *<input required type="email" name="email" autoComplete="email" value={form.email} onChange={change} placeholder="you@example.com"/></label>
      <label>Password *<input required type="password" name="password" autoComplete={isRegister ? 'new-password' : 'current-password'} minLength={isRegister ? 8 : undefined} value={form.password} onChange={change} placeholder={isRegister ? 'At least 8 characters' : 'Your password'}/></label>
      {error && <div className="alert">{error}</div>}<button className="btn-primary full" disabled={busy}>{busy ? 'Please wait…' : isRegister ? 'Create account' : 'Log in'} <ChevronRight size={16}/></button>
    </form><p className="auth-switch">{isRegister ? 'Already registered?' : 'New to Carewell?'} <Link to={isRegister ? '/login' : '/register'} state={{ from: next }}>{isRegister ? 'Log in' : 'Create an account'}</Link></p>
  </section></main></Shell>;
}

function Home({ patient, onLogout }) {
  const { data: doctors, loading, error } = useData('/doctors');
  const [q, setQ] = useState(''), [spec, setSpec] = useState('All specialties'); const nav = useNavigate();
  const filtered = doctors.filter(d => (d.name + ' ' + d.specialty + ' ' + d.hospital).toLowerCase().includes(q.toLowerCase()) && (spec === 'All specialties' || d.specialty === spec));
  const specialties = ['All specialties', 'Cardiologist', 'General Physician', 'Dermatologist', 'Paediatrician'];
  return <Shell patient={patient} onLogout={onLogout}><section className="hero"><div className="hero-inner"><div className="eyebrow">YOUR HEALTH, OUR PRIORITY</div><h1>Find the right care.<br/><em>At the right time.</em></h1><p>Search trusted doctors and choose a time that works for you.</p><div className="search-panel"><label><Search size={19}/><input value={q} onChange={e => setQ(e.target.value)} placeholder="Doctor, specialty or hospital"/></label><span className="location"><MapPin size={16}/> All locations</span><button className="btn-primary" onClick={() => document.getElementById('doctors').scrollIntoView({ behavior: 'smooth' })}>Search doctors</button></div><div className="specialty-pills">{specialties.map(s => <button key={s} className={spec === s ? 'selected' : ''} onClick={() => setSpec(s)}>{s}</button>)}</div></div></section>
    <main className="content" id="doctors"><div className="section-head"><div><div className="eyebrow muted">PERSONALISED CARE</div><h2>{q || spec !== 'All specialties' ? 'Search results' : 'Featured doctors'}</h2><p>Experienced professionals, ready to help.</p></div><span className="result-count">{filtered.length} doctors</span></div>
      {error && <div className="alert">{error}. Check that the API and MySQL database are running.</div>}{loading ? <p>Loading doctors…</p> : <div className="doctor-grid">{filtered.map(d => <article className="doctor-card" key={d.id}><div className="doctor-top"><Avatar initials={d.initials}/><div className="doctor-meta"><b>{d.name}</b><span>{d.specialty}</span><span className="rating"><Star size={13} fill="currentColor"/> {d.rating} · {d.reviews} reviews</span></div><span className="available">{d.available_today ? 'Available today' : 'Next available'}</span></div><div className="doctor-info"><span><MapPin size={14}/>{d.hospital}</span><span><Clock size={14}/>{d.experience} years experience</span><b>{money(d.fee)} <small>/ visit</small></b></div><button className="btn-outline full" onClick={() => nav(`/doctor/${d.id}`)}>View profile <ChevronRight size={15}/></button></article>)}</div>}
      {!loading && !filtered.length && <div className="empty">No doctors match your search. Try another specialty or keyword.</div>}
      <section className="how" id="how"><div><span className="eyebrow muted">SIMPLE BY DESIGN</span><h2>Care in three easy steps</h2></div><div className="steps"><div><b>01</b><h3>Find your doctor</h3><p>Search by specialty, name or clinic.</p></div><div><b>02</b><h3>Sign in and choose a time</h3><p>Log in to see live availability and reserve a slot.</p></div><div><b>03</b><h3>You're all set</h3><p>Receive your booking confirmation.</p></div></div></section>
    </main></Shell>;
}

function Doctor({ patient, onLogout }) {
  const id = useLocation().pathname.split('/').pop(); const { data: d, loading, error } = useData(`/doctors/${id}`); const nav = useNavigate();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10)); const [slots, setSlots] = useState([]), [slotsLoading, setSlotsLoading] = useState(false), [slotError, setSlotError] = useState(''), [time, setTime] = useState('');
  useEffect(() => { if (!patient || !d.id || !date) { setSlots([]); return; } setSlotsLoading(true); setSlotError(''); request(`/doctors/${id}/slots?date=${date}`).then(result => { setSlots(result.slots); setTime(current => result.slots.some(s => s.time === current && s.available) ? current : (result.slots.find(s => s.available)?.time || '')); }).catch(e => setSlotError(e.status === 401 ? 'Please log in to view available appointment slots.' : e.message)).finally(() => setSlotsLoading(false)); }, [patient, d.id, date, id]);
  if (loading) return <Shell patient={patient}><main className="content">Loading doctor profile…</main></Shell>;
  if (error || !d.id) return <Shell patient={patient}><main className="content"><div className="alert">Doctor profile could not be loaded.</div><Link to="/">Back to search</Link></main></Shell>;
  const continueBooking = () => patient ? nav('/book', { state: { doctor: d, date, time } }) : nav('/login', { state: { from: `/doctor/${id}` } });
  return <Shell patient={patient} onLogout={onLogout}><main className="content"><button className="back" onClick={() => nav('/')}><ArrowLeft size={16}/> Back to search</button><div className="profile-layout"><section className="profile-card"><Avatar initials={d.initials}/><h2>{d.name}</h2><p>{d.specialty}</p><span className="rating"><Star size={14} fill="currentColor"/> {d.rating} ({d.reviews} reviews)</span><hr/><p><MapPin size={15}/> {d.hospital} · {d.location}</p><p><Stethoscope size={15}/> {d.experience}+ years experience</p><div className="fee">{money(d.fee)} <small>per visit</small></div></section>
    <section className="booking-card"><div className="eyebrow muted">BOOK AN APPOINTMENT</div><h2>Choose an available time</h2>{!patient && <div className="auth-required"><LockKeyhole size={17}/> <span><b>Patient login required</b><br/>Log in or create an account to view live slots and book.</span><Link to="/login" className="btn-primary">Log in</Link></div>}
      <label className="field-label">Appointment date<input type="date" min={new Date().toISOString().slice(0, 10)} value={date} onChange={e => setDate(e.target.value)} disabled={!patient}/></label><h3>Available times</h3>
      {!patient ? <div className="slots-locked">Sign in to check which times are available.</div> : slotsLoading ? <p>Checking live availability…</p> : slotError ? <div className="alert">{slotError}</div> : <div className="slots">{slots.map(slot => <button type="button" key={slot.time} disabled={!slot.available} title={slot.reason || 'Available'} className={`${time === slot.time ? 'chosen' : ''} ${!slot.available ? 'unavailable' : ''}`} onClick={() => setTime(slot.time)}>{slot.time}{!slot.available && <small>Booked</small>}</button>)}</div>}
      {patient && !slotsLoading && slots.length > 0 && !slots.some(s => s.available) && <div className="alert">No available times on this date. Please choose another date.</div>}
      {time && patient && <div className="selection">Selected: {fmtDate(date)} · {time}</div>}<button className="btn-primary full" disabled={!patient || !time || slotsLoading} onClick={continueBooking}>Continue to booking <ChevronRight size={16}/></button>
    </section></div></main></Shell>;
}

function Book({ patient, onLogout }) {
  const nav = useNavigate(), { state } = useLocation(); const [reason, setReason] = useState('Routine check-up'), [reminder, setReminder] = useState('sms'), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  if (!patient) return <main className="content"><div className="alert">Please log in before booking an appointment.</div><Link to="/login">Log in</Link></main>;
  if (!state?.doctor || !state?.date || !state?.time) return <Shell patient={patient}><main className="content"><p>Select an available slot first.</p><Link to="/">Find a doctor</Link></main></Shell>;
  const d = state.doctor;
  async function submit(e) { e.preventDefault(); setBusy(true); setError(''); try { const result = await request('/appointments', { method: 'POST', body: JSON.stringify({ doctor_id: d.id, appointment_date: state.date, appointment_time: state.time, reason, reminder_channel: reminder }) }); nav('/confirmed', { state: { ...state, id: result.id, reminder } }); } catch (err) { setError(err.message); if (err.status === 409) setError(`${err.message} Return to the doctor's profile and select another time.`); } finally { setBusy(false); } }
  return <Shell patient={patient} onLogout={onLogout}><main className="content"><button className="back" onClick={() => nav(-1)}><ArrowLeft size={16}/> Back to available slots</button><div className="section-head"><div><span className="eyebrow muted">FINAL STEP</span><h2>Review your appointment</h2><p>Your signed-in patient details will be attached to this booking.</p></div></div><div className="form-layout"><aside className="summary-card"><span className="eyebrow muted">YOUR APPOINTMENT</span><div className="summary-doctor"><Avatar initials={d.initials}/><div><b>{d.name}</b><span>{d.specialty}</span></div></div><p><CalendarDays size={16}/>{fmtDate(state.date)}</p><p><Clock size={16}/>{state.time}</p><p><MapPin size={16}/>{d.hospital} · {d.location}</p><hr/><b>Patient</b><p>{patient.full_name}</p><p className="small">Please arrive 15 minutes before your appointment.</p></aside><form className="patient-form" onSubmit={submit}><div className="form-title"><h3>Appointment details</h3><span>Signed in as {patient.email}</span></div><label>Reason for visit<input value={reason} onChange={e => setReason(e.target.value)} maxLength={255}/></label><div className="reminder"><b>Reminder preference</b><div className="radio-row">{[['sms', 'SMS'], ['email', 'Email'], ['none', 'None']].map(([v, label]) => <label key={v}><input type="radio" name="reminder" value={v} checked={reminder === v} onChange={() => setReminder(v)}/>{label}</label>)}</div></div>{error && <div className="alert">{error}</div>}<div className="form-actions"><button type="button" className="btn-outline" onClick={() => nav(-1)}>Cancel</button><button className="btn-primary" disabled={busy}>{busy ? 'Confirming…' : 'Confirm booking'} <ChevronRight size={16}/></button></div></form></div></main></Shell>;
}

function Confirmed({ patient, onLogout }) {
  const { state } = useLocation(), nav = useNavigate();
  if (!state) return <Shell patient={patient}><main className="content"><Link to="/appointments">My appointments</Link></main></Shell>;
  return <Shell patient={patient} onLogout={onLogout}><main className="content narrow"><div className="confirmation"><div className="success-icon"><Check size={28}/></div><span className="eyebrow muted">BOOKING CONFIRMED</span><h1>You're booked!</h1><p>Your appointment has been saved successfully.</p><div className="confirm-details"><div className="summary-doctor"><Avatar initials={state.doctor.initials}/><div><b>{state.doctor.name}</b><span>{state.doctor.specialty}</span></div><span className="status">Confirmed</span></div><p><CalendarDays size={16}/>{fmtDate(state.date)}</p><p><Clock size={16}/>{state.time}</p><p><MapPin size={16}/>{state.doctor.hospital} · {state.doctor.location}</p><small>Booking reference: CW-{String(state.id).padStart(6, '0')}</small></div><div className="reminder-note"><Bell size={17}/><span>Reminder preference: {state.reminder?.toUpperCase() || 'SMS'}.</span></div><button className="btn-primary full" onClick={() => nav('/appointments')}>View my appointments</button><button className="text-button" onClick={() => nav('/')}>Back to home</button></div></main></Shell>;
}


function PatientProfile({ patient, onPatientUpdated, onLogout }) {
  const nav = useNavigate();
  const [form, setForm] = useState({
    full_name: patient?.full_name || '',
    phone: patient?.phone || '',
    email: patient?.email || '',
    date_of_birth: patient?.date_of_birth ? String(patient.date_of_birth).slice(0, 10) : ''
  });
  const [editing, setEditing] = useState(false);
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setForm({
      full_name: patient?.full_name || '',
      phone: patient?.phone || '',
      email: patient?.email || '',
      date_of_birth: patient?.date_of_birth ? String(patient.date_of_birth).slice(0, 10) : ''
    });
  }, [patient]);

  async function saveProfile(e) {
    e.preventDefault();
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await request('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify(form)
      });
      onPatientUpdated(result.patient);
      setEditing(false);
      setMessage('Your profile has been updated successfully.');
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  }

  async function deleteProfile() {
    if (!password) {
      setError('Enter your password to confirm account deletion.');
      return;
    }
    if (!confirm('Permanently delete your Carewell account and all associated appointment records? This cannot be undone.')) return;
    setBusy(true); setError(''); setMessage('');
    try {
      await request('/auth/profile', {
        method: 'DELETE',
        body: JSON.stringify({ password })
      });
      onPatientUpdated(null);
      nav('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  }

  return <Shell patient={patient} onLogout={onLogout}>
    <main className="content narrow">
      <button className="back" onClick={() => nav(-1)}><ArrowLeft size={16}/> Back</button>
      <div className="section-head">
        <div><span className="eyebrow muted">PATIENT PORTAL</span><h1>My profile</h1><p>View and manage your personal information.</p></div>
      </div>
      <section className="patient-form profile-page-card">
        <div className="profile-page-heading"><div className="avatar"><UserRound size={25}/></div><div><h2>{patient.full_name}</h2><p>Carewell patient account</p></div></div>
        {message && <div className="success-message">{message}</div>}
        {error && <div className="alert">{error}</div>}
        {editing ? <form className="auth-form" onSubmit={saveProfile}>
          <label>Full name *<input required maxLength={120} value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })}/></label>
          <label>Phone number *<input required maxLength={30} value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}/></label>
          <label>Email address *<input required type="email" maxLength={150} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}/></label>
          <label>Date of birth<input type="date" value={form.date_of_birth} onChange={e => setForm({ ...form, date_of_birth: e.target.value })}/></label>
          <div className="form-actions"><button type="button" className="btn-outline" onClick={() => { setEditing(false); setError(''); setForm({ full_name: patient.full_name, phone: patient.phone, email: patient.email, date_of_birth: patient.date_of_birth ? String(patient.date_of_birth).slice(0, 10) : '' }); }}>Cancel</button><button className="btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button></div>
        </form> : <>
          <div className="profile-details">
            <div><span>Full name</span><b>{patient.full_name}</b></div>
            <div><span>Phone number</span><b>{patient.phone || 'Not provided'}</b></div>
            <div><span>Email address</span><b>{patient.email || 'Not provided'}</b></div>
            <div><span>Date of birth</span><b>{patient.date_of_birth ? String(patient.date_of_birth).slice(0, 10) : 'Not provided'}</b></div>
          </div>
          <button className="btn-primary" onClick={() => { setEditing(true); setMessage(''); setError(''); }}><UserRound size={15}/> Edit profile</button>
        </>}
      </section>
      <section className="patient-form delete-profile-card">
        <h2>Delete account</h2>
        <p>Deleting your account permanently removes your patient profile and all appointment records linked to it.</p>
        <label className="field-label">Confirm your password<input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your current password"/></label>
        <button className="btn-danger" disabled={busy} onClick={deleteProfile}>Delete my account</button>
      </section>
    </main>
  </Shell>;
}

function Appointments({ patient, onLogout }) {
  const { data: apps, loading, error, reload } = useData('/appointments'); const [message, setMessage] = useState(''), [manage, setManage] = useState(null);
  const upcoming = apps.filter(a => a.status === 'confirmed'), past = apps.filter(a => a.status !== 'confirmed');
  async function update(id, payload) { const result = await request(`/appointments/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }); setMessage(result.message); setManage(null); reload(); }
  return <Shell patient={patient} onLogout={onLogout}><main className="content"><div className="section-head"><div><span className="eyebrow muted">YOUR CARE, ALL IN ONE PLACE</span><h1>My appointments</h1><p>Only your own appointments are shown here.</p></div><Link className="btn-primary" to="/">Find a doctor</Link></div>
    {message && <div className="success-message">{message}</div>}{error && <div className="alert">{error}</div>}{loading ? <p>Loading appointments…</p> : <><h2 className="list-heading">Upcoming ({upcoming.length})</h2><div className="appointment-grid">{upcoming.map(a => <article className="appointment-card" key={a.id}><div className="appointment-date"><b>{new Date(`${a.appointment_date}T12:00:00`).toLocaleDateString('en', { month: 'short' })}</b><strong>{new Date(`${a.appointment_date}T12:00:00`).getDate()}</strong><small>{a.appointment_time.slice(0, 5)}</small></div><div className="appointment-main"><span className="status">Confirmed</span><h3>{a.doctor_name}</h3><p>{a.specialty}</p><small><MapPin size={13}/>{a.hospital} · {a.location}</small><div className="appointment-actions"><button className="btn-outline" onClick={() => setManage(a)}>Reschedule</button><button className="btn-danger" onClick={async () => { if (confirm('Cancel this appointment?')) try { await update(a.id, { status: 'cancelled' }); } catch (e) { setMessage(e.message); } }}>Cancel</button></div></div></article>)}</div>
      <h2 className="list-heading">Past & cancelled ({past.length})</h2><div className="past-list">{past.map(a => <div key={a.id}><b>{a.doctor_name}</b><span>{a.specialty} · {a.appointment_date} · {a.appointment_time.slice(0, 5)}</span><em>{a.status}</em></div>)}</div></>}
    {manage && <div className="modal-backdrop"><form className="modal" onSubmit={async e => { e.preventDefault(); const f = new FormData(e.target); try { await update(manage.id, { appointment_date: f.get('date'), appointment_time: f.get('time') }); } catch (err) { setMessage(err.message); } }}><button type="button" className="modal-close" onClick={() => setManage(null)}><X/></button><h2>Reschedule appointment</h2><p>{manage.doctor_name} · {manage.specialty}</p><label>Choose a new date<input name="date" type="date" required min={new Date().toISOString().slice(0, 10)} defaultValue={manage.appointment_date}/></label><label>Choose a new time<select name="time" defaultValue={manage.appointment_time.slice(0, 5)}>{['09:00', '10:30', '11:00', '13:00', '14:30', '15:00'].map(t => <option key={t} value={t}>{t}</option>)}</select></label><div className="form-actions"><button type="button" className="btn-outline" onClick={() => setManage(null)}>Keep current</button><button className="btn-primary">Confirm change</button></div></form></div>}
  </main></Shell>;
}

export default function App() {
  const loc = useLocation(), nav = useNavigate(); const [patient, setPatient] = useState(null), [authLoading, setAuthLoading] = useState(true);
  useEffect(() => { request('/auth/me').then(data => setPatient(data.patient)).catch(() => setPatient(null)).finally(() => setAuthLoading(false)); }, []);
  const logout = async () => { try { await request('/auth/logout', { method: 'POST' }); } finally { setPatient(null); nav('/'); } };
  if (authLoading) return <main className="content">Loading Carewell…</main>;
  const protectedPath = ['/appointments', '/book', '/confirmed', '/profile'].includes(loc.pathname);
  if (protectedPath && !patient) return <AuthPage mode="login" onAuthenticated={setPatient} redirectTo={loc.pathname}/>;
  if (loc.pathname === '/login' || loc.pathname === '/register') return patient ? <Shell patient={patient} onLogout={logout}><main className="content"><p>You are already signed in.</p><Link to="/appointments">View my appointments</Link></main></Shell> : <AuthPage mode={loc.pathname === '/register' ? 'register' : 'login'} onAuthenticated={setPatient}/>;
  if (loc.pathname.startsWith('/doctor/')) return <Doctor patient={patient} onLogout={logout}/>;
  if (loc.pathname === '/book') return <Book patient={patient} onLogout={logout}/>;
  if (loc.pathname === '/confirmed') return <Confirmed patient={patient} onLogout={logout}/>;
  if (loc.pathname === '/appointments') return <Appointments patient={patient} onLogout={logout}/>;
  if (loc.pathname === '/profile') return <PatientProfile patient={patient} onPatientUpdated={setPatient} onLogout={logout}/>;
  return <Home patient={patient} onLogout={logout}/>;
}
