# Kkary Admin Quick Reference

## First-Time Setup

### Default Super Admin
- **Username:** `superadmin`
- **Password:** `supa12345`
- **Location:** `/admin`
- **Action Required:** Change password on first login

⚠️ **IMPORTANT:** Change the default password immediately after first login. This password is temporary and should never be used in production.

---

## Admin Roles Explained

### 🔐 Super Admin
- **Permissions:**
  - Create new admins (any role)
  - Remove admins
  - Manage driver verification
  - Set pricing & revenue share
  - Access all system features
  - View all messages
  
- **How to use:**
  1. Login at `/admin` with superadmin credentials
  2. Change password if first login
  3. Navigate to "Administrators" tab
  4. Use "Create administrator" form to add new admins
  5. Share temporary password securely with new admin

### 👔 Admin
- **Permissions:**
  - Manage drivers (onboarding, documents, suspension)
  - Manage pricing & revenue share
  - View system overview & metrics
  - Access mail/messages
  - Cannot create other admins

- **How to use:**
  1. Login at `/admin` with your admin credentials
  2. Review driver documents in "Driver review" section
  3. Adjust pricing in "Pricing & share" section
  4. Read/respond to messages in "Messages" section

### 💬 Customer Care Admin
- **Permissions:**
  - Send in-app messages to riders/drivers by username
  - Receive & respond to user messages
  - View message history
  - Cannot manage drivers or system settings

- **How to use:**
  1. Login at `/admin` with your customer care credentials
  2. Go to "Messages" section
  3. Click "Send message" (if available)
  4. Enter recipient username, subject, and message
  5. Users will receive notification & can reply

---

## Common Tasks

### Creating a New Admin
1. Login as super admin
2. Go to **Administrators** tab
3. Fill in the form:
   - **Username:** Unique identifier (e.g., `john_admin`)
   - **Full Name:** Display name (e.g., `John Smith`)
   - **Email:** Optional recovery email
   - **Role:** Choose Admin or Super-admin
   - **Temporary Password:** Must be 10+ characters (share securely)
4. Click "Create administrator"
5. Share temp password to new admin via secure channel
6. New admin must change password on first login

### Creating a Customer Care Admin
1. Same process as creating admin
2. Select **"Customer Care"** as the role
3. Customer care admin can only send/receive messages, not manage drivers

### Sending a Message to a User
1. Go to **Messages** section (all admin roles can access)
2. Click "New message" button
3. Enter:
   - **Recipient Username:** The username of rider or driver
   - **Subject:** Brief message title
   - **Message:** Detailed message content
4. Click "Send"
5. User receives notification in app
6. User can reply directly in their inbox

### Approving Driver Documents
1. Go to **Driver review** section
2. View pending documents
3. Review:
   - Profile photo quality
   - Driver's license validity
   - Vehicle registration match
   - Insurance coverage
4. Approve or request resubmission
5. Approved drivers can activate

### Adjusting Pricing
1. Go to **Pricing & share** section
2. Set **Platform commission %** (e.g., 20% = 80% goes to driver)
3. Create pricing rules for vehicle types:
   - Select vehicle (Bike or Car)
   - Set base fare (₦)
   - Set per-km rate (₦)
   - Set minimum fare (₦)
4. Click "Add pricing rule"
5. Changes apply to new rides immediately

---

## Viewing System Metrics

### Overview Dashboard
Shows real-time data:
- **Registered Riders:** Total user count
- **Online Drivers:** Currently available
- **Live Trips:** Active rides in progress
- **Gross Revenue:** Total platform earnings

### Network Map
Visual display of online drivers:
- Green dots = online drivers
- Click for driver details (ID, LGA)
- Auto-refreshes every 5 seconds

---

## Security Best Practices

1. **Password Management**
   - Use 15+ character passwords with mixed case, numbers, symbols
   - Never reuse passwords
   - Change every 90 days
   - Never share via email or chat

2. **Access Control**
   - Only super admin should create new admins
   - Remove admin access immediately if person leaves
   - Limit customer care to trusted staff
   - Audit admin actions regularly (check audit logs)

3. **Sensitive Information**
   - Never store passwords in documents
   - Use password manager for temporary credentials
   - Share passwords via secure channel (encrypted message, in-person)
   - Delete temporary password after admin confirms change

4. **Session Security**
   - Log out after each use
   - Use HTTPS always (never HTTP)
   - Clear browser cache/cookies regularly
   - Don't leave console unattended while logged in

---

## Troubleshooting

### "Can't login to admin"
- ✅ Check username: `superadmin` (default)
- ✅ Check password: `supa12345` (default)
- ✅ Ensure `/admin` URL is used
- ✅ Clear browser cookies & cache
- ✅ Try incognito/private window

### "Can't find admin in list"
- ✅ Go to Administrators tab (only visible to super admin)
- ✅ Refresh page or logout/login
- ✅ Check if admin still exists in database

### "Message won't send"
- ✅ Verify recipient username exists (check rider/driver list)
- ✅ Username is case-sensitive
- ✅ Message must be 1-5000 characters
- ✅ Check browser console for errors

### "Driver documents stuck on pending"
- ✅ Admin must review & approve in "Driver review" tab
- ✅ Driver may need to resubmit poor quality photos
- ✅ Check if driver uploaded all required documents

### "Password change fails"
- ✅ Current password must match exactly
- ✅ New password must be 10+ characters
- ✅ Cannot reuse previous 5 passwords
- ✅ Try copying password to avoid typos

---

## Admin Audit Log

All admin actions are logged:
- Who (admin username)
- What (action type: create, edit, delete)
- When (timestamp)
- What changed (metadata)

### Accessing Audit Log
Currently visible to super admin in overview. To check:
1. Login as super admin
2. Go to Overview section
3. Scroll to "Audit log" (if visible)
4. Filter by date range, admin, action type

---

## Communication Channels

### In-App Messages
- Customer care admins send via Messages section
- Users receive notifications & can reply
- Visible in user's "Help with Ride" flow

### Botpress Chat
- Integrated customer support bot
- Accessible to all users in app
- Handles FAQ, common issues
- Escalates to human (future feature)

### Email Support
- For admin-only issues
- Send to: support@kkary.com

---

## Monthly Admin Checklist

- [ ] Review all driver documents (approval backlog)
- [ ] Check pricing rules vs. competitors
- [ ] Review top support issues from users
- [ ] Audit admin access (remove inactive accounts)
- [ ] Generate revenue report (gross, net, driver share)
- [ ] Check platform security audit logs
- [ ] Update admin documentation/policies
- [ ] Schedule admin training if needed

---

## Emergency Procedures

### Lock Out Suspected Compromised Admin Account
1. Super admin goes to Administrators section
2. Click "Remove" on the suspected admin
3. They can be re-created with new password later

### Restore Super Admin Access (if locked out)
1. Contact technical support (backend admin)
2. Provide super admin username & registered email
3. Password reset token will be sent
4. Create new super admin credential if necessary

### Pause All Ride Matching (emergency)
1. Go to Pricing & share
2. Set platform commission to 100% (stops driver earnings)
3. No new riders will request rides
4. Reset to 20% when emergency resolves

---

## FAQ

**Q: Can I create two super admins?**  
A: Yes, use the same process. Only one super admin is required but multiple can exist for redundancy.

**Q: How do I message all riders at once?**  
A: Currently must message individually by username. Bulk messaging feature coming soon.

**Q: Can customer care admin see which admin messages?**  
A: No, only messages they sent/received. Message privacy is maintained.

**Q: What happens if admin forgets password?**  
A: Super admin must reset via Administrators section. User receives temp password to change on login.

**Q: Can drivers see admin messages?**  
A: Yes, messages appear in their inbox with mail notification. They can reply directly.

**Q: Is there a message retention policy?**  
A: Messages are kept indefinitely for record-keeping. Deleted messages can be recovered from database backup.

**Q: Can admins send automated/scheduled messages?**  
A: Not currently. Manual send required each time. Automation coming in future version.

---

**Need more help? Contact support@kkary.com or see IMPLEMENTATION-GUIDE.md for full technical details.**

Last Updated: 2025
