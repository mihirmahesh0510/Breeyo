# Receptionist Rekha — Proto-Persona

**Role:** Front Desk
**Persona Type:** Secondary
**Last Updated:** 2026-08-03
**Confidence:** MEDIUM

---

### Name
- Receptionist Rekha Sharma

### Bio & Demographics
- **Age:** 27
- **Location:** Pune, Maharashtra (commutes 30 minutes by auto-rickshaw to Dr. Priya's clinic from a nearby residential colony)
- **Social status:** Lower-middle class. Unmarried, lives with parents. This is her second job after working as a receptionist at a dental clinic for 2 years. Monthly salary ~15,000-18,000 INR
- **Online presence:** Heavy WhatsApp user (family groups, friend groups, shopping groups). Active on Instagram Reels and YouTube Shorts. Uses Google Pay for personal transactions. Comfortable with smartphone apps but has never used business/enterprise software. Does not own a laptop
- **Leisure activities:** Watching Hindi serials with family, WhatsApp video calls with cousins, occasional mall visits on Sundays. Enjoys Bollywood music and shares reels
- **Career status:** Completed B.Com from a local college. Chose clinic reception work because it is close to home, has predictable hours, and involves interacting with pet owners (she likes animals). No veterinary training; her role is purely administrative

### Quotes
- "Mornings are the worst. Five people walk in at once, everyone wants to go first, and I'm trying to remember if that Labrador came last week or last month."
- "Doctor keeps asking me to check the old register for a patient's last visit. I have to flip through 3 registers to find one entry. By then the owner is getting impatient."
- "I wish I could just type the phone number and everything about the owner and their pets would come up. Right now I write the same name and address every single visit."

### Pains
- **Walk-in chaos during peak hours.** Between 10 AM and 1 PM, 8-12 pet owners arrive in a 90-minute window. There is no formal queue -- owners cluster near the counter asking "How long?" and she has to verbally track who came first. Arguments about queue position happen 2-3 times per week
- **Returning patient lookup is slow and unreliable.** Patient records are in paper registers organized chronologically, not by name. Finding a returning patient means asking the owner "When did you last visit?" and then searching the approximate date range. If the owner does not remember, Rekha flips through pages for 5+ minutes or gives up and creates a duplicate entry
- **Duplicate data entry on every visit.** Even for returning patients, she re-writes owner name, phone number, pet name, and species on a new register line. This wastes time and introduces spelling inconsistencies that make future lookups harder
- **Billing is manual and slow at checkout.** After the consultation, the doctor tells her the services and drugs verbally. She writes an invoice by hand, calculates totals with a calculator, and sometimes makes arithmetic errors that the pet owner catches, causing embarrassment
- **No visibility into consultation status.** She cannot tell pet owners how long the wait will be because she does not know how far along the current consultation is. She walks to the consultation room door to check, which interrupts the doctor

### What is This Person Trying to Accomplish?
- Check in each walk-in patient in under 30 seconds, with returning patients auto-recognized by phone number
- Maintain a visible queue order that she can point to when owners ask "How long will it take?"
- Generate an accurate invoice at the end of each consultation without manual arithmetic
- Respond to WhatsApp messages from pet owners asking about clinic hours, vaccination schedules, or appointment availability
- Keep the waiting area calm by giving owners clear expectations about wait time and queue position

### Goals
- **Short-term:** Stop losing track of queue order during the morning rush; have a system that shows her who is next without relying on memory
- **Long-term:** Become the person who "runs the front" confidently -- handling check-ins, billing, and pet owner communication without constantly asking the doctor for information
- **Personal:** Avoid getting scolded by the doctor for lost records or billing errors; feel competent and valued at work

### Attitudes & Influences
- **Decision-Making Authority:** No -- she does not choose which software the clinic uses. Dr. Priya makes that decision. However, Rekha's comfort with the tool determines whether it actually gets used daily. If she finds it confusing, she will revert to paper within a week, and the entire system adoption fails
- **Decision Influencers:** Dr. Priya's instructions are the primary driver ("Doctor said use this, so I use it"). Peer validation from other clinic receptionists she knows helps reinforce adoption. YouTube tutorial videos in Hindi would help her learn faster than written documentation
- **Beliefs & Attitudes:** Willing to learn new tools if they visibly make her job easier on the first day. Has low tolerance for complexity -- if a screen has too many fields or the flow requires more than 3 taps, she will make mistakes under pressure. Trusts her phone more than a computer. Prefers visual cues (colors, icons) over text labels. Intimidated by English-heavy interfaces but can manage basic English terms (she uses Google Pay and WhatsApp in English)

### Breeyo Touchpoints
- **Features used most:** Walk-in queue board (Phase 3), patient registration with phone number lookup (Phase 3), quick check-in bottom sheet (Phase 3), invoice generation at checkout (Phase 6), WhatsApp inbox for owner messages (Phase 7), scheduling view for booked appointments (Phase 8)
- **Primary workflow:** Owner walks in -> Rekha opens queue screen -> taps "Check In" -> enters owner phone number -> system auto-fills returning patient info or she registers a new owner/pet -> patient appears in queue -> owner sits down. When doctor finishes consultation -> Rekha sees status change to "Done" -> generates invoice -> collects payment -> owner leaves
- **What success looks like:** The morning rush runs without a single "Who is next?" argument. She checks in a returning patient in 2 taps. She never has to flip through a paper register. The queue board on her phone shows live status so she can tell waiting owners "2 more before you" without guessing

### Assumptions to Validate [ASSUMPTION--VALIDATE]
- Front desk staff will consistently use the digital queue instead of reverting to verbal/memory-based tracking under pressure during peak hours
- Phone-number-based patient lookup is the right primary key for returning patient identification (vs. pet name, owner name, or a physical card/token)
- Front desk staff can operate the system on a shared clinic phone or their personal phone -- unclear which device model is realistic for this role
- Hindi language support is necessary for front desk adoption, or basic English UI with familiar patterns (WhatsApp-like) is sufficient
- The front desk role needs WhatsApp inbox access, or the doctor prefers to handle all owner communication personally
- A 22-27 year old with B.Com education and smartphone fluency can learn Breeyo's core check-in and billing flows in under 2 hours of guided use
