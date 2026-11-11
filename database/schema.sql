CREATE DATABASE IF NOT EXISTS carewell_hci CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE carewell_hci;
CREATE TABLE IF NOT EXISTS doctors (
 id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(120) NOT NULL, specialty VARCHAR(80) NOT NULL,
 hospital VARCHAR(120) NOT NULL, location VARCHAR(120) DEFAULT 'Maseru', experience INT DEFAULT 5,
 rating DECIMAL(2,1) DEFAULT 4.8, reviews INT DEFAULT 0, fee DECIMAL(10,2) DEFAULT 350,
 available_today BOOLEAN DEFAULT TRUE, initials VARCHAR(5), created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS patients (
 id INT AUTO_INCREMENT PRIMARY KEY, full_name VARCHAR(120) NOT NULL, date_of_birth DATE,
 phone VARCHAR(30) NOT NULL, email VARCHAR(150) NULL, password_hash VARCHAR(255) NULL,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY unique_patient_email (email)
);
CREATE TABLE IF NOT EXISTS appointments (
 id INT AUTO_INCREMENT PRIMARY KEY, doctor_id INT NOT NULL, patient_id INT NOT NULL,
 appointment_date DATE NOT NULL, appointment_time TIME NOT NULL, reason VARCHAR(255),
 status ENUM('confirmed','completed','cancelled') DEFAULT 'confirmed',
 reminder_channel ENUM('sms','email','none') DEFAULT 'sms',
 active_slot TINYINT GENERATED ALWAYS AS (CASE WHEN status = 'cancelled' THEN NULL ELSE 1 END) STORED,
 created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY (doctor_id) REFERENCES doctors(id), FOREIGN KEY (patient_id) REFERENCES patients(id),
 UNIQUE KEY unique_active_doctor_slot (doctor_id, appointment_date, appointment_time, active_slot),
 INDEX idx_patient_appointments (patient_id, appointment_date)
);
INSERT INTO doctors (name,specialty,hospital,location,experience,rating,reviews,fee,available_today,initials)
SELECT * FROM (SELECT 'Dr. Molapo Molapo','Cardiologist','Mabote Clinic','Maseru',12,4.9,128,450,1,'MM') AS tmp
WHERE NOT EXISTS (SELECT 1 FROM doctors WHERE name='Dr. Molapo Molapo');
INSERT INTO doctors (name,specialty,hospital,location,experience,rating,reviews,fee,available_today,initials)
SELECT * FROM (SELECT 'Dr. Thabang Nkatane','General Physician','Mabote Clinic','Maseru',8,4.8,96,300,1,'TN') AS tmp
WHERE NOT EXISTS (SELECT 1 FROM doctors WHERE name='Dr. Thabang Nkatane');
INSERT INTO doctors (name,specialty,hospital,location,experience,rating,reviews,fee,available_today,initials)
SELECT * FROM (SELECT 'Dr. Rethabile Mokone','Dermatologist',' Mabote Clinic','Maseru',10,4.9,84,380,1,'RB') AS tmp
WHERE NOT EXISTS (SELECT 1 FROM doctors WHERE name='Dr. Rethabile Mokone');
INSERT INTO doctors (name,specialty,hospital,location,experience,rating,reviews,fee,available_today,initials)
SELECT * FROM (SELECT 'Dr. Fusi Motheo','Paediatrician','Mabote Clinic','Maseru',9,4.7,72,350,0,'FM') AS tmp
WHERE NOT EXISTS (SELECT 1 FROM doctors WHERE name='Dr. Fusi Motheo');
