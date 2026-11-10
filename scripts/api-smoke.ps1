# MediBook API smoke test (PowerShell)
# Requires the backend to be running on http://localhost:5000 with demo data seeded.
$ErrorActionPreference = 'Stop'
$Base = 'http://localhost:5000/api/v1'

function New-Session {
  return New-Object Microsoft.PowerShell.Commands.WebRequestSession
}

function Invoke-Api {
  param(
    [string]$Method,
    [string]$Path,
    $Body,
    $Session,
    [string]$ContentType = 'application/json'
  )
  $params = @{
    Uri         = "$Base$Path"
    Method      = $Method
    WebSession  = $Session
    ContentType = $ContentType
    TimeoutSec  = 30
  }
  if ($null -ne $Body) {
    if ($Body -is [string]) { $params.Body = $Body } else { $params.Body = ($Body | ConvertTo-Json -Depth 12) }
  }
  try {
    return Invoke-RestMethod @params
  } catch {
    $detail = ''
    if ($_.ErrorDetails -and $_.ErrorDetails.Message) { $detail = $_.ErrorDetails.Message }
    throw "$Method $Path failed: $($_.Exception.Message) $detail"
  }
}

function Login {
  param([string]$Email, [string]$Password)
  $session = New-Session
  $result = Invoke-Api -Method POST -Path '/auth/login' -Body @{ email = $Email; password = $Password } -Session $session
  return @{ Session = $session; User = $result.data }
}

function Find-Slot {
  param([string]$DoctorId, [int]$StartDays = 3)
  for ($offset = $StartDays; $offset -le 28; $offset++) {
    $date = (Get-Date).AddDays($offset).ToString('yyyy-MM-dd')
    $result = Invoke-Api -Method GET -Path "/doctors/$DoctorId/slots?date=$date" -Session $script:PublicSession
    if ($result.data.slots.Count -gt 0) {
      return @{ Date = $date; Slot = $result.data.slots[0] }
    }
  }
  throw 'No available slot found in the next 28 days'
}

$checks = @()
function Assert-True {
  param([bool]$Condition, [string]$Label)
  if (-not $Condition) { throw "Assertion failed: $Label" }
  $script:checks += $Label
  Write-Host "  [ok] $Label" -ForegroundColor Green
}

Write-Host 'MediBook API smoke test' -ForegroundColor Cyan

# 1. Public endpoints
$script:PublicSession = New-Session
$specialties = Invoke-Api -Method GET -Path '/doctors/specialties' -Session $script:PublicSession
Assert-True ($specialties.data.Count -gt 0) 'Public specialties endpoint returns data'

$doctors = Invoke-Api -Method GET -Path '/doctors?limit=5' -Session $script:PublicSession
Assert-True ($doctors.data.Count -gt 0) 'Public doctor search returns data'
$doctor = $doctors.data | Where-Object { $_.fullName -eq 'Dr. Arjun Mehta' } | Select-Object -First 1
if (-not $doctor) { $doctor = $doctors.data[0] }
$doctorDetail = Invoke-Api -Method GET -Path "/doctors/$($doctor.id)" -Session $script:PublicSession
Assert-True ($doctorDetail.data.id -eq $doctor.id) 'Public doctor detail works'

# 2. Patient booking + online payment
Write-Host 'Patient flow' -ForegroundColor Cyan
$patient = Login -Email 'priya.sharma@example.com' -Password 'Patient@12345'
Assert-True ($patient.User.role -eq 'patient') 'Patient login'

$booked = Find-Slot -DoctorId $doctor.id
$booking = Invoke-Api -Method POST -Path '/appointments' -Session $patient.Session -Body @{
  doctorId        = $doctor.id
  startsAt        = $booked.Slot.startsAt
  appointmentType = 'in_clinic'
  paymentOption   = 'online'
  reason          = 'Smoke test consultation for recurring chest discomfort'
}
$appointmentId = $booking.data.appointment.id
Assert-True ($booking.data.appointment.status -eq 'pending') 'Online booking starts as pending'
Assert-True ($null -ne $booking.data.paymentInit.orderId) 'Booking returns payment initialisation'

$order = Invoke-Api -Method POST -Path '/payments/orders' -Session $patient.Session -Body @{ appointmentId = $appointmentId }
Assert-True ($order.data.orderId.StartsWith('order_dev_')) 'Dev payment order created'
Assert-True ($order.data.amount -gt 0) 'Payment amount calculated'

$captured = Invoke-Api -Method POST -Path '/payments/dev-confirm' -Session $patient.Session -Body @{ orderId = $order.data.orderId }
Assert-True ($captured.data.status -eq 'captured') 'Dev payment captured'

$afterPayment = Invoke-Api -Method GET -Path "/appointments/$appointmentId" -Session $patient.Session
Assert-True ($afterPayment.data.status -eq 'confirmed') 'Appointment confirmed after payment'
Assert-True ($afterPayment.data.paymentStatus -eq 'paid') 'Appointment marked paid'
Assert-True ($afterPayment.data.history.Count -ge 2) 'Status history recorded'

$invoice = Invoke-WebRequest -Uri "$Base/appointments/$appointmentId/invoice" -WebSession $patient.Session -UseBasicParsing -TimeoutSec 30
Assert-True ($invoice.Headers['Content-Type'] -like 'application/pdf*') 'Invoice PDF generated'
Assert-True ($invoice.RawContentLength -gt 1000) 'Invoice PDF has content'

# 3. Doctor consultation + prescription
Write-Host 'Doctor flow' -ForegroundColor Cyan
$doctorSession = Login -Email 'arjun.mehta@medibook.in' -Password 'Doctor@12345'
Assert-True ($doctorSession.User.role -eq 'doctor') 'Doctor login'

$doctorDashboard = Invoke-Api -Method GET -Path '/doctor-portal/dashboard' -Session $doctorSession.Session
Assert-True ($null -ne $doctorDashboard.data.stats) 'Doctor dashboard loads'

$assigned = Invoke-Api -Method GET -Path '/doctor-portal/patients' -Session $doctorSession.Session
Assert-True ($assigned.data.Count -gt 0) 'Doctor sees assigned patients'

$completed = Invoke-Api -Method PATCH -Path "/appointments/$appointmentId/status" -Session $doctorSession.Session -Body @{
  status = 'completed'
  note   = 'Consultation completed during smoke test'
}
Assert-True ($completed.data.status -eq 'completed') 'Doctor completes appointment'

$prescription = Invoke-Api -Method POST -Path '/prescriptions' -Session $doctorSession.Session -Body @{
  appointmentId = $appointmentId
  diagnosis     = 'Stable angina, stress-related'
  notes         = 'Lifestyle changes advised. Review in two weeks.'
  items         = @(
    @{ medicineName = 'Metoprolol 25mg'; dosage = '1 tablet'; frequency = 'Twice daily'; duration = '14 days'; instructions = 'After meals' },
    @{ medicineName = 'Aspirin 75mg'; dosage = '1 tablet'; frequency = 'Once daily'; duration = '30 days'; instructions = 'After dinner' }
  )
}
$prescriptionId = $prescription.data.id
Assert-True ($null -ne $prescriptionId) 'Prescription created'

$prescriptionPdf = Invoke-WebRequest -Uri "$Base/prescriptions/$prescriptionId/pdf" -WebSession $patient.Session -UseBasicParsing -TimeoutSec 30
Assert-True ($prescriptionPdf.Headers['Content-Type'] -like 'application/pdf*') 'Patient can download prescription PDF'

$review = Invoke-Api -Method POST -Path "/appointments/$appointmentId/review" -Session $patient.Session -Body @{
  rating  = 5
  comment = 'Very clear explanation and a thorough consultation.'
}
Assert-True ($review.data.rating -eq 5) 'Patient submits review'

$notifications = Invoke-Api -Method GET -Path '/notifications?limit=10' -Session $patient.Session
Assert-True ($notifications.data.Count -gt 0) 'Patient notifications available'
Assert-True ($notifications.meta.unread -ge 1) 'Unread notification count present'

$readAll = Invoke-Api -Method POST -Path '/notifications/read-all' -Session $patient.Session
Assert-True ($null -ne $readAll.data.updated) 'Notifications marked read'

# 4. Reception walk-in + pay at clinic
Write-Host 'Reception flow' -ForegroundColor Cyan
$reception = Login -Email 'reception@medibook.in' -Password 'Reception@12345'
Assert-True ($reception.User.role -eq 'receptionist') 'Receptionist login'

$receptionDashboard = Invoke-Api -Method GET -Path '/reception/dashboard' -Session $reception.Session
Assert-True ($null -ne $receptionDashboard.data.stats) 'Reception dashboard loads'

$walkIn = Invoke-Api -Method POST -Path '/reception/patients' -Session $reception.Session -Body @{
  fullName = 'Smoke Test Walkin'
  phone    = '9876501234'
  gender   = 'other'
  address  = '12 Test Road, Bengaluru'
}
Assert-True ($null -ne $walkIn.data.id) 'Walk-in patient registered'

$walkInSlot = Find-Slot -DoctorId $doctor.id -StartDays 4
$staffBooking = Invoke-Api -Method POST -Path '/appointments' -Session $reception.Session -Body @{
  doctorId        = $doctor.id
  patientId       = $walkIn.data.id
  startsAt        = $walkInSlot.Slot.startsAt
  appointmentType = 'in_clinic'
  paymentOption   = 'pay_at_clinic'
  reason          = 'Walk-in patient with fever'
}
Assert-True ($null -ne $staffBooking.data.appointment.id) 'Receptionist books for walk-in patient'

$checkedIn = Invoke-Api -Method PATCH -Path "/appointments/$($staffBooking.data.appointment.id)/status" -Session $reception.Session -Body @{
  status = 'checked_in'
  note   = 'Patient arrived at front desk'
}
Assert-True ($checkedIn.data.status -eq 'checked_in') 'Receptionist checks patient in'

$collect = Invoke-Api -Method POST -Path "/appointments/$($staffBooking.data.appointment.id)/collect-payment" -Session $reception.Session
Assert-True ($collect.data.status -eq 'captured') 'Pay-at-clinic payment collected'

# 5. Admin
Write-Host 'Admin flow' -ForegroundColor Cyan
$admin = Login -Email 'admin@medibook.in' -Password 'Admin@12345'
Assert-True ($admin.User.role -eq 'admin') 'Admin login'

$adminDashboard = Invoke-Api -Method GET -Path '/admin/dashboard' -Session $admin.Session
Assert-True ($null -ne $adminDashboard.data.stats) 'Admin dashboard loads'

$adminDoctors = Invoke-Api -Method GET -Path '/admin/doctors?limit=20' -Session $admin.Session
Assert-True ($adminDoctors.data.Count -gt 0) 'Admin doctor list'

$pendingDoctor = $adminDoctors.data | Where-Object { $_.verificationStatus -eq 'pending' } | Select-Object -First 1
if ($pendingDoctor) {
  $verified = Invoke-Api -Method PATCH -Path "/admin/doctors/$($pendingDoctor.id)/verification" -Session $admin.Session -Body @{
    status = 'verified'
    note   = 'Verified during smoke test'
  }
  Assert-True ($verified.data.verificationStatus -eq 'verified') 'Admin verifies doctor'
}

$settings = Invoke-Api -Method GET -Path '/admin/settings' -Session $admin.Session
Assert-True ($null -ne $settings.data.settings) 'Admin settings load'

$payments = Invoke-Api -Method GET -Path '/admin/payments?limit=10' -Session $admin.Session
Assert-True ($payments.data.Count -gt 0) 'Admin payment ledger loads'

$audit = Invoke-Api -Method GET -Path '/admin/audit-logs?limit=10' -Session $admin.Session
Assert-True ($audit.data.Count -gt 0) 'Audit log loads'

$complaint = Invoke-Api -Method POST -Path '/support' -Session $patient.Session -Body @{
  subject     = 'Smoke test support request'
  description = 'This is an automated smoke test support request to validate the complaint workflow.'
}
Assert-True ($null -ne $complaint.data.id) 'Patient creates support request'

$complaints = Invoke-Api -Method GET -Path '/admin/complaints' -Session $admin.Session
Assert-True ($complaints.data.Count -gt 0) 'Admin sees complaints'

$resolved = Invoke-Api -Method PATCH -Path "/admin/complaints/$($complaint.data.id)" -Session $admin.Session -Body @{
  status     = 'resolved'
  resolution = 'Resolved during smoke test.'
}
Assert-True ($resolved.data.status -eq 'resolved') 'Admin resolves complaint'

# 6. Authorization boundaries
Write-Host 'Authorization boundaries' -ForegroundColor Cyan
$forbidden = $false
try {
  Invoke-Api -Method GET -Path '/admin/dashboard' -Session $patient.Session | Out-Null
} catch { $forbidden = $true }
Assert-True $forbidden 'Patient cannot access admin dashboard'

$forbidden = $false
try {
  Invoke-Api -Method GET -Path '/doctor-portal/dashboard' -Session $patient.Session | Out-Null
} catch { $forbidden = $true }
Assert-True $forbidden 'Patient cannot access doctor portal'

$forbidden = $false
try {
  Invoke-Api -Method GET -Path "/patients/$($walkIn.data.id)" -Session $patient.Session | Out-Null
} catch { $forbidden = $true }
Assert-True $forbidden 'Patient cannot access another patient clinical record'

$unauthorized = $false
try {
  Invoke-WebRequest -Uri "$Base/notifications" -UseBasicParsing -TimeoutSec 15 | Out-Null
} catch { $unauthorized = $true }
Assert-True $unauthorized 'Anonymous request rejected'

Write-Host ''
Write-Host "All $($checks.Count) checks passed." -ForegroundColor Green
