# Project 1 scope checklist

Project 1: Centralised Student Management System (Aikido Shinju-Kai). Source: the AIDC problem statement, pages 3 to 7.

Status key: **Done** = built in the prototype. **Partial** = built but incomplete or not automatic. **Missing** = not built. **Backend** = the screen exists but runs on browser storage until the backend is built (see [backend-plan.md](backend-plan.md)).

Every screen below currently runs on seed data in browser storage, so "Done" means the screen and flow exist, not that the server logic does.

## 1. Objectives

| Objective | Status | Where / what is missing |
|---|---|---|
| One mobile-friendly web platform | Partial | Student and instructor pages tested on a phone. Admin portal and public site not yet checked on a phone. |
| Manage day-to-day operations across training centres | Partial | Admin sees all dojos. No external venues in the sample data, and no dojo filter on every admin view. |
| Reduce admin tasks and make information easier to find | Partial | Search and filters on lists. The admin dashboard is thin (see section 4). |
| Give administrators, instructors and students access to records in one place | Backend | Three portals read the same records. Role-based access still has to be enforced on the server. |

## 2. Registration

| Outcome | Status | Where / what is missing |
|---|---|---|
| Create membership profiles and welcome emails **automatically** | Partial | Join form, payment and welcome-email preview exist. The profile is created only when an admin approves, which is manual. Make it automatic on successful payment. |
| Suggest classes by belt level | Missing | Join form suggests by age. Booking only separates adults and children. Needs a belt-to-class rule (confirm with the centre: 4th to 6th Kyu train together in Intermediate). |
| Accept enrolments and payments, then send confirmations | Partial | Booking, packages and confirmation messages exist. Stripe is mocked: no real payment, and no webhook to update records. |
| Class enrolment | Done | Student Book a class page. |

## 3. Attendance

| Outcome | Status | Where / what is missing |
|---|---|---|
| Record centre and external sessions | Missing | All sample classes are at HQ. Needs a venue on classes and attendance, plus sample external venues. |
| NFC check-in | Backend | Check-in confirmation page exists. The server logic for the tap is not built. |
| Instructor attendance (roster, mark present, end class) | Done | Instructor schedule and roster. |
| Flag declining attendance for follow-up | Partial | Flag shown on the roster and the student panel (14 or more days away). No record that someone followed up. |
| Attendance monitoring and dashboard | Missing | Admin attendance report is booked versus capacity, not real attendance. No trend view. |

## 4. Training progress and grading

| Outcome | Status | Where / what is missing |
|---|---|---|
| Check grading requirements | Done | Student Grading page checklist (membership, time at grade, sessions, fees). |
| Notify eligible students of upcoming grading sessions | Partial | Bell shows fixed text. Needs an automatic notice when a student becomes eligible and when a session is scheduled. |
| Accept grading applications | Done | Student Grading page form with fee. |
| Instructor assessments at scheduled sessions | Done | Examiner scoring page, reached from the timetable. |
| Record results and feedback; sign digitally; submit for processing | Done | Scoring, feedback, signature pad and submit. |
| Record **time at the current belt level** | Missing | Not shown on the scoring screen or saved with the result. |
| Progress dashboard (progress, attendance trends, grading readiness) | Partial | Student has their own progress (home page). Admin dashboard with trends and readiness is missing. Owner: admin. |
| Training progress and grading records | Done | Student grading history and feedback. |

## 5. Data and student access

| Outcome | Status | Where / what is missing |
|---|---|---|
| Reports | Partial | CSV exports for members, attendance, progression and payments. Attendance export should use real attendance. |
| Automated notifications | Missing | Admin Notifications is a manual broadcast. Needs automatic triggers: welcome email, eligible for grading, attendance dropped. |
| Student self-service: membership status, schedules, grading applications, payment history | Done | Student home, Book, Grading and Payments pages. |

## 6. Explicitly out of scope for Project 1

The statement excludes "grading result processing, belt promotion approvals and back-end administrative workflows". The prototype currently contains some of these. Hide them or label them as Project 2 extras:

- Admin Grading page that approves instructor proposals to promote a belt
- Admin Requests page (membership application and package extension approvals)
- Admin Sessions scheduling, the admin Payments dashboard and financial reports (Project 2)
- Grading panel scheduling: examiner assignment, shift window and the timetable lock (Project 2 assigns instructors to grading sessions)

## 7. Features in neither project

Keep only if framed as bonus work: gamified student home, mascot chatbot, class ratings, instructor remarks and student notes, private lessons, Day / Week / Month timetable, medical certificate and extension requests, public marketing site.

## 8. Next actions

1. Backend foundation: sign-in, role rules, attendance (see [backend-plan.md](backend-plan.md)).
2. Automatic registration and Stripe test mode.
3. Admin dashboard: attendance trend, grading readiness, declining-attendance list, dojo filter.
4. Small front-end items: time at current belt on the scoring screen, belt-based class suggestions, venue on classes and records, sample external venues, a follow-up status for declining attendance.
5. Phone check of the admin portal and public site, then trim or label the Project 2 and extra features.
