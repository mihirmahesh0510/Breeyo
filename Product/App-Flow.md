# Breeyo - Complete App Flow

> Mobile-first veterinary clinic management platform for solo and small-team vets in India.
> This document maps every screen, user flow, and feature across Mobile, Web Dashboard, and Owner Portal.

---

## Table of Contents

1. [User Roles & Permissions](#1-user-roles--permissions)
2. [Navigation Structure](#2-navigation-structure)
3. [Authentication & Onboarding Flow](#3-authentication--onboarding-flow)
4. [Walk-in Queue (Home Tab)](#4-walk-in-queue-home-tab)
5. [Patient Registration & Management](#5-patient-registration--management)
6. [EMR & Clinical Records](#6-emr--clinical-records)
7. [Inventory Management](#7-inventory-management)
8. [Invoicing & Payments](#8-invoicing--payments)
9. [WhatsApp Communication](#9-whatsapp-communication)
10. [Scheduling & Calendar](#10-scheduling--calendar)
11. [Web Dashboard](#11-web-dashboard)
12. [Owner Portal](#12-owner-portal)
13. [Offline Mode](#13-offline-mode)
14. [End-to-End Flow: A Full Clinic Day](#14-end-to-end-flow-a-full-clinic-day)

---

## 1. User Roles & Permissions

```
+------------------+--------+-----------+------------+-------------------+
|     Feature      | Admin  | Clinician | Front Desk | Inventory Manager |
+------------------+--------+-----------+------------+-------------------+
| Queue Management |   Y    |     Y     |     Y      |        -          |
| Patient Reg.     |   Y    |     Y     |     Y      |        -          |
| EMR / SOAP Notes |   Y    |     Y     |     -      |        -          |
| Prescriptions    |   Y    |     Y     |     -      |        -          |
| Inventory        |   Y    |     -     |     -      |        Y          |
| Invoicing        |   Y    |     Y     |     Y      |        -          |
| Payments         |   Y    |     Y     |     Y      |        -          |
| WhatsApp Inbox   |   Y    |     -     |     Y      |        -          |
| Scheduling       |   Y    |     Y     |     Y      |        -          |
| Staff Management |   Y    |     -     |     -      |        -          |
| Web Dashboard    |   Y    |     -     |  (limited) |        -          |
| Clinic Settings  |   Y    |     -     |     -      |        -          |
+------------------+--------+-----------+------------+-------------------+
```

---

## 2. Navigation Structure

### Mobile App - Bottom Tab Bar

```
+================================================================+
|                                                                 |
|                      [ Current Screen ]                         |
|                                                                 |
+================================================================+
|  Queue   | Patients | Inventory | Billing  | WhatsApp           |
| (home)   |          |           |          |                    |
|  [icon]  |  [icon]  |  [icon]   |  [icon]  |  [icon]           |
+================================================================+
    ^            ^          ^          ^           ^
    |            |          |          |           |
  Phase 3    Phase 3    Phase 5    Phase 6     Phase 7

Note: Tab visibility depends on user role.
Clinician sees: Queue, Patients, Billing
Front Desk sees: Queue, Patients, Billing, WhatsApp
Inventory Manager sees: Inventory only
Admin sees: All tabs
```

### Web Dashboard - Sidebar Navigation

```
+------------------+------------------------------------------+
|                  |                                          |
|  [Breeyo Logo]   |                                          |
|                  |          Main Content Area               |
|  > Home          |                                          |
|  > Queue Board   |                                          |
|  > Schedule      |                                          |
|  > Inventory     |                                          |
|  > Billing       |                                          |
|  > Users & Roles |                                          |
|  > Settings      |                                          |
|                  |                                          |
|  [Clinic Name]   |                                          |
|  [User Avatar]   |                                          |
+------------------+------------------------------------------+
```

---

## 3. Authentication & Onboarding Flow

### 3a. Signup & Login

```
                     +-------------------+
                     |   Launch Screen   |
                     |                   |
                     |   [Breeyo Logo]   |
                     |                   |
                     +--------+----------+
                              |
               +--------------+--------------+
               |                             |
        +------v------+              +-------v------+
        |   Sign Up   |              |    Log In    |
        +-------------+              +--------------+
        |             |              |              |
        | Name:  [__] |              | Email: [___] |
        | Email: [__] |              | Pass:  [___] |
        | Pass:  [__] |              |              |
        | Phone: [__] |              | [Login]      |
        |             |              | [OTP Login]  |
        | [Sign Up]   |              | [Forgot?]    |
        +------+------+              +------+-------+
               |                            |
        +------v------+             +-------v-------+
        | Verify Email|             |   OTP Login   |
        +-------------+             +---------------+
        | Check your  |             | Mobile: [___] |
        | inbox for   |             |               |
        | verification|             | [Send OTP]    |
        | link.       |             |               |
        | [Resend]    |             | OTP:  [_ _ _] |
        +------+------+             | [Verify]      |
               |                    +-------+-------+
               |                            |
               +----------+---------+-------+
                          |
                   +------v------+
                   | Select      |
                   | Clinic      |
                   +-------------+
                   | Choose your |
                   | clinic or   |
                   | create new  |
                   |             |
                   | [Clinic A]  |
                   | [Clinic B]  |
                   | [+ Create]  |
                   +------+------+
                          |
                          v
                (New clinic? -> Setup Wizard)
                (Existing?   -> Home / Queue)
```

### 3b. Clinic Setup Wizard (New Clinic)

```
  Step 1 of 3                Step 2 of 3              Step 3 of 3
+------------------+     +------------------+     +------------------+
| Clinic Profile   |     | Clinic Hours     |     | Invite Staff     |
+------------------+     +------------------+     +------------------+
|                  |     |                  |     |                  |
| Name:    [_____] |     | Mon  [09] - [18] |     | + Add Staff      |
| Address: [_____] |     | Tue  [09] - [18] |     |                  |
| City:    [_____] |     | Wed  [09] - [18] |     | Name:  [_______] |
| State:   [_____] |     | Thu  [09] - [18] |     | Phone: [_______] |
| GSTIN:   [_____] |     | Fri  [09] - [18] |     | Role:  [v Admin] |
| Phone:   [_____] |     | Sat  [09] - [14] |     |                  |
| Logo:    [Upload] |    | Sun  [Closed]    |     | Invited:         |
|                  |     |                  |     | - Dr. Sharma     |
| (o) (o) ( )     |     | (o) (o) ( )     |     |   (Front Desk)   |
| [    Next ->]    |     | [    Next ->]    |     | [   Finish  ->]  |
+------------------+     +------------------+     +------------------+
```

### 3c. First-Use Onboarding (After Setup)

```
+=========================================================+
|                       QUEUE (Home)                       |
+---------------------------------------------------------+
|  +---------------------------------------------------+  |
|  |  Welcome to Breeyo!                               |  |
|  |  Get started in 3 steps:                          |  |
|  |                                                   |  |
|  |  [x] 1. Register your first patient               |  |
|  |  [ ] 2. Check them into the queue                 |  |
|  |  [ ] 3. Complete a consultation & invoice         |  |
|  |                                                   |  |
|  |  [Register First Patient]         [Skip]          |  |
|  +---------------------------------------------------+  |
|                                                         |
|  (Empty queue - no patients yet)                        |
|                                                         |
|  +---------------------------------------------------+  |
|  |       No patients in queue today                  |  |
|  |       Tap + to check in your first walk-in        |  |
|  +---------------------------------------------------+  |
|                                                         |
|                                          [+ Check In]   |
+=========================================================+
|  Queue  | Patients | Inventory | Billing  | WhatsApp    |
+=========================================================+
```

---

## 4. Walk-in Queue (Home Tab)

### 4a. Queue Status Board

```
+=========================================================+
|  Walk-in Queue                    [Call Next] [+ Check In] |
+---------------------------------------------------------+
|                                                         |
|  IN CONSULT (1)                                         |
|  +---------------------------------------------------+  |
|  | [Avatar] Bruno (Labrador)              10:15 AM   |  |
|  |          Owner: Priya Sharma          ~In Room 1   |  |
|  |          Reason: Vaccination    [IN CONSULT]       |  |
|  +---------------------------------------------------+  |
|                                                         |
|  WAITING (3)                                            |
|  +---------------------------------------------------+  |
|  | #1 [Avatar] Milo (Persian Cat)         10:24 AM   |  |
|  |             Owner: Raj Patel          ~15 min wait |  |
|  |             Reason: Checkup      [WAITING]         |  |
|  +---------------------------------------------------+  |
|  | #2 [Avatar] Rocky (German Shepherd)    10:31 AM   |  |
|  |             Owner: Anita Desai        ~25 min wait |  |
|  |    [!]      Reason: Emergency    [EMERGENCY]       |  |
|  +---------------------------------------------------+  |
|  | #3 [Avatar] Coco (Indie Dog)           10:45 AM   |  |
|  |             Owner: Vikram Singh       ~35 min wait |  |
|  |             Reason: Skin Issue   [WAITING]         |  |
|  +---------------------------------------------------+  |
|                                                         |
|  DONE TODAY (5)                     [See All]           |
|  +---------------------------------------------------+  |
|  | [Avatar] Luna (Beagle)          Done 09:45 AM     |  |
|  |          Deworming                    [DONE]       |  |
|  +---------------------------------------------------+  |
|                                                         |
+---------------------------------------------------------+
|  Queue  | Patients | Inventory | Billing  | WhatsApp    |
+=========================================================+

Legend:
  [!] = Emergency flag (red left border on card)
  Queue updates in real-time via Socket.IO
  Swipe right on WAITING card -> Start Consultation
  Swipe left on WAITING card -> Mark No-Show
  Tap "Call Next" -> Moves top WAITING to IN CONSULT
  Emergency patients get FIFO priority
```

### 4b. Check-In Bottom Sheet (2-Tap Flow)

```
+=========================================================+
|                                                         |
|  (Queue screen dimmed behind)                           |
|                                                         |
+=========================================================+
|  -------- [drag handle] --------                        |
|                                                         |
|  Quick Check-In                                         |
|                                                         |
|  Search: [Type owner name or mobile________]            |
|                                                         |
|  Recent Patients:                                       |
|  +---------------------------------------------------+  |
|  | Milo (Cat) - Priya Sharma - 98765xxxxx            |  |
|  +---------------------------------------------------+  |
|  | Rocky (Dog) - Anita Desai - 98234xxxxx            |  |
|  +---------------------------------------------------+  |
|                                                         |
|  Select Pet:  [Milo (Cat)]  [Bruno (Dog)]               |
|                                                         |
|  Reason: [Checkup] [Vaccination] [Emergency] [Other]    |
|                                                         |
|  [                  Check In                  ]         |
|                                                         |
|  [+ New Patient? Register Now]                          |
+=========================================================+

Flow: Search owner -> Select pet -> Pick reason -> Check In
      = 2 taps for returning patients (auto-fill)
```

---

## 5. Patient Registration & Management

### 5a. Registration Wizard (2-Step)

```
  Step 1: Owner Info                 Step 2: Pet Info
+---------------------------+     +---------------------------+
|  Register Patient   1/2   |     |  Register Patient   2/2   |
+---------------------------+     +---------------------------+
|                           |     |                           |
|  Owner Mobile:            |     |  Pet Name:                |
|  [+91 ___________]       |     |  [________________]       |
|                           |     |                           |
|  (Auto-lookup: found!)    |     |  Species:                 |
|  Priya Sharma             |     |  (o) Dog  (o) Cat         |
|  2 pets registered        |     |  (o) Bird (o) Other [__]  |
|  [Use Existing Owner]     |     |                           |
|                           |     |  Breed:                   |
|  -- OR fill new --        |     |  [Labrador Retriever  v]  |
|                           |     |                           |
|  Owner Name:              |     |  Gender:                  |
|  [________________]       |     |  (o) Male  (o) Female     |
|                           |     |                           |
|  Email (optional):        |     |  Age:                     |
|  [________________]       |     |  [__] Years [__] Months   |
|                           |     |                           |
|  Address (optional):      |     |  Weight:                  |
|  [________________]       |     |  [____] kg                |
|                           |     |                           |
|                           |     |  Color/Markings:          |
|  [    Next ->]            |     |  [________________]       |
|                           |     |                           |
+---------------------------+     |  [ ] Check in after reg.  |
                                  |                           |
                                  |  [    Register    ]       |
                                  +---------------------------+
```

### 5b. Patient List & Search

```
+=========================================================+
|  Patients                              [+ Register]     |
+---------------------------------------------------------+
|  Search: [Owner name, mobile, or pet name____]          |
|                                                         |
|  +---------------------------------------------------+  |
|  | [Avatar] Bruno (Labrador Retriever)               |  |
|  |          Owner: Priya Sharma | 98765xxxxx         |  |
|  |          Last visit: 15 Jul 2026                  |  |
|  +---------------------------------------------------+  |
|  | [Avatar] Milo (Persian Cat)                       |  |
|  |          Owner: Priya Sharma | 98765xxxxx         |  |
|  |          Last visit: 10 Jul 2026                  |  |
|  +---------------------------------------------------+  |
|  | [Avatar] Rocky (German Shepherd)                  |  |
|  |          Owner: Anita Desai | 98234xxxxx          |  |
|  |          Last visit: 08 Jul 2026                  |  |
|  +---------------------------------------------------+  |
|  | [Avatar] Luna (Beagle)                            |  |
|  |          Owner: Vikram Singh | 99887xxxxx         |  |
|  |          Last visit: 01 Jul 2026                  |  |
|  +---------------------------------------------------+  |
|                                                         |
+---------------------------------------------------------+
|  Queue  | Patients | Inventory | Billing  | WhatsApp    |
+=========================================================+

Tap on any row -> Pet Profile Screen
Search uses trigram matching (fuzzy search)
```

### 5c. Pet Profile Screen

```
+=========================================================+
|  <  Bruno                                     [Edit]    |
+---------------------------------------------------------+
|                                                         |
|  +------------------+  Bruno                            |
|  |                  |  Labrador Retriever | Male        |
|  |   [Pet Photo]    |  Age: 3 years 2 months            |
|  |                  |  Weight: 28 kg                    |
|  +------------------+  Color: Golden                    |
|                        Microchip: 123456789012          |
|  Owner: Priya Sharma                                    |
|  Phone: +91 98765xxxxx                                  |
|                                                         |
+---------------------------------------------------------+
|  Visits | Vaccinations | Invoices                       |
+---------------------------------------------------------+
|                                                         |
|  Visit History:                                         |
|                                                         |
|  15 Jul 2026 -- Vaccination                             |
|  +---------------------------------------------------+  |
|  | Rabies Vaccination                                |  |
|  | Dr. Priya Sharma                                  |  |
|  | Weight: 28 kg | Temp: 38.5 C                     |  |
|  | Next due: 15 Jul 2027                             |  |
|  +---------------------------------------------------+  |
|                                                         |
|  01 Jul 2026 -- General Checkup                         |
|  +---------------------------------------------------+  |
|  | Skin irritation - Prescribed Cephalexin           |  |
|  | Dr. Priya Sharma                                  |  |
|  | Weight: 27.5 kg | Temp: 38.8 C                   |  |
|  +---------------------------------------------------+  |
|                                                         |
|  10 Jun 2026 -- Emergency                               |
|  +---------------------------------------------------+  |
|  | Vomiting and lethargy                             |  |
|  | Dr. Priya Sharma                                  |  |
|  | Weight: 27 kg | Temp: 39.2 C                     |  |
|  | Lab: Blood panel attached                         |  |
|  +---------------------------------------------------+  |
|                                                         |
+---------------------------------------------------------+
```

### 5d. Owner Detail Screen

```
+=========================================================+
|  <  Priya Sharma                              [Edit]    |
+---------------------------------------------------------+
|                                                         |
|  Phone: +91 98765xxxxx          [Call] [WhatsApp]       |
|  Email: priya.sharma@email.com                          |
|  Address: 42 MG Road, Bangalore 560001                  |
|                                                         |
+---------------------------------------------------------+
|  Pets (2)                                               |
|  +---------------------------------------------------+  |
|  | [Avatar] Bruno (Labrador) | 3y | 28 kg            |  |
|  |          Last visit: 15 Jul 2026                  |  |
|  +---------------------------------------------------+  |
|  | [Avatar] Milo (Persian Cat) | 2y | 4.5 kg         |  |
|  |          Last visit: 10 Jul 2026                  |  |
|  +---------------------------------------------------+  |
|  [+ Add Another Pet]                                    |
|                                                         |
+---------------------------------------------------------+
|  Outstanding Invoices                                   |
|  +---------------------------------------------------+  |
|  | INV-2026-0045 | 15 Jul | Rs. 2,500 | [UNPAID]     |  |
|  +---------------------------------------------------+  |
|                                                         |
+---------------------------------------------------------+
```

### 5e. CSV Bulk Import

```
+=========================================================+
|  <  Import Patients                                     |
+---------------------------------------------------------+
|                                                         |
|  Upload a CSV file with patient data.                   |
|                                                         |
|  Required columns:                                      |
|  owner_name, mobile, pet_name, species, breed           |
|                                                         |
|  Optional columns:                                      |
|  email, pet_age, pet_weight, pet_gender, color          |
|                                                         |
|  [Download Template CSV]                                |
|                                                         |
|  +---------------------------------------------------+  |
|  |                                                   |  |
|  |        Drag & drop or tap to select file          |  |
|  |              [Choose File]                        |  |
|  |                                                   |  |
|  +---------------------------------------------------+  |
|                                                         |
|  --- After upload ---                                   |
|                                                         |
|  Preview: patients.csv (150 rows)                       |
|                                                         |
|  +---------------------------------------------------+  |
|  | Row | Owner       | Pet    | Species | Status     |  |
|  +-----+-------------+--------+---------+------------+  |
|  |  1  | Priya S.    | Bruno  | Dog     | [OK]       |  |
|  |  2  | Raj P.      | Milo   | Cat     | [OK]       |  |
|  |  3  | ---         | Rocky  | Dog     | [!] No     |  |
|  |     |             |        |         | owner name |  |
|  |  4  | Anita D.    | Luna   | Hamster | [!] Unknown|  |
|  |     |             |        |         | species    |  |
|  +---------------------------------------------------+  |
|                                                         |
|  Valid: 148 / 150 rows                                  |
|  Errors: 2 rows (will be skipped)                       |
|                                                         |
|  [      Import 148 Valid Rows      ]                    |
+=========================================================+
```

---

## 6. EMR & Clinical Records

### 6a. Consultation Screen (Accordion Layout)

```
+=========================================================+
|  <  Consultation                [Auto-saved 10:24 AM]   |
+---------------------------------------------------------+
|  +---------------------------------------------------+  |
|  | Bruno (Labrador) | 3y | 28 kg | Priya Sharma     |  |
|  +---------------------------------------------------+  |
|  (Sticky patient banner)                                |
|                                                         |
|  v Vitals                                    [Expand]   |
|  +---------------------------------------------------+  |
|  | Weight:  [28___] kg    Temp: [38.5_] C            |  |
|  | Heart:   [80___] bpm   Resp: [20___] br/min       |  |
|  |                                                   |  |
|  | Body Condition Score: [5/9 ------o---]            |  |
|  +---------------------------------------------------+  |
|                                                         |
|  v Subjective (Owner Reports)                           |
|  +---------------------------------------------------+  |
|  | [Mic] Tap to dictate or type below                |  |
|  |                                                   |  |
|  | "Owner reports dog has been scratching             |  |
|  |  excessively for 3 days, reduced appetite          |  |
|  |  since yesterday..."                               |  |
|  |                                                   |  |
|  | Quick picks: [Vomiting] [Diarrhea] [Lethargy]     |  |
|  |              [Loss of appetite] [Limping]          |  |
|  +---------------------------------------------------+  |
|                                                         |
|  > Objective (Clinical Findings)             [Expand]   |
|  > Assessment (Diagnosis)                    [Expand]   |
|  > Plan (Treatment Plan)                     [Expand]   |
|  > Prescriptions (2)                         [Expand]   |
|  > Attachments (1 file)                      [Expand]   |
|                                                         |
+---------------------------------------------------------+
|  [Rx] [Mic] [Camera] [Files]    [End Consultation]     |
+---------------------------------------------------------+

Floating quick-action bar at bottom:
  [Rx]     = Jump to Prescriptions section
  [Mic]    = Start voice-to-text recording
  [Camera] = Take photo attachment
  [Files]  = Browse/attach files
```

### 6b. Voice-to-Text Recording

```
+=========================================================+
|                                                         |
|  (Consultation screen dimmed)                           |
|                                                         |
+---------------------------------------------------------+
|  -------- [drag handle] --------                        |
|                                                         |
|  Recording...                         00:12             |
|                                                         |
|  +---------------------------------------------------+  |
|  |                                                   |  |
|  |  "Dog has been scratching excessively for          |  |
|  |   three days, owner noticed redness behind          |  |
|  |   ears and on belly area..."                        |  |
|  |                                                   |  |
|  +---------------------------------------------------+  |
|  (Live transcription appears as you speak)              |
|                                                         |
|  Target field: [Subjective  v]                          |
|                                                         |
|       [Cancel]         [Stop & Insert]                  |
|                                                         |
+---------------------------------------------------------+
```

### 6c. Prescription Entry

```
+=========================================================+
|  <  Add Medication                                      |
+---------------------------------------------------------+
|                                                         |
|  Drug Search: [Cephale________________]                 |
|                                                         |
|  +---------------------------------------------------+  |
|  | Cephalexin 500mg (Capsule)                        |  |
|  | Cephalexin 250mg (Suspension)                     |  |
|  | Cephalexin 125mg (Drops)                          |  |
|  +---------------------------------------------------+  |
|                                                         |
|  Selected: Cephalexin 500mg                             |
|                                                         |
|  Dosage:    [500__] [mg  v]                             |
|  Frequency: [Twice daily  v]                            |
|  Duration:  [7____] [days v]                            |
|  Route:     [Oral  v]                                   |
|                                                         |
|  Instructions for owner:                                |
|  [Give with food, complete full course_______]          |
|                                                         |
|  [ ] Dispense from inventory (stock: 45)                |
|                                                         |
|  [!] Warning: Check for penicillin allergy              |
|                                                         |
|  [       Add Medication       ]                         |
+---------------------------------------------------------+
```

### 6d. Consultation Review & Finalize

```
+=========================================================+
|  <  Consultation Summary                                |
+---------------------------------------------------------+
|                                                         |
|  Bruno (Labrador) | Dr. Priya Sharma                    |
|  15 Jul 2026, 10:15 AM                                  |
|                                                         |
|  VITALS                                                 |
|  Weight: 28 kg | Temp: 38.5 C | HR: 80 | RR: 20       |
|                                                         |
|  SUBJECTIVE                                             |
|  Excessive scratching for 3 days, reduced appetite...   |
|                                                         |
|  OBJECTIVE                                              |
|  Erythema on ventral abdomen and behind ears.           |
|  No fleas observed. Skin scraping negative.             |
|                                                         |
|  ASSESSMENT                                             |
|  Allergic dermatitis - suspected environmental          |
|                                                         |
|  PLAN                                                   |
|  - Cephalexin 500mg BID x 7 days                       |
|  - Prednisolone 5mg SID x 5 days                       |
|  - Medicated shampoo bath 2x/week                      |
|  - Recheck in 10 days                                  |
|                                                         |
|  PRESCRIPTIONS (2 items)                                |
|  1. Cephalexin 500mg - 14 capsules (dispensed)          |
|  2. Prednisolone 5mg - 5 tablets (dispensed)            |
|                                                         |
|  ATTACHMENTS                                            |
|  [skin_photo_01.jpg]                                    |
|                                                         |
|  [Edit Draft]        [Confirm & Finalize]               |
+---------------------------------------------------------+

After finalizing:
  - Record becomes read-only (addendum only)
  - Patient moves to DONE in queue
  - Invoice can be generated from this consultation
```

### 6e. Vaccination / Deworming Tracking

```
+=========================================================+
|  Pet Profile > Vaccinations Tab                         |
+---------------------------------------------------------+
|                                                         |
|  Preventive Care Status                                 |
|  +---------------------------------------------------+  |
|  | [OK] Rabies         Due: 15 Jul 2027              |  |
|  | [!!] DHPP           OVERDUE since 01 Jul 2026     |  |
|  | [OK] Deworming      Due: 15 Aug 2026              |  |
|  +---------------------------------------------------+  |
|                                                         |
|  Vaccination History                                    |
|  +---------------------------------------------------+  |
|  | 15 Jul 2026 - Rabies (Rabisin)                    |  |
|  |   Dr. Priya Sharma | Batch: RB-2026-045           |  |
|  |   Next due: 15 Jul 2027                           |  |
|  +---------------------------------------------------+  |
|  | 15 Jan 2026 - DHPP (Nobivac DHPPi)                |  |
|  |   Dr. Priya Sharma | Batch: NB-2026-012           |  |
|  |   Next due: 15 Jul 2026 [OVERDUE]                 |  |
|  +---------------------------------------------------+  |
|                                                         |
|  Deworming History                                      |
|  +---------------------------------------------------+  |
|  | 15 Jul 2026 - Praziquantel (Drontal Plus)         |  |
|  |   Weight at time: 28 kg | Dose: 1 tablet          |  |
|  |   Next due: 15 Oct 2026                           |  |
|  +---------------------------------------------------+  |
|                                                         |
|  [+ Record Vaccination]  [+ Record Deworming]           |
+---------------------------------------------------------+
```

### 6f. Medical History Timeline

```
+=========================================================+
|  <  Bruno - Medical History                             |
+---------------------------------------------------------+
|                                                         |
|  Weight Trend:                                          |
|  30 |                                                   |
|  28 |         *----*----*                               |
|  26 |    *---*                                          |
|  24 |                                                   |
|     +----+----+----+----+----+                          |
|     Jan  Mar  May  Jul  Sep                             |
|                                                         |
+---------------------------------------------------------+
|                                                         |
|  Timeline:                                              |
|                                                         |
|  Jul 2026                                               |
|  o-- 15 Jul: Vaccination (Rabies)                       |
|  |   Dr. Priya Sharma                                   |
|  |   [View Details]                                     |
|  |                                                      |
|  o-- 01 Jul: General Checkup                            |
|  |   Allergic dermatitis treatment                      |
|  |   Rx: Cephalexin, Prednisolone                       |
|  |   [View Details]                                     |
|  |                                                      |
|  Jun 2026                                               |
|  o-- 10 Jun: Emergency Visit                            |
|  |   Vomiting and lethargy                              |
|  |   Lab: Blood panel [1 attachment]                    |
|  |   [View Details]                                     |
|  |                                                      |
|  o-- 01 Jun: Deworming (Drontal Plus)                   |
|      [View Details]                                     |
|                                                         |
+---------------------------------------------------------+
```

---

## 7. Inventory Management

### 7a. Inventory List Screen

```
+=========================================================+
|  Inventory                          [Scan] [+ Add Item] |
+---------------------------------------------------------+
|  +----------+----------+----------+----------+          |
|  | Total    | Low      | Expiring | Total    |          |
|  | Items    | Stock    | Soon     | Value    |          |
|  | 156      | 8       | 3        | 2.4L    |          |
|  +----------+----------+----------+----------+          |
|                                                         |
|  +---------------------------------------------------+  |
|  | [!] Attention Required                    [v]     |  |
|  | [Low Stock (8)] [Expiring (3)] [Expired (1)]      |  |
|  |                                                   |  |
|  | Amoxicillin 500mg         Stock: 5 (Par: 20)     |  |
|  | Metronidazole 400mg       Stock: 3 (Par: 15)     |  |
|  | Disposable Syringes 5ml   Stock: 8 (Par: 50)     |  |
|  +---------------------------------------------------+  |
|                                                         |
|  Search: [_________________________________]            |
|  Filter: [All] [Medicines] [Vaccines] [Supplies]        |
|  Sort:   [Name A-Z v]                                   |
|                                                         |
|  +---------------------------------------------------+  |
|  | [pill] Amoxicillin 500mg            Stock: 5     |  |
|  |        Medicines | Rs. 12/cap    [LOW STOCK]      |  |
|  +---------------------------------------------------+  |
|  | [pill] Cephalexin 500mg             Stock: 45    |  |
|  |        Medicines | Rs. 18/cap                     |  |
|  +---------------------------------------------------+  |
|  | [syr]  Rabies Vaccine (Rabisin)     Stock: 12    |  |
|  |        Vaccines | Rs. 350/dose   Exp: 15 Dec     |  |
|  +---------------------------------------------------+  |
|  | [box]  Disposable Gloves (M)        Stock: 200   |  |
|  |        Supplies | Rs. 5/pair                      |  |
|  +---------------------------------------------------+  |
|                                                         |
+---------------------------------------------------------+
|  Queue  | Patients | Inventory | Billing  | WhatsApp    |
+=========================================================+
```

### 7b. Barcode Scanner Screen

```
+=========================================================+
|                                                         |
|  +---------------------------------------------------+  |
|  |                                                   |  |
|  |                                                   |  |
|  |           [ Camera Viewfinder ]                   |  |
|  |                                                   |  |
|  |      +-----------------------------+              |  |
|  |      |  Align barcode in this box  |              |  |
|  |      |                             |              |  |
|  |      +-----------------------------+              |  |
|  |                                                   |  |
|  |                                                   |  |
|  +---------------------------------------------------+  |
|                                                         |
|  [Torch]                         [Enter Manually]       |
|                                                         |
+---------------------------------------------------------+
|  -------- [drag handle] --------                        |
|                                                         |
|  Scanned: Cephalexin 500mg                              |
|  Barcode: 8901234567890                                 |
|  Current stock: 45                                      |
|                                                         |
|  [Receive Stock]  [Dispense]  [View Item]               |
|                                                         |
+---------------------------------------------------------+

Works offline: scans queued in SQLite, synced on reconnect
Continuous scanning: keeps scanner active after each scan
```

### 7c. Stock Receipt Form

```
+=========================================================+
|  <  Receive Stock                                       |
+---------------------------------------------------------+
|                                                         |
|  Item: Cephalexin 500mg (Capsule)                       |
|                                                         |
|  Quantity Received:                                      |
|  [  -  ]    [ 100 ]    [  +  ]                          |
|                                                         |
|  Batch / Lot Number:                                    |
|  [CEP-2026-078___________]                              |
|                                                         |
|  Expiry Date:                                           |
|  [December 2027___________]                             |
|                                                         |
|  Purchase Price (per unit):                             |
|  Rs. [12.00___________]                                 |
|                                                         |
|  Supplier (optional):                                   |
|  [MedPharma Distributors___]                            |
|                                                         |
|  Invoice Number (optional):                             |
|  [INV-MP-2026-456________]                              |
|                                                         |
|  Notes (optional):                                      |
|  [________________________________]                     |
|                                                         |
|  [         Receive Stock          ]                     |
+---------------------------------------------------------+
```

### 7d. Dispense Screen (FIFO)

```
+=========================================================+
|  <  Dispense: Cephalexin 500mg                          |
+---------------------------------------------------------+
|                                                         |
|  Available Batches (FIFO order):                        |
|  +---------------------------------------------------+  |
|  | 1. Batch: CEP-2025-045                            |  |
|  |    Exp: 30 Jun 2026  [EXPIRING SOON]              |  |
|  |    Available: 12 capsules                          |  |
|  |    -> Will dispense first (oldest)                |  |
|  +---------------------------------------------------+  |
|  | 2. Batch: CEP-2026-078                            |  |
|  |    Exp: 31 Dec 2027                               |  |
|  |    Available: 100 capsules                         |  |
|  +---------------------------------------------------+  |
|                                                         |
|  Quantity to Dispense:                                   |
|  [  -  ]    [  14  ]    [  +  ]                         |
|                                                         |
|  FIFO Allocation:                                       |
|  Batch CEP-2025-045:  12 capsules                       |
|  Batch CEP-2026-078:   2 capsules                       |
|                                                         |
|  Dispensing for: Bruno (Priya Sharma)                   |
|  Linked to: Consultation #C-2026-0089                   |
|                                                         |
|  [          Confirm Dispense          ]                 |
+---------------------------------------------------------+
```

### 7e. Stock Take & Want List

```
  Stock Take Screen                  Want List Screen
+---------------------------+     +---------------------------+
|  <  Stock Take            |     |  <  Want List             |
+---------------------------+     +---------------------------+
|                           |     |                           |
|  Session started:         |     |  Items below par level:   |
|  15 Jul 2026, 09:00 AM   |     |                           |
|                           |     |  +---------------------+  |
|  Scan item or search:     |     |  | Amoxicillin 500mg   |  |
|  [____________________]   |     |  | Need: 15 | Have: 5  |  |
|                           |     |  | Order: 15 units     |  |
|  Counted Items: 45/156    |     |  +---------------------+  |
|                           |     |  | Metronidazole 400mg |  |
|  +---------------------+  |     |  | Need: 12 | Have: 3  |  |
|  | Cephalexin 500mg    |  |     |  | Order: 12 units     |  |
|  | System: 112         |  |     |  +---------------------+  |
|  | Counted: [112_]     |  |     |  | Syringes 5ml        |  |
|  | Status: [Match]     |  |     |  | Need: 42 | Have: 8  |  |
|  +---------------------+  |     |  | Order: 42 units     |  |
|  | Amoxicillin 500mg   |  |     |  +---------------------+  |
|  | System: 5           |  |     |                           |
|  | Counted: [8___]     |  |     |  Total items: 8           |
|  | Status: [+3 Over]   |  |     |                           |
|  +---------------------+  |     |  [Share via WhatsApp]     |
|                           |     |  [Export CSV]             |
|  [Continue Scanning]      |     |                           |
|  [Finish Stock Take]      |     +---------------------------+
+---------------------------+
```

---

## 8. Invoicing & Payments

### 8a. Billing Dashboard

```
+=========================================================+
|  Billing                              [+ Quick Sale]    |
+---------------------------------------------------------+
|  +----------+----------+----------+----------+          |
|  | Today's  | Unpaid   | Overdue  | Patients |          |
|  | Revenue  | Total    |          | Today    |          |
|  | Rs.8,450 | Rs.12.3K | 3       | 12       |          |
|  +----------+----------+----------+----------+          |
|                                                         |
|  Filter: [All] [Unpaid] [Overdue] [Today]               |
|                                                         |
|  +---------------------------------------------------+  |
|  | INV-2026-0089         15 Jul 2026                 |  |
|  | Bruno (Priya Sharma)                              |  |
|  | Rs. 2,500                              [UNPAID]   |  |
|  +---------------------------------------------------+  |
|  | INV-2026-0088         15 Jul 2026                 |  |
|  | Luna (Vikram Singh)                               |  |
|  | Rs. 800                                  [PAID]   |  |
|  +---------------------------------------------------+  |
|  | INV-2026-0085         12 Jul 2026                 |  |
|  | Rocky (Anita Desai)                               |  |
|  | Rs. 4,200                             [OVERDUE]   |  |
|  +---------------------------------------------------+  |
|  | INV-2026-0084         11 Jul 2026                 |  |
|  | Coco (Raj Patel)                                  |  |
|  | Rs. 950                                  [PAID]   |  |
|  +---------------------------------------------------+  |
|                                                         |
+---------------------------------------------------------+
|  Queue  | Patients | Inventory | Billing  | WhatsApp    |
+=========================================================+
```

### 8b. Invoice Builder

```
+=========================================================+
|  <  New Invoice                                         |
+---------------------------------------------------------+
|  Patient: Bruno (Priya Sharma)                          |
|  Consultation: 15 Jul 2026 - Allergic dermatitis        |
|                                                         |
|  SERVICES                              [+ Add Service]  |
|  +---------------------------------------------------+  |
|  | Consultation (General)         Rs. 500     [x]    |  |
|  | Skin Scraping Test             Rs. 300     [x]    |  |
|  +---------------------------------------------------+  |
|                                                         |
|  PRODUCTS (Dispensed)              [+ Add Product]      |
|  +---------------------------------------------------+  |
|  | Cephalexin 500mg x14           Rs. 252     [x]    |  |
|  | Prednisolone 5mg x5            Rs. 45      [x]    |  |
|  | Medicated Shampoo x1           Rs. 350     [x]    |  |
|  +---------------------------------------------------+  |
|                                                         |
|  Discount: [___] [% v]                                  |
|                                                         |
+---------------------------------------------------------+
|  Subtotal:                          Rs. 1,447           |
|  CGST (9%):                         Rs.   130           |
|  SGST (9%):                         Rs.   130           |
|  -----------------------------------------------        |
|  TOTAL:                             Rs. 1,707           |
+---------------------------------------------------------+
|                                                         |
|  [Save Draft]              [Finalize Invoice]           |
+---------------------------------------------------------+
```

### 8c. Payment Screen

```
+=========================================================+
|  <  Collect Payment                                     |
+---------------------------------------------------------+
|                                                         |
|  Invoice: INV-2026-0089                                 |
|  Amount Due: Rs. 1,707                                  |
|                                                         |
|  Payment Method:                                        |
|  +-------------+  +-------------+  +-------------+     |
|  |             |  |             |  |             |     |
|  |    CASH     |  |     UPI     |  |    CARD     |     |
|  |   [icon]    |  |   [icon]    |  |   [icon]    |     |
|  |             |  |             |  |             |     |
|  +-------------+  +-------------+  +-------------+     |
|                      (selected)                         |
|                                                         |
|  +-------------------------------------------------+   |
|  |                                                 |   |
|  |            [QR Code for UPI]                    |   |
|  |                                                 |   |
|  |         Scan to pay Rs. 1,707                   |   |
|  |                                                 |   |
|  |    Powered by Razorpay                          |   |
|  |                                                 |   |
|  +-------------------------------------------------+   |
|                                                         |
|  Waiting for payment confirmation...                    |
|  (Auto-updates via webhook)                             |
|                                                         |
|  [Send Payment Link via WhatsApp]                       |
|                                                         |
|  --- OR ---                                             |
|                                                         |
|  Amount Received: [Rs. 1,707____]                       |
|  [      Record Cash Payment      ]                      |
|                                                         |
+---------------------------------------------------------+
```

### 8d. Quick Sale (Counter Sale / POS)

```
+=========================================================+
|  <  Quick Sale                                          |
+---------------------------------------------------------+
|                                                         |
|  Scan or search to add items:                           |
|  [Scan Barcode]  [Search: ___________________]          |
|                                                         |
|  Cart:                                                  |
|  +---------------------------------------------------+  |
|  | Cephalexin 500mg                                  |  |
|  | Rs. 18 x  [-] [14] [+]            Rs. 252   [x]  |  |
|  +---------------------------------------------------+  |
|  | Dog Shampoo (Medicated)                           |  |
|  | Rs. 350 x [-] [ 1] [+]            Rs. 350   [x]  |  |
|  +---------------------------------------------------+  |
|  | Disposable Gloves (M)                             |  |
|  | Rs. 5 x  [-] [ 2] [+]             Rs.  10   [x]  |  |
|  +---------------------------------------------------+  |
|                                                         |
|  Customer (optional): [Search owner___________]         |
|                                                         |
+---------------------------------------------------------+
|  Items: 3                                               |
|  Subtotal: Rs. 612                                      |
|  GST:      Rs.  55                                      |
|  Total:    Rs. 667                                      |
|                                                         |
|  [       Generate Invoice       ]                       |
+---------------------------------------------------------+
```

### 8e. Invoice PDF (Generated)

```
+=========================================================+
|                                                         |
|  +---------------------------------------------------+  |
|  |  BREEYO VET CLINIC                                |  |
|  |  42 MG Road, Bangalore 560001                     |  |
|  |  GSTIN: 29AABCU9603R1ZM                           |  |
|  |  Ph: +91 98765xxxxx                               |  |
|  +---------------------------------------------------+  |
|  |  TAX INVOICE                                      |  |
|  |  Invoice No: INV-2026-0089                        |  |
|  |  Date: 15 Jul 2026                                |  |
|  |  Due: 22 Jul 2026                                 |  |
|  +---------------------------------------------------+  |
|  |  Bill To:                                         |  |
|  |  Priya Sharma | +91 98765xxxxx                    |  |
|  |  Pet: Bruno (Labrador)                            |  |
|  +---------------------------------------------------+  |
|  |  # | Description        | HSN  | Qty | Amount    |  |
|  |  --+--------------------+------+-----+---------   |  |
|  |  1 | Consultation       | 9983 |  1  |    500    |  |
|  |  2 | Skin Scraping      | 9983 |  1  |    300    |  |
|  |  3 | Cephalexin 500mg   | 3004 | 14  |    252    |  |
|  |  4 | Prednisolone 5mg   | 3004 |  5  |     45    |  |
|  |  5 | Med. Shampoo       | 3307 |  1  |    350    |  |
|  +---------------------------------------------------+  |
|  |  Subtotal:                         Rs. 1,447      |  |
|  |  CGST (9%):                        Rs.   130      |  |
|  |  SGST (9%):                        Rs.   130      |  |
|  |  TOTAL:                            Rs. 1,707      |  |
|  +---------------------------------------------------+  |
|  |  Payment Status: PAID (UPI - 15 Jul 2026)         |  |
|  +---------------------------------------------------+  |
|                                                         |
|  [Print]  [Share PDF]  [Send via WhatsApp]              |
+---------------------------------------------------------+
```

---

## 9. WhatsApp Communication

### 9a. Staff Inbox

```
+=========================================================+
|  WhatsApp                                               |
+---------------------------------------------------------+
|  Filter: [All] [Needs Action] [Reminders] [Bookings]   |
|                                                         |
|  +---------------------------------------------------+  |
|  | [o] Priya Sharma              2 min ago           |  |
|  |     +91 98765xxxxx                                |  |
|  |     "I'd like to book for Bruno's checkup"        |  |
|  |     [BOOKING REQUEST]                   [!]       |  |
|  +---------------------------------------------------+  |
|  | Vikram Singh                  15 min ago           |  |
|  |     +91 99887xxxxx                                |  |
|  |     Invoice INV-2026-0084 sent                    |  |
|  |     [DELIVERED]                                    |  |
|  +---------------------------------------------------+  |
|  | Anita Desai                   1 hour ago           |  |
|  |     +91 98234xxxxx                                |  |
|  |     Vaccination reminder sent                     |  |
|  |     [DELIVERED]                                    |  |
|  +---------------------------------------------------+  |
|  | Raj Patel                     3 hours ago          |  |
|  |     +91 97654xxxxx                                |  |
|  |     Reminder delivery failed                      |  |
|  |     [FAILED]                              [!]     |  |
|  +---------------------------------------------------+  |
|                                                         |
+---------------------------------------------------------+
|  Queue  | Patients | Inventory | Billing  | WhatsApp    |
+=========================================================+

[o] = Needs action indicator (orange dot)
[!] = Requires staff attention
```

### 9b. Conversation Thread

```
+=========================================================+
|  <  Priya Sharma                        +91 98765xxxxx  |
+---------------------------------------------------------+
|                                                         |
|  Today, 10:00 AM                                        |
|                                                         |
|              +------------------------------------+     |
|              | Hi Priya! Bruno's DHPP             |     |
|              | vaccination is due on 20 Jul.      |     |
|              | Would you like to book?            |     |
|              |                                    |     |
|              | Reply BOOK to schedule             |     |
|              +------------------------------------+     |
|                                         [Delivered]     |
|                                                         |
|  +------------------------------------+                 |
|  | Yes, I'd like to book for          |                 |
|  | Bruno's checkup next week          |                 |
|  +------------------------------------+                 |
|  [Received 10:02 AM]                                    |
|                                                         |
|              +------------------------------------+     |
|              | Great! Available slots for next     |     |
|              | week:                               |     |
|              |                                    |     |
|              | Mon 21 Jul: 10 AM, 2 PM, 4 PM     |     |
|              | Tue 22 Jul: 10 AM, 11 AM, 3 PM    |     |
|              |                                    |     |
|              | Reply with your preferred time     |     |
|              +------------------------------------+     |
|                                         [Delivered]     |
|                                                         |
+---------------------------------------------------------+
|  [Send Template v]    [Type message...    ]    [Send]   |
+---------------------------------------------------------+
```

### 9c. Template Send Bottom Sheet

```
+=========================================================+
|  (Triggered from Invoice Detail, Pet Profile, etc.)     |
+---------------------------------------------------------+
|  -------- [drag handle] --------                        |
|                                                         |
|  Send via WhatsApp                                      |
|                                                         |
|  To: Priya Sharma (+91 98765xxxxx)                      |
|                                                         |
|  Template: [Invoice Delivery  v]                        |
|                                                         |
|  Preview:                                               |
|  +---------------------------------------------------+  |
|  | Hi Priya,                                         |  |
|  |                                                   |  |
|  | Here's your invoice from Breeyo Vet Clinic:       |  |
|  |                                                   |  |
|  | Invoice: INV-2026-0089                            |  |
|  | Amount: Rs. 1,707                                 |  |
|  | Date: 15 Jul 2026                                 |  |
|  |                                                   |  |
|  | Pay now: https://pay.breeyo.in/inv/abc123         |  |
|  |                                                   |  |
|  | Thank you for choosing Breeyo Vet Clinic!         |  |
|  +---------------------------------------------------+  |
|                                                         |
|  Available templates:                                   |
|  - Invoice Delivery                                     |
|  - Vaccination Reminder                                 |
|  - Deworming Reminder                                   |
|  - Appointment Confirmation                             |
|  - Follow-up Reminder                                   |
|                                                         |
|  [          Send Template          ]                    |
+---------------------------------------------------------+
```

### 9d. WhatsApp Booking Flow (Simulated)

```
  Owner's WhatsApp                    Staff View
+---------------------------+     +---------------------------+
| Breeyo Vet Clinic         |     | Booking Request           |
|                           |     +---------------------------+
| [Bot] Hi Priya!           |     | Owner: Priya Sharma       |
| Bruno's DHPP is due.      |     | Pet: Bruno (Labrador)     |
| Reply BOOK to schedule.   |     | Reason: DHPP Vaccination  |
|                           |     |                           |
| [Priya] BOOK              |     | Requested: Mon 21 Jul     |
|                           |     |            10:00 AM       |
| [Bot] Available slots:    |     |                           |
| Mon 21: 10AM, 2PM, 4PM   |     | Status: [PENDING]         |
| Tue 22: 10AM, 11AM, 3PM  |     |                           |
| Reply with day & time.    |     | [Confirm] [Suggest Alt.]  |
|                           |     |           [Decline]       |
| [Priya] Monday 10 AM     |     |                           |
|                           |     | After staff confirms:     |
| [Bot] Confirmed!          |     | -> Appointment created    |
| Bruno: Mon 21 Jul, 10 AM |     | -> Shows in calendar      |
| at Breeyo Vet Clinic.    |     | -> Reminder auto-scheduled|
| We'll remind you a day   |     |                           |
| before.                  |     |                           |
+---------------------------+     +---------------------------+
```

---

## 10. Scheduling & Calendar

### 10a. Mobile Day Agenda

```
+=========================================================+
|  <  Schedule                 [Today: Mon 21 Jul]  [+]   |
+---------------------------------------------------------+
|  [<]  Mon 21  |  Tue 22  |  Wed 23  |  Thu 24  [>]     |
+---------------------------------------------------------+
|                                                         |
|  09:00                                                  |
|  +---------------------------------------------------+  |
|  | Bruno (Labrador) - DHPP Vaccination               |  |
|  | Owner: Priya Sharma | Booked via WhatsApp         |  |
|  | [CONFIRMED]                      [Check In]       |  |
|  +---------------------------------------------------+  |
|                                                         |
|  10:00  (Open)                                          |
|                                                         |
|  11:00                                                  |
|  +---------------------------------------------------+  |
|  | Milo (Persian Cat) - Grooming                     |  |
|  | Owner: Raj Patel | Booked by front desk           |  |
|  | [CONFIRMED]                      [Check In]       |  |
|  +---------------------------------------------------+  |
|                                                         |
|  12:00  (Open)                                          |
|  13:00  (Lunch Break)                                   |
|                                                         |
|  14:00                                                  |
|  +---------------------------------------------------+  |
|  | Rocky (German Shepherd) - Follow-up               |  |
|  | Owner: Anita Desai | Booked by clinic             |  |
|  | [EXPECTED]                       [Check In]       |  |
|  +---------------------------------------------------+  |
|                                                         |
|  15:00  (Open)                                          |
|  16:00  (Open)                                          |
|  17:00  (Open)                                          |
|                                                         |
+---------------------------------------------------------+

Tap [Check In] -> Patient enters walk-in queue as WAITING
Scheduled patients show as [EXPECTED] in queue until checked in
```

### 10b. Web Week View

```
+=========================================================+
|  Schedule - Week of 21 Jul 2026                [+ New]  |
+---------------------------------------------------------+
|       | Mon 21 | Tue 22 | Wed 23 | Thu 24 | Fri 25 |   |
| Time  |        |        |        |        |        |   |
+-------+--------+--------+--------+--------+--------+   |
| 09:00 | Bruno  |        | Coco   |        |        |   |
|       | DHPP   |        | Dental |        |        |   |
+-------+--------+--------+--------+--------+--------+   |
| 10:00 |        | Luna   |        |        | Tommy  |   |
|       |        | Spay   |        |        | Checkup|   |
+-------+--------+--------+--------+--------+--------+   |
| 11:00 | Milo   |        |        | Bella  |        |   |
|       | Groom  |        |        | Vaccine|        |   |
+-------+--------+--------+--------+--------+--------+   |
| 12:00 |        |        |        |        |        |   |
| 13:00 |==LUNCH=|==LUNCH=|==LUNCH=|==LUNCH=|==LUNCH=|   |
+-------+--------+--------+--------+--------+--------+   |
| 14:00 | Rocky  |        |        |        |        |   |
|       | Follow |        |        |        |        |   |
+-------+--------+--------+--------+--------+--------+   |
| 15:00 |        |        | Max    |        |        |   |
|       |        |        | Surgery|        |        |   |
+-------+--------+--------+--------+--------+--------+   |

Click any cell -> Quick appointment drawer opens
Real-time updates via Socket.IO
```

---

## 11. Web Dashboard

### 11a. Dashboard Home (Cockpit)

```
+------------------+--------------------------------------------------+
|                  |  Home                              [Dr. Sharma]  |
|  [Breeyo Logo]   |                                                  |
|                  +--------------------------------------------------+
|  > Home          |                                                  |
|  > Queue Board   |  +--------------------+  +--------------------+  |
|  > Schedule      |  | Queue Now          |  | Today's Revenue    |  |
|  > Inventory     |  |                    |  |                    |  |
|  > Billing       |  | In Consult: 1      |  | Rs. 8,450          |  |
|  > Users & Roles |  | Waiting: 3         |  | 12 patients seen   |  |
|  > Settings      |  | Done: 5            |  | 3 unpaid           |  |
|                  |  |                    |  |                    |  |
|                  |  | [Open Queue]       |  | [Open Billing]     |  |
|  [Clinic Name]   |  +--------------------+  +--------------------+  |
|  [User Avatar]   |                                                  |
|                  |  +--------------------+  +--------------------+  |
|                  |  | Stock Alerts       |  | Schedule Today     |  |
|                  |  |                    |  |                    |  |
|                  |  | 8 items low stock  |  | 3 appointments     |  |
|                  |  | 3 expiring soon    |  | Next: Bruno 09:00  |  |
|                  |  | 1 expired          |  |                    |  |
|                  |  |                    |  |                    |  |
|                  |  | [Review Alerts]    |  | [Open Schedule]    |  |
|                  |  +--------------------+  +--------------------+  |
|                  |                                                  |
|                  |  +--------------------------------------------+  |
|                  |  | Recent Activity                            |  |
|                  |  |                                            |  |
|                  |  | 10:45 - Coco checked in (walk-in)          |  |
|                  |  | 10:31 - Rocky checked in (emergency)       |  |
|                  |  | 10:24 - Milo checked in (walk-in)          |  |
|                  |  | 10:15 - Bruno consultation started         |  |
|                  |  | 09:45 - Luna consultation completed        |  |
|                  |  +--------------------------------------------+  |
|                  |                                                  |
+------------------+--------------------------------------------------+
```

### 11b. Web Queue Board

```
+------------------+--------------------------------------------------+
|                  |  Queue Board                    [Call Next]      |
|  Sidebar         |                                                  |
|                  +--------------------------------------------------+
|                  |                                                  |
|                  |  IN CONSULT                                      |
|                  |  +--------------------------------------------+  |
|                  |  | Bruno (Labrador) | Priya Sharma            |  |
|                  |  | Vaccination | Started 10:15 AM | 30 min    |  |
|                  |  |                            [Mark Done]     |  |
|                  |  +--------------------------------------------+  |
|                  |                                                  |
|                  |  WAITING (3)                                     |
|                  |  +----+------------------------------------------+
|                  |  | #1 | Milo (Cat) | Raj Patel | Checkup      | |
|                  |  |    | Checked in 10:24 | ~15 min wait       | |
|                  |  |    |            [Start Consult] [No-Show]  | |
|                  |  +----+------------------------------------------+
|                  |  | #2 | Rocky (Shepherd) | Anita | Emergency  | |
|                  |  |    | Checked in 10:31 | ~25 min wait  [!]  | |
|                  |  |    |            [Start Consult] [No-Show]  | |
|                  |  +----+------------------------------------------+
|                  |  | #3 | Coco (Indie) | Vikram | Skin Issue    | |
|                  |  |    | Checked in 10:45 | ~35 min wait       | |
|                  |  |    |            [Start Consult] [No-Show]  | |
|                  |  +----+------------------------------------------+
|                  |                                                  |
|                  |  DONE TODAY (5)                    [See All]     |
|                  |  Luna, Tommy, Bella, Max, Simba                 |
|                  |                                                  |
+------------------+--------------------------------------------------+

Live updates via Socket.IO - same data as mobile
Stale-state prompt if browser loses connection
```

### 11c. User & Role Management

```
+------------------+--------------------------------------------------+
|                  |  Users & Roles                     [+ Invite]   |
|  Sidebar         |                                                  |
|                  +--------------------------------------------------+
|                  |                                                  |
|                  |  +------+-------------+----------+--------+---+  |
|                  |  | Name | Email       | Role     | Status |   |  |
|                  |  +------+-------------+----------+--------+---+  |
|                  |  | Dr. Priya | priya@ | Admin    | Active | E |  |
|                  |  | Dr. Raj   | raj@   | Clinician| Active | E |  |
|                  |  | Anita     | anita@ | FrontDesk| Active | E |  |
|                  |  | Mohan     | mohan@ | InvMgr   | Active | E |  |
|                  |  | Suresh    | suresh@| FrontDesk| Invited| x |  |
|                  |  +------+-------------+----------+--------+---+  |
|                  |                                                  |
|                  |  [E] = Edit role/permissions                     |
|                  |  [x] = Revoke invitation                        |
|                  |                                                  |
|                  +--------------------------------------------------+
|                  |  Invite New Staff                                |
|                  |                                                  |
|                  |  Name:  [_________________]                     |
|                  |  Email: [_________________]                     |
|                  |  Phone: [_________________]                     |
|                  |  Role:  [Front Desk  v   ]                      |
|                  |                                                  |
|                  |  Permission Overrides:                           |
|                  |  [ ] Can view billing                           |
|                  |  [ ] Can manage inventory                       |
|                  |  [ ] Can access WhatsApp inbox                  |
|                  |                                                  |
|                  |  [     Send Invitation     ]                     |
+------------------+--------------------------------------------------+
```

---

## 12. Owner Portal (No Login Required)

### 12a. Portal Landing (via Magic Link)

```
  Owner receives WhatsApp:
  "View Bruno's records: https://portal.breeyo.in/p/abc123def"

+=========================================================+
|  [Breeyo Logo]              Breeyo Vet Clinic           |
+---------------------------------------------------------+
|                                                         |
|  Hi Priya,                                              |
|  Here are the records for your pets at                  |
|  Breeyo Vet Clinic.                                     |
|                                                         |
|  Your Pets:                                             |
|  +---------------------------------------------------+  |
|  | [Avatar] Bruno (Labrador Retriever)               |  |
|  |          3 years | Male | 28 kg                   |  |
|  |          Last visit: 15 Jul 2026                  |  |
|  +---------------------------------------------------+  |
|  | [Avatar] Milo (Persian Cat)                       |  |
|  |          2 years | Male | 4.5 kg                  |  |
|  |          Last visit: 10 Jul 2026                  |  |
|  +---------------------------------------------------+  |
|                                                         |
|  Outstanding Invoices:                                  |
|  +---------------------------------------------------+  |
|  | INV-2026-0089 | 15 Jul | Rs. 1,707    [Pay Now]   |  |
|  +---------------------------------------------------+  |
|                                                         |
|  Upcoming Care:                                         |
|  +---------------------------------------------------+  |
|  | Bruno - DHPP Vaccination due 20 Jul 2026          |  |
|  | Milo - Deworming due 15 Aug 2026                  |  |
|  +---------------------------------------------------+  |
|                                                         |
|  Next Appointment:                                      |
|  Mon 21 Jul 2026 at 09:00 AM - Bruno (DHPP)            |
|                                                         |
+---------------------------------------------------------+
|  Contact: Breeyo Vet Clinic | +91 98765xxxxx           |
|  Link expires in 7 days                                 |
+---------------------------------------------------------+
```

### 12b. Pet Records View (Owner Portal)

```
+=========================================================+
|  [Breeyo Logo]     Bruno's Records                      |
+---------------------------------------------------------+
|                                                         |
|  Bruno (Labrador Retriever)                             |
|  3 years | Male | 28 kg                                 |
|                                                         |
|  Visit History:                                         |
|                                                         |
|  +---------------------------------------------------+  |
|  | 15 Jul 2026 - Vaccination                         |  |
|  |                                                   |  |
|  | Diagnosis: Routine vaccination (DHPP not due,     |  |
|  |            Rabies administered)                    |  |
|  |                                                   |  |
|  | Medications:                                      |  |
|  | - None prescribed                                 |  |
|  |                                                   |  |
|  | Next due: Rabies - 15 Jul 2027                    |  |
|  +---------------------------------------------------+  |
|  | 01 Jul 2026 - General Checkup                     |  |
|  |                                                   |  |
|  | Diagnosis: Allergic dermatitis (environmental)    |  |
|  |                                                   |  |
|  | Medications:                                      |  |
|  | - Cephalexin 500mg (twice daily, 7 days)          |  |
|  |   Give with food, complete full course            |  |
|  | - Prednisolone 5mg (once daily, 5 days)           |  |
|  |   With food                                       |  |
|  | - Medicated shampoo bath (2x/week)                |  |
|  |                                                   |  |
|  | Recheck: 10 days                                  |  |
|  +---------------------------------------------------+  |
|                                                         |
|  Note: Full clinical details (vitals, SOAP notes,       |
|  internal assessments) are visible only to clinic staff. |
|                                                         |
+---------------------------------------------------------+
```

### 12c. Owner Invoice Payment

```
+=========================================================+
|  [Breeyo Logo]     Invoice Payment                      |
+---------------------------------------------------------+
|                                                         |
|  Invoice: INV-2026-0089                                 |
|  Date: 15 Jul 2026                                      |
|  Pet: Bruno (Labrador)                                  |
|                                                         |
|  +---------------------------------------------------+  |
|  | Consultation (General)              Rs.    500    |  |
|  | Skin Scraping Test                  Rs.    300    |  |
|  | Cephalexin 500mg x14               Rs.    252    |  |
|  | Prednisolone 5mg x5                Rs.     45    |  |
|  | Medicated Shampoo x1               Rs.    350    |  |
|  +---------------------------------------------------+  |
|  | Subtotal                            Rs.  1,447    |  |
|  | CGST (9%)                           Rs.    130    |  |
|  | SGST (9%)                           Rs.    130    |  |
|  +---------------------------------------------------+  |
|  | TOTAL                               Rs.  1,707    |  |
|  +---------------------------------------------------+  |
|                                                         |
|  [            Pay Invoice - Rs. 1,707           ]       |
|                                                         |
|  (Redirects to Razorpay secure payment page)            |
|  Accepts UPI and Card                                   |
|                                                         |
|  --- After payment ---                                  |
|                                                         |
|  +---------------------------------------------------+  |
|  |  Payment Successful!                              |  |
|  |  Rs. 1,707 paid via UPI                           |  |
|  |  Transaction ID: pay_LmN0p1q2R3s4                 |  |
|  |                                                   |  |
|  |  [Download Receipt]  [Back to Portal]             |  |
|  +---------------------------------------------------+  |
|                                                         |
+---------------------------------------------------------+
```

---

## 13. Offline Mode

### 13a. Offline Banner & Behavior

```
+=========================================================+
| [!] You're offline. Changes will sync when connected.   |
+---------------------------------------------------------+
|                                                         |
|  Walk-in Queue                    [Call Next] [+ Check In] |
|                                                         |
|  (Queue data from last sync shown)                      |
|  (Check-ins still work - queued locally)                |
|  (Status changes still work - queued locally)           |
|                                                         |
|  +---------------------------------------------------+  |
|  | IN CONSULT (1)                                    |  |
|  | Bruno (Labrador) - Priya Sharma       10:15 AM   |  |
|  +---------------------------------------------------+  |
|  | WAITING (3)                                       |  |
|  | #1 Milo | #2 Rocky [!] | #3 Coco                 |  |
|  +---------------------------------------------------+  |
|                                                         |
+---------------------------------------------------------+

Offline-capable actions:
  - Check in patients (queued in SQLite)
  - Scan barcodes (queued in SQLite)
  - Take clinical notes (saved as draft locally)
  - View cached patient records

NOT available offline:
  - Payment processing
  - WhatsApp messaging
  - Real-time queue updates from other devices
  - New patient registration (needs server-side ID)
```

### 13b. Sync & Conflict Resolution

```
+=========================================================+
|  [Syncing... 3 pending actions]                         |
+---------------------------------------------------------+
|                                                         |
|  Sync Queue:                                            |
|  +---------------------------------------------------+  |
|  | [OK] Check-in: Milo (10:24 AM)        Synced     |  |
|  | [OK] Check-in: Rocky (10:31 AM)        Synced     |  |
|  | [!!] Note: Bruno consultation      Conflict       |  |
|  +---------------------------------------------------+  |
|                                                         |
|  Conflict Resolution:                                   |
|  +---------------------------------------------------+  |
|  | Bruno - Consultation Notes                        |  |
|  |                                                   |  |
|  | Your version (offline):                           |  |
|  | "Skin rash observed on belly..."                  |  |
|  |                                                   |  |
|  | Server version (Dr. Raj):                         |  |
|  | "Allergic dermatitis, prescribed..."              |  |
|  |                                                   |  |
|  | [Keep Mine] [Keep Server] [Merge Both]            |  |
|  +---------------------------------------------------+  |
|                                                         |
+---------------------------------------------------------+
```

---

## 14. End-to-End Flow: A Full Clinic Day

This shows how all modules connect in a typical day for Dr. Priya, a solo vet.

```
MORNING SETUP
=============

  Dr. Priya opens app
         |
         v
  +------------------+
  |  Queue (Home)    |    <-- Empty queue, onboarding card if new clinic
  |  0 waiting       |
  +--------+---------+
           |
           v
  Check scheduled appointments for today
  (Bruno at 09:00, Milo at 11:00, Rocky at 14:00)


FIRST WALK-IN (09:15 AM)
========================

  Pet owner walks in with cat "Whiskers"
         |
         v
  +------------------+        +------------------+
  | Quick Check-In   |  new   | Register Patient |
  | Search: "Whisk"  +------->| Step 1: Owner    |
  | No results       |  pet   | Step 2: Pet      |
  +------------------+        | [x] Auto check-in|
                               +--------+---------+
                                        |
                                        v
                               Queue: Whiskers #1 [WAITING]


SCHEDULED PATIENT ARRIVES (09:00 AM)
====================================

  Bruno's appointment was at 09:00
         |
         v
  +------------------+
  | Schedule Screen  |
  | Bruno 09:00      |
  | [Check In]       |    <-- 1 tap to move to queue
  +--------+---------+
           |
           v
  Queue: Bruno [WAITING] (was EXPECTED)


START CONSULTATION
==================

  Dr. Priya taps "Call Next" on queue
         |
         v
  Bruno moves to [IN CONSULT]
         |
         v
  +------------------+
  | Consultation     |
  | Patient: Bruno   |
  +------------------+
  |                  |
  | Record vitals    |    Weight, temp, HR, RR
  | Dictate notes    |    Voice-to-text -> Subjective
  | Clinical exam    |    Body system checklist -> Objective
  | Diagnosis        |    Quick picks + text -> Assessment
  | Treatment plan   |    Prescriptions + instructions -> Plan
  | Add Rx           |    Drug search -> dosage -> add
  | Attach photo     |    Camera -> skin_photo.jpg
  |                  |
  | [End Consult]    |
  +--------+---------+
           |
           v
  +------------------+
  | Review & Finalize|    <-- Summary of all sections
  | [Confirm]        |
  +--------+---------+
           |
           v
  Bruno moves to [DONE] in queue
  Inventory auto-deducted (FIFO) for dispensed drugs


GENERATE INVOICE
================

         |
         v
  +------------------+
  | Invoice Builder  |    <-- Auto-populated from consultation
  |                  |
  | Services:        |    Consultation Rs.500, Skin scraping Rs.300
  | Products:        |    Cephalexin x14, Prednisolone x5, Shampoo x1
  | GST calculated   |    CGST + SGST auto-applied
  |                  |
  | [Finalize]       |
  +--------+---------+
           |
           v
  +------------------+
  | Collect Payment  |
  |                  |
  | [UPI QR Code]    |    <-- Owner scans, Razorpay processes
  |                  |    <-- Webhook confirms -> Invoice [PAID]
  | -- OR --         |
  | [Cash]           |
  | [Card]           |
  +--------+---------+
           |
           v
  +------------------+
  | Send via WhatsApp|    <-- Invoice PDF + payment receipt
  +--------+---------+


AUTOMATED FOLLOW-UPS
====================

           |
           v
  System schedules:
  - Vaccination reminder (DHPP due 20 Jul) via WhatsApp
  - Follow-up reminder (10 days) via WhatsApp
  - Deworming reminder (next due date) via WhatsApp


COUNTER SALE (Walk-in purchase, no consultation)
================================================

  Owner walks in to buy dog food
         |
         v
  +------------------+
  | Quick Sale       |
  | Scan barcode     |    <-- Camera scans product
  | Add to cart      |
  | [Generate Inv]   |    <-- No consultation needed
  +--------+---------+
           |
           v
  Payment + receipt


INVENTORY CHECK (End of Day)
============================

  Inventory manager checks stock
         |
         v
  +------------------+
  | Inventory List   |
  | Attention: 8 low |    <-- Par-level alerts
  +--------+---------+
           |
           v
  +------------------+
  | Want List        |    <-- Auto-generated reorder list
  | [Share WhatsApp] |    <-- Send to supplier
  | [Export CSV]     |
  +------------------+


ADMIN REVIEWS ON WEB (Evening)
==============================

  Dr. Priya opens web dashboard
         |
         v
  +------------------+
  | Dashboard Home   |
  |                  |
  | Revenue: Rs.8.4K |
  | Patients: 12     |
  | Unpaid: 3        |
  | Stock alerts: 8  |
  +------------------+
         |
         +---> Billing: Review unpaid invoices
         +---> Inventory: Approve want-list orders
         +---> Users: Check staff permissions
         +---> Schedule: Plan tomorrow's appointments


PET OWNER AT HOME (Evening)
============================

  Priya Sharma gets WhatsApp message with portal link
         |
         v
  +------------------+
  | Owner Portal     |    <-- No login, tokenised link
  |                  |
  | Bruno's records  |    <-- Diagnosis + prescriptions only
  | Milo's records   |    <-- Clinical notes NOT shown
  |                  |
  | Upcoming care:   |    <-- DHPP due, deworming due
  | Next appointment |    <-- Mon 21 Jul 09:00
  |                  |
  | Outstanding:     |
  | [Pay Rs. 1,707]  |    <-- UPI payment via Razorpay
  +------------------+
```

---

## Feature Checklist Summary

```
+----------------------------------+--------+----------+
| Feature                          | Mobile |   Web    |
+----------------------------------+--------+----------+
| Sign up / Login / OTP            |   Y    |    -     |
| Clinic setup wizard              |   Y    |    -     |
| Walk-in queue (real-time)        |   Y    |    Y     |
| Patient registration             |   Y    |    -     |
| Patient search (trigram)         |   Y    |    -     |
| Pet profile + visit history      |   Y    |    -     |
| CSV bulk import                  |   Y    |    -     |
| SOAP notes consultation         |   Y    |    -     |
| Voice-to-text dictation          |   Y    |    -     |
| Prescriptions                    |   Y    |    -     |
| Vaccination/deworming tracking   |   Y    |    -     |
| File attachments (lab/imaging)   |   Y    |    -     |
| Medical history timeline         |   Y    |    -     |
| PDF generation (4 templates)     |   Y    |    -     |
| Inventory list + search          |   Y    |    Y     |
| Barcode scanner                  |   Y    |    -     |
| Stock receipt (batch/lot/expiry) |   Y    |    Y     |
| FIFO dispensing                  |   Y    |    Y     |
| Par-level alerts                 |   Y    |    Y     |
| Want list + WhatsApp share       |   Y    |    Y     |
| Stock take                       |   Y    |    -     |
| Invoice builder (GST)            |   Y    |    Y     |
| Payment collection (UPI/Card)    |   Y    |    Y     |
| Quick sale (counter POS)         |   Y    |    -     |
| WhatsApp inbox                   |   Y    |    -     |
| WhatsApp templates               |   Y    |    -     |
| WhatsApp booking flow            |   Y    |    -     |
| Scheduling (day view)            |   Y    |    -     |
| Scheduling (week view)           |   -    |    Y     |
| Push notifications               |   Y    |    -     |
| Dashboard cockpit                |   -    |    Y     |
| User & role management           |   -    |    Y     |
| Clinic settings                  |   -    |    Y     |
| Owner portal (magic link)        |   -    |    Y     |
| Offline check-in                 |   Y    |    -     |
| Offline barcode scanning         |   Y    |    -     |
| Offline note-taking              |   Y    |    -     |
| Conflict resolution              |   Y    |    -     |
+----------------------------------+--------+----------+
```

---

*Document created: 03 Aug 2026*
*Based on: Breeyo ROADMAP.md, REQUIREMENTS.md, PROJECT.md, and Phase UI-SPEC documents*
