---
title: NoSQL Workshop Registrations User Guide
description: Persona-based user guide covering sign-in, dashboards, and step-by-step workflows for registrants, publishers, supervisors, speakers, and proctors
ms.date: 2026-11-02
---

## Overview

NoSQL Workshop Registrations is the event scheduling and registration portal for hands-on Cosmos DB and DocumentDB workshops. Attendees discover and register for sessions, publishers create and run events, supervisors oversee the publisher network, and speakers or proctors track their assigned sessions.

Every workflow in this guide is organized by persona, so jump straight to the section that matches your role.

The page's Back link returns to its parent workspace rather than replaying browser history. From Open Event, it returns to the Publisher Dashboard. From Manage Event, sessions, registrations, or event reports, it returns to that event's overview. Reloads, filters, and form submissions do not change this destination.

Success, error, and form-validation messages open in a popup. Select OK or press Escape to dismiss it; focus returns to the relevant control. Inline messages remain available for reference. Copy actions also report whether the clipboard operation succeeded.

## Index

* [Overview](#overview)
* [How the App Is Organized](#how-the-app-is-organized)
* [Personas at a Glance](#personas-at-a-glance)
* [Signing In](#signing-in)
* [Registrant Guide](#registrant-guide)
  * [Step 1: Find an Event](#step-1-find-an-event)
  * [Step 2: Register](#step-2-register)
  * [Step 3: Manage Your Registrations](#step-3-manage-your-registrations)
  * [Step 4: Submit Feedback](#step-4-submit-feedback)
* [Publisher Guide](#publisher-guide)
  * [Step 1: Sign In and Review the Dashboard](#step-1-sign-in-and-review-the-dashboard)
  * [Step 2: Create an Event](#step-2-create-an-event)
  * [Step 3: Work From the Event Overview](#step-3-work-from-the-event-overview)
  * [Step 4: Manage Event Details and Sharing](#step-4-manage-event-details-and-sharing)
  * [Step 5: Build the Session Grid](#step-5-build-the-session-grid)
  * [Step 6: Assign Speakers and Proctors](#step-6-assign-speakers-and-proctors)
  * [Step 7: Manage Registrations](#step-7-manage-registrations)
  * [Send App Credentials with Word Mail Merge](#send-app-credentials-with-word-mail-merge)
  * [Step 8: Review Reports and Feedback](#step-8-review-reports-and-feedback)
* [Supervisor Guide](#supervisor-guide)
* [Speaker and Proctor Guide](#speaker-and-proctor-guide)
* [Partner Guide](#partner-guide)
* [Managing Your Profile](#managing-your-profile)
* [Shared Event Access](#shared-event-access)
* [Admin and Notification Operations](#admin-and-notification-operations)
* [Troubleshooting](#troubleshooting)

## How the App Is Organized

The app is built around five roles: registrant, publisher, supervisor, speaker, and proctor. Each role signs in through the same login page and lands on a role-specific dashboard.

* Registrants browse and register for events on the public home page.
* Publishers create events, build the session agenda, assign speakers and proctors, and track registrations and feedback.
* Supervisors oversee the full event catalog across all publishers and manage publisher accounts.
* Speakers and proctors, collectively called facilitators, view the sessions they are assigned to.

## Personas at a Glance

| Persona | Login Credentials | Landing Page | Purpose |
|---|---|---|---|
| Registrant | Email and registration code | `/registrant/dashboard` | Discover events, register, download invites, submit feedback |
| Publisher | Approved Microsoft or partner account and password | `/publisher` | Create and run events end to end |
| Supervisor | Microsoft account and password | `/supervisor` | Oversee events and publisher accounts |
| Speaker | Email and password | `/facilitator/dashboard` | View assigned speaking sessions |
| Proctor | Email and password | `/facilitator/dashboard` | View assigned proctoring sessions |

## Signing In

Every persona signs in from a single page at `/login`.

1. Open `/login`. The page defaults to the publisher tab, but you can select any persona.
2. Registrants sign in with the email address used at registration and the registration code from their confirmation page or invite email.
3. Publishers, supervisors, speakers, and proctors sign in with the email and password issued to them.
4. A successful sign-in redirects to the persona's dashboard listed in the table above.

> [!NOTE]
> [!NOTE]
> Internal publisher sign-in is restricted to approved Microsoft accounts. Approved partner submitters receive a partner publisher account from a supervisor.

## Registrant Guide

Registrants are workshop attendees.

### Step 1: Find an Event

1. Open the home page.
2. Use the search box, date, location, delivery mode, time zone, and status filters to narrow the list.
3. Sort results by nearest upcoming schedule, freshness, or start time.
4. Select an event card to open its registration page.

Events a publisher marks as unlisted do not appear in this list. You can still register for an unlisted event if you have its direct link.

### Step 2: Register

1. Review the event description, date, time, and location shown on the registration page.
2. Fill in your name, email, organization, job role, country, and phone number.
3. Submit the form.
4. For an internal event, the confirmation page provides your registration code and calendar invite. For a partner event, your submission remains pending until a publisher approves it. The registration code and calendar invite become available after approval.

If you try to register twice with the same email, the form shows your existing registration code and a link to sign in as a registrant instead of creating a duplicate.

Partner events offer an optional, initially unchecked permission: "[Partner Name] may contact me with information about their products, services and events," with a link to that partner's privacy statement. Select your country to see the available permission option. Registration does not depend on opting in.

Partner contact permissions are not collected for China or Canada. Selecting either country hides, disables, and clears the permission checkbox without preventing event registration. Changing back to an eligible country does not restore a previous selection. Saved registration drafts never restore a partner opt-in; you must select it again.

This registration form does not collect Microsoft marketing contact permissions. Microsoft communications must remain related to the event, including any event-related follow-up.

### Step 3: Manage Your Registrations

1. Sign in at `/login` with persona set to registrant.
2. Your dashboard lists upcoming and ongoing registrations first, followed by past events.
3. Download the calendar invite again for any event directly from the dashboard.
4. Deregister from an event you can no longer attend, with an optional reason.

### Step 4: Submit Feedback

1. After an event ends, open the feedback link or scan the QR code shared by the publisher.
2. Check the displayed event date, choose one to five stars for the event, and indicate whether you would recommend it to others.
3. Optionally rate individual sessions in the session table. Use Previous and Next for longer agendas; ratings remain selected across pages. Use Clear to remove a session rating.
4. Answer whether you have an existing project, or are evaluating a new project, where you would like help. Choose No to submit without providing an email address. Comments are optional.
5. Choosing Yes immediately opens the project-help screen. Enter a valid email address (required), check Existing project, New project, or both, select one or more help types, and give permission for Microsoft to contact you about your request. Project context and the database account name are optional. Include your use case, current setup, challenges, help needed, and timeline if relevant. Use Back to change your ratings or decline help.
6. Submit the form. Publishers see one event response, its optional session ratings, project types, context, and all selected help types in their feedback report.

The compact feedback flow separates follow-up details from ratings and pages long session lists instead of adding a vertical scrolling list. Lab details and registered-email lookup remain available through the optional Lab details button, without cluttering the ratings screen.

## Publisher Guide

Publishers create, run, and analyze workshops.

### Step 1: Sign In and Review the Dashboard

1. Sign in at `/login` with persona set to publisher.
2. The Publisher Dashboard lists your events with status, mode, and time zone filters.
3. Use the scope tabs to switch between events you own and events shared with you by other publishers.
4. Select Create New Event to start a new workshop, or select an existing event to open it.

### Step 2: Create an Event

1. Set the title and a rich text description. The description editor supports bold, italic, bullet lists, and small or large text.
2. Set the schedule, time zone, delivery mode (virtual, in-person, or hybrid), and location details required for that mode.
3. Set the maximum seat count.
4. Optionally mark the event as unlisted to hide it from the public home page while keeping the direct registration link shareable.
5. Publish the event.

You can also duplicate an event you own from the dashboard to prefill a new event with the same details.

### Step 3: Work From the Event Overview

Opening an event shows a two-column overview.

* The left column shows status, mode, unlisted, and shared-access badges, plus clickable KPI cards for registrants, speakers, proctors, and feedback that jump straight to the matching report.
* For unlisted events, the left column also shows a copyable direct registration link.
* The right column lists quick actions: Session Grid, Manage Registrations, Speakers & Proctors, Organization Report, Feedback, Download Publisher Invite, Download Email List, and Manage Event.

### Step 4: Manage Event Details and Sharing

Manage Event is a separate page reached from the event overview, kept apart from the day-to-day workspace so it stays out of your way until you need it.

1. Update the event's title, description, schedule, location, capacity, or unlisted status, and notify participants of the change.
2. Configure the post-event follow-up email template, including an optional attachment.
3. Share the event with another publisher by email, choosing read access for viewing only or write access for managing attendance and sessions.
4. Cancel the event with a double confirmation (typed confirmation text and the event ID) if it will not run.

### Step 5: Build the Session Grid

1. Open Event Team & Sessions from the event overview.
2. On the Agenda tab, select Paste / Templates. The popup offers Azure DocumentDB and Azure Cosmos DB agendas from published, listed, non-canceled CET events. Each choice identifies its source event and date.
3. Choose a template or paste your own agenda. Review the editable text, Replace or Append option, and overall event duration, then select Import Pasted Agenda. Selecting a template alone does not change the saved agenda. People, event dates, credentials, and attachments are not copied.
4. Add breaks separately with Add Breaks, or add individual sessions and break rows. Times calculate from the target event's start time and each row's duration.
5. On Event Team, choose an existing person or enter a new person's name and email. Set availability for the entire event, selected sessions, or a custom time window.
6. Optionally select Speaker, Proctor, or both initial assignments for every available session. These full-day choices also apply to sessions created later.
7. Add Team Member and Send Invitation. New facilitators receive a password-setup link that expires after 24 hours; existing users keep their credentials.

### Step 6: Assign Speakers and Proctors

1. Open the Assign Sessions tab on Event Team & Sessions.
2. A team member has no permanent role. The same person can speak in one session and proctor another, or perform both roles in the same session.
3. Choose a team member, then choose Speaker, Proctor, or Speaker and Proctor. Available sessions are checked automatically. Uncheck rows you do not need, or use Select all.
4. Review the available and selected counts, then select Apply to Selected Sessions. A speaker assignment replaces the current speaker; proctor assignments retain existing proctors. Unavailable sessions cannot be selected.
5. For an individual session, choose its speaker, open Choose proctors, check the required people, and select that row's Save button. No Ctrl/Cmd multi-selection is needed.

### Step 7: Manage Registrations

1. Open Manage Registrations from the event overview. This workspace includes registration approvals, attendance, registration status, lab-access imports, and report downloads.
2. For partner events, review pending submissions and Approve or Reject each registrant. Approval generates their registration code and sends the registration email with a calendar invitation. Authorized partner event operators can do this; it is not restricted to Microsoft approvers.
3. Review the registered, attended, and deregistered counts.
4. Use De-register or Register to change an attendee's registration status independently from attendance.
5. Mark registered attendees as attended or not attended.
6. Download the current event's registration details as an Excel report.
7. Download the attendee list as a mail-merge CSV. This export contains approved, active registrations only.
8. From the Publisher Dashboard, select multiple events and download registration reports, organization registrant reports, or both in one Excel workbook.
9. Upload an Excel or CSV sign-in sheet to reconcile attendance in bulk. The app matches rows by email first, then uses unique name variations, and flags ambiguous or duplicate rows before you confirm the update. A matched deregistered attendee is labeled in the preview and is re-registered only when you confirm that selected row.
10. Upload a lab-access roster of up to 1,000 rows and 5 MB. Review the matches, then confirm within 30 minutes. Lab credentials remain on the server during preview instead of being embedded in the confirmation form.

### Send App Credentials with Word Mail Merge

1. Finish registration approvals, then select Download Email List (Mail Merge CSV). Export again if approvals or deregistrations change before sending.
2. Import the CSV into Excel using Data > From Text/CSV. Preserve RegistrationCode as text, retain the column headers, check the recipient count, and save a working `.xlsx` copy in an access-restricted location.
3. Open the supplied [mail merge for hols.docx](<./mail merge for hols.docx>) in desktop Word with an authorized work account. The supplied file is rights-protected. If opening, editing, or merging is blocked, request authorized access from its owner. Do not remove its protection.
4. Select Mailings > Start Mail Merge > E-mail Messages, then Select Recipients > Use an Existing List. Choose the current event's workbook and the sheet containing the exported headers, not an old recipient list saved with the template.
5. Use Insert Merge Field to replace unresolved template placeholders with actual export columns. Use Match Fields for standard name/address mappings where needed.
6. Map the greeting to FullName or FirstName, the app sign-in email to Email, the registration code to RegistrationCode, and the direct app link to RegistrantLoginLink. EventTitle, EventStartAt, EventEndAt, EventTimeZone, and Location supply the event details.
7. Use Edit Recipient List to verify the recipients. Pending, rejected, and deregistered people must not be added manually.
8. Select Preview Results and inspect multiple records. Each person's email, registration code, and access link must belong to the same row. Resolve every missing field before sending.
9. First select only your own approved test registration. Select Finish & Merge > Send E-mail Messages, set To to Email, enter the subject, choose HTML, and send Current record only. Check the delivered message and your test account's access link.
10. Recheck the selected approved recipients, then send the remaining selected records through a configured, MAPI-compatible desktop email application such as Outlook. Check Outbox, Sent Items, and delivery failures.

> [!CAUTION]
> The CSV and personalized links contain sign-in credentials. Never attach the full CSV, send another attendee's row, or merge a publisher/facilitator password. Attendees use their registered email and RegistrationCode, not a separate app password. This CSV does not include VM or Azure portal passwords; attendees view their own lab access in the app after provisioning. Word email merge does not attach calendar files; use the registration-approval invitation or a separate calendar message.

See [Microsoft's Word email-merge instructions](https://support.microsoft.com/en-us/word/use-mail-merge-in-word-to-send-bulk-email-messages) for supported desktop-mail configuration.

### Step 8: Review Reports and Feedback

1. Open Organization Report to see registration and attendance counts grouped by company. The Excel download contains the organization summary with readable headings and the event title.
2. Open Feedback to see ratings, recommendations, and follow-up interest collected after the event.

## Supervisor Guide

Supervisors oversee the publisher network.

1. Sign in at `/login` with persona set to supervisor.
2. The Supervisor Dashboard lists every event across all publishers, with a time zone filter and a rollup of registrations and attendance per publisher.
3. Add a new publisher account by email and password.
4. Review Partner Applications, verify the partner details, and approve or reject each submission. Approval requires a temporary password for the partner submitter.
5. Open any event for a read-only detail view.
6. Send a test notification to confirm the email transport is configured correctly.

### Changing a partner submitter email

1. Open Supervisor Console, then Partner Applications.
2. Select Edit Submitter Email beside the submitter, enter the corrected address, and select Update Submitter Email.
3. Tell the user to sign in again with the new email and their current password.

The change updates the partner contact and signing authority contact when it uses the old address.
For an existing partner account, it also transfers the login, roles, event ownership, shared access,
and team assignments. The password and account status are retained. The old email no longer signs
in, and existing sessions must sign in again. An address already used by another account or partner
application is rejected. Signed agreement details and historical audit records remain unchanged.
Unused facilitator invitation links for the old address are revoked.

## Speaker and Proctor Guide

Speakers and proctors are collectively called facilitators.

1. A publisher adds you to the event team. If you are new, the email contains a one-time password setup link that expires after 24 hours.
2. Set your password, then sign in at `/login` with persona set to facilitator. Existing Speaker and Proctor login options remain available for older accounts.
3. Your Facilitator Dashboard lists upcoming and ongoing assignments first, followed by past assignments, each with your availability and possible roles.
4. Use the session grid details shared by the publisher to see what session you are supporting and when.

## Partner Guide

Partners can apply from the Become an Event Partner link on the public event listing.

Use the **Download Sample Agreement (PDF)** button at the top center of the application page
to save an unsigned copy. Enter your partner name first to include it in the PDF.

1. Submit the partner name, address, country, PNG or JPEG logo, HTTPS website and privacy policy links, MPN ID, submitter contact details, and signing authority details. The submitter becomes the primary partner publisher and signing authority.
2. Review the complete EventIQ Program Terms and Conditions, including program prerequisites, quarterly performance criteria, event responsibilities, and Microsoft activities. Scroll naturally through the agreement reader in the right pane to unlock the signature section. Scroll the left application pane separately to reach its remaining fields. The primary publisher must enter the signing authority details and digitally sign before submitting a new application.
3. Wait for the approver. A Microsoft supervisor reviews the partner application. Duplicate partner names and MPN IDs are rejected.
4. After approval, sign in as a publisher with the approved email and temporary password.
5. Partners approved before the mandatory onboarding signature was introduced must use the centered agreement notice to review and sign. Event creation and duplication remain unavailable until the primary publisher signs.
6. Download the signed PDF from the agreement page for your records.
7. Add publisher, speaker, and proctor users from the Publisher Dashboard. Every account created there inherits the same partner affiliation.
8. Create an event. Wait for the approver. Partner events remain pending until a non-partner publisher approves them.
9. Review pending attendee submissions in Manage Registrations. Approving a registrant generates the registration code and sends the calendar invitation.

Screenshot walkthroughs are distributed separately in the Partner Word guide and
Microsoft Word guide. These documents are not included in the source repository
or source ZIP.

Approved partner events show the partner name in the event title and display the partner logo, website, privacy policy, Microsoft privacy policy, and Teams participation notice on the registration page. A shared partner-event badge identifies the partner on event listings, dashboards, event workspaces, reports, feedback, and confirmation pages. The feedback form also links to the partner privacy policy. Non-partner publishers can view and edit every partner event.

Only attendees who explicitly select the named partner's optional contact permission can be considered for that partner's product, service, and event communications. Attendees in China and Canada can register, but partner contact permissions remain unavailable until approved country-specific requirements are implemented. The server rejects attempts to submit an opt-in for excluded or unrecognized countries, or for an event missing the partner name or HTTPS privacy statement.

## Managing Your Profile

Select My Profile from the top navigation after signing in.

* Publishers, supervisors, speakers, and proctors can update their display name or change their password.
* To change your password, open My Profile, enter your Current Password, New Password, and Confirm New Password, then select Update Password. This also works when you sign in using the combined Facilitator option.
* Password changes require the current password and a new password of at least 10 characters containing uppercase, lowercase, number, and special characters.
* When the same email has multiple account roles, the updated password is used for all of those roles.
* If you have forgotten your current password, ask a supervisor to reset it from Supervisor Console, Users, Actions.
* Registrants can update their name. Registrants use email and registration code authentication, so they do not have a password to change.
* Email address, persona type, internal or partner account classification, and partner affiliation cannot be changed from the profile page.
* A supervisor can correct a partner submitter email from Partner Applications, including the linked login.

## Shared Event Access

Publishers can share an event with another publisher instead of managing it alone.

* An event owner grants read access for viewing registrations, reports, and feedback, or write access for also managing attendance and the session grid.
* Shared events appear on the recipient's Publisher Dashboard under the shared scope, tagged with the access level.
* Event cancellation, core detail edits, and further sharing remain limited to the event owner.

## Admin and Notification Operations

These operations are API-driven and intended for the team operating the deployment, not for day-to-day personas.

* Bootstrap status and login seeding endpoints validate setup and create initial login documents.
* A notification pipeline endpoint sends registration reminders and post-event feedback requests, with a dry-run mode for safe testing.
* Data retention and data subject deletion endpoints support compliance requests.

See `README.md` for the environment variables and authentication header these endpoints require.

## Troubleshooting

> [!IMPORTANT]
> Attendee personal data is masked by default in publisher reports. Only allowlisted identities can view unmasked names, emails, and phone numbers.

* If publisher or supervisor sign-in fails, confirm the account uses an approved Microsoft email and that a supervisor has created the login.
* If registrant sign-in fails, confirm the registration code matches the one from the confirmation page or invite email exactly.
* If the site loads slowly or shows a temporary data service error, the Cosmos DB firewall may be blocking the app's outbound traffic. Contact the team operating the deployment.
