/**
 * ============================================================
 * LASEV RESORT — Auth Module (auth.js)
 *
 * Login:  Full Name + Password  (no email, no role selector)
 * Role:   Resolved automatically from the user record.
 *
 * Roles
 * ─────
 * reception  Front-desk staff. Bookings, venues, rooms,
 *            customers, clock-in system.
 * owner      Resort owner. All of reception +
 *            admin, user management.
 *            Owner CANNOT see or manage developer accounts.
 * developer  Full system access + secret dev panel,
 *            activity logs, DB info.
 *            Only developers can see/manage other developers.
 *
 * NFC (future): tap → backend resolves staff member ID,
 * returns clockin token. No front-end auth changes needed.
 * ============================================================
 */

const Auth = (() => {

  /* ── Role definitions ─────────────────────────────────── */
  const ROLES = {
    reception: {
      label:"Reception", color:"#6b9e6e", badge:"REC",
      permissions:[
        "view_dashboard",
        "view_bookings","manage_bookings",
        "view_venues","manage_venues",
        "view_rooms","manage_rooms",
        "view_customers",
        "view_website_requests","manage_website_requests",
        "view_messages","manage_messages",
        "view_clockin","manage_clockin"
      ],
      accessible_pages:["dashboard","bookings","venues","rooms","customers","website-requests","messages","clockin"]
    },
    owner: {
      label:"Owner", color:"#c49a3c", badge:"OWN",
      permissions:[
        "view_dashboard",
        "view_bookings","manage_bookings",
        "view_venues","manage_venues",
        "view_rooms","manage_rooms",
        "view_customers",
        "view_website_requests","manage_website_requests",
        "view_messages","manage_messages",
        "view_clockin","manage_clockin",
        "view_admin","manage_users"
        // NOTE: owner does NOT have view_developer_accounts
      ],
      accessible_pages:["dashboard","bookings","venues","rooms","customers","website-requests","messages","clockin","admin"]
    },
    developer: {
      label:"Developer", color:"#2d6aa3", badge:"DEV",
      permissions:[
        "view_dashboard",
        "view_bookings","manage_bookings",
        "view_venues","manage_venues",
        "view_rooms","manage_rooms",
        "view_customers",
        "view_website_requests","manage_website_requests",
        "view_messages","manage_messages",
        "view_clockin","manage_clockin",
        "view_admin","manage_users",
        "view_developer_accounts",     // only devs can see dev accounts
        "manage_developer_accounts",   // only devs can edit/add/delete dev accounts
        "view_logs","access_db_panel",
        "view_dev_secret"              // hidden panel only devs see
      ],
      accessible_pages:["dashboard","bookings","venues","rooms","customers","website-requests","messages","clockin","admin","devsecret"]
    }
  };

  const SYSTEM_USERS = [];

  const SESSION_KEY  = "lasev_session";
  const ACTIVITY_KEY = "lasev_last_active";
  const DEV_SESSION_KEY = "lasev_developer_session";
  const DEV_TOKEN_KEY = "lasev_developer_token";
  const SESSION_TTL  = 10 * 60 * 1000; // 10 minutes
  let inactivityTimer = null;

  /**
   * Login by full name + password.
   *
   * BACKEND SWAP: replace body with:
   *   const res = await fetch('/api/auth/login', {
   *     method:'POST', headers:{'Content-Type':'application/json'},
   *     body: JSON.stringify({ name: name.trim(), password })
   *   });
   *   const data = await res.json();
   *   if (!res.ok) return { success:false, error:data.message };
   *   _saveSession(data.user, remember);
   *   return { success:true, user:data.user };
   */
  async function login(name, password, remember = false) {
    try {
      const result = await Api.login(name.trim(), password, remember);
      const user = result.user;
      const sessionData = {
        id:user.id, name:user.name, role:user.role,
        avatar:user.avatar, department:user.department||"",
        isGhost:Boolean(user.isGhost),
        actingDeveloper:user.actingDeveloper||null,
        loginAt:new Date().toISOString()
      };
      _saveSession(sessionData, remember);
      return { success:true, user:sessionData };
    } catch (err) {
      return { success:false, error:err.message || "Login failed. Please try again." };
    }
  }

  function logout() {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(ACTIVITY_KEY);
    sessionStorage.removeItem(DEV_SESSION_KEY);
    sessionStorage.removeItem(DEV_TOKEN_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    Api.clearToken();
    window.location.href = "login.html";
  }

  function getSession() {
    const raw = sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    try {
      const s = JSON.parse(raw);
      const last = parseInt(localStorage.getItem(ACTIVITY_KEY)||"0", 10);
      if (last && Date.now()-last > SESSION_TTL) { logout(); return null; }
      if (!last) touchActivity();
      return s;
    } catch { return null; }
  }

  function touchActivity() {
    localStorage.setItem(ACTIVITY_KEY, Date.now().toString());
  }

  function startInactivityWatcher() {
    const events = ["click","keydown","mousemove","touchstart","scroll"];
    events.forEach(evt => window.addEventListener(evt, touchActivity, { passive:true }));
    touchActivity();
    inactivityTimer = setInterval(() => {
      const last = parseInt(localStorage.getItem(ACTIVITY_KEY)||"0", 10);
      if (last && Date.now()-last > SESSION_TTL) logout();
    }, 30000);
    window.addEventListener("beforeunload", () => {
      if (inactivityTimer) clearInterval(inactivityTimer);
    });
  }

  function requireAuth() {
    const s = getSession();
    if (!s) { window.location.href = "login.html"; return null; }
    return s;
  }

  function can(permission) {
    const s = getSession(); if (!s) return false;
    return (ROLES[s.role]?.permissions || []).includes(permission);
  }

  function canAccessPage(pageId) {
    const s = getSession(); if (!s) return false;
    return (ROLES[s.role]?.accessible_pages || []).includes(pageId);
  }

  function getRoleConfig(r) { return ROLES[r] || null; }

  function canSwitchUsers(session = getSession()) {
    return Boolean(session && (session.role === "developer" || session.actingDeveloper));
  }

  async function switchUser(userId) {
    const current = getSession();
    if (!canSwitchUsers(current)) {
      return { success:false, error:"Only developer accounts can switch users." };
    }

    try {
      if (current.role === "developer" && !current.actingDeveloper) {
        sessionStorage.setItem(DEV_SESSION_KEY, JSON.stringify(current));
        sessionStorage.setItem(DEV_TOKEN_KEY, Api.getToken() || "");
      }
      const result = await Api.switchUser(userId);
      const user = result.user;
      const sessionData = {
        id:user.id, name:user.name, role:user.role,
        avatar:user.avatar, department:user.department||"",
        isGhost:Boolean(user.isGhost),
        actingDeveloper:user.actingDeveloper||current.actingDeveloper||{ id:current.id, name:current.name },
        loginAt:new Date().toISOString()
      };
      _saveSession(sessionData, false);
      window.location.reload();
      return { success:true, user:sessionData };
    } catch (err) {
      return { success:false, error:err.message || "Could not switch user." };
    }
  }

  function returnToDeveloper() {
    const rawSession = sessionStorage.getItem(DEV_SESSION_KEY);
    const token = sessionStorage.getItem(DEV_TOKEN_KEY);
    if (!rawSession) return false;
    sessionStorage.setItem(SESSION_KEY, rawSession);
    localStorage.removeItem(SESSION_KEY);
    if (token) Api.saveToken(token, false);
    else Api.clearToken();
    sessionStorage.removeItem(DEV_SESSION_KEY);
    sessionStorage.removeItem(DEV_TOKEN_KEY);
    window.location.reload();
    return true;
  }

  // Returns sanitised user list (no passwords) for admin UI
  function getSystemUsers() {
    return SYSTEM_USERS.map(({ password, ...u }) => ({
      ...u,
      avatar: u.name.split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2)
    }));
  }

  function _saveSession(data, remember) {
    const p = JSON.stringify(data);
    if (remember) {
      localStorage.setItem(SESSION_KEY, p);
      sessionStorage.removeItem(SESSION_KEY);
    } else {
      sessionStorage.setItem(SESSION_KEY, p);
      localStorage.removeItem(SESSION_KEY);
    }
    localStorage.setItem(ACTIVITY_KEY, Date.now().toString());
  }

  return { login, logout, getSession, requireAuth, can, canAccessPage, getRoleConfig, getSystemUsers, canSwitchUsers, switchUser, returnToDeveloper, startInactivityWatcher };
})();
