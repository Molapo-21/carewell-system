
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: Number(process.env.EMAIL_PORT) || 465,
    secure: process.env.EMAIL_SECURE !== 'false',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

async function sendAppointmentConfirmation(appointment) {
    const {
        to,
        patientName,
        doctorName,
        specialty,
        hospital,
        appointmentDate,
        appointmentTime,
        appointmentId
    } = appointment;

    if (!to) {
        throw new Error('Patient email address is missing.');
    }

    const safe = (value) => String(value || '').replace(
        /[&<>"']/g,
        char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        })[char]
    );

    const mail = {
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to,
        subject: 'Your Carewell Appointment is Confirmed',
        text: `Dear ${patientName},

Your Carewell appointment has been confirmed.

Appointment reference: ${appointmentId}
Doctor: ${doctorName}
Specialty: ${specialty}
Hospital: ${hospital}
Date: ${appointmentDate}
Time: ${appointmentTime}

Please arrive 15 minutes before your appointment.

Thank you for choosing Carewell.`,
        html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#333">
            <div style="background:#087f8c;padding:25px;text-align:center;color:white">
                <h1>Carewell</h1>
                <p>Your health, our priority.</p>
            </div>
            <div style="padding:25px">
                <h2 style="color:#087f8c">Appointment Confirmed!</h2>
                <p>Dear ${safe(patientName)},</p>
                <p>Your appointment has been successfully booked.</p>
                <div style="background:#f3f8f8;padding:20px;border-radius:8px">
                    <p><strong>Reference:</strong> ${safe(appointmentId)}</p>
                    <p><strong>Doctor:</strong> ${safe(doctorName)}</p>
                    <p><strong>Specialty:</strong> ${safe(specialty)}</p>
                    <p><strong>Hospital:</strong> ${safe(hospital)}</p>
                    <p><strong>Date:</strong> ${safe(appointmentDate)}</p>
                    <p><strong>Time:</strong> ${safe(appointmentTime)}</p>
                </div>
                <p>Please arrive 15 minutes before your appointment.</p>
                <p>Thank you for choosing Carewell.</p>
            </div>
        </div>`
    };

    return transporter.sendMail(mail);
}


async function sendAppointmentRescheduled(appointment) {
    const {
        to,
        patientName,
        doctorName,
        specialty,
        hospital,
        appointmentDate,
        appointmentTime,
        previousDate,
        previousTime,
        appointmentId
    } = appointment;

    if (!to) throw new Error('Patient email address is missing.');

    const safe = (value) => String(value || '').replace(
        /[&<>"']/g,
        char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        })[char]
    );

    return transporter.sendMail({
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
        to,
        subject: 'Your Carewell Appointment Has Been Rescheduled',
        text: `Dear ${patientName},

Your Carewell appointment has been successfully rescheduled.

Appointment reference: ${appointmentId}
Doctor: ${doctorName}
Specialty: ${specialty}
Hospital: ${hospital}

Previous date and time: ${previousDate} at ${previousTime}
New date and time: ${appointmentDate} at ${appointmentTime}

Please arrive 15 minutes before your updated appointment.

Thank you for choosing Carewell.`,
        html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#333">
            <div style="background:#087f8c;padding:25px;text-align:center;color:white">
                <h1>Carewell</h1>
                <p>Your health, our priority.</p>
            </div>
            <div style="padding:25px">
                <h2 style="color:#087f8c">Appointment Rescheduled</h2>
                <p>Dear ${safe(patientName)},</p>
                <p>Your appointment has been successfully rescheduled. Please review the updated details below.</p>
                <div style="background:#f3f8f8;padding:20px;border-radius:8px">
                    <p><strong>Reference:</strong> CW-${safe(appointmentId)}</p>
                    <p><strong>Doctor:</strong> ${safe(doctorName)}</p>
                    <p><strong>Specialty:</strong> ${safe(specialty)}</p>
                    <p><strong>Hospital:</strong> ${safe(hospital)}</p>
                    <p><strong>Previous appointment:</strong> ${safe(previousDate)} at ${safe(previousTime)}</p>
                    <p><strong>New appointment:</strong> ${safe(appointmentDate)} at ${safe(appointmentTime)}</p>
                </div>
                <p>Please arrive 15 minutes before your updated appointment.</p>
                <p>Thank you for choosing Carewell.</p>
            </div>
        </div>`
    });
}

module.exports = {
    sendAppointmentConfirmation,
    sendAppointmentRescheduled
};
