/**
 * ============================================================
 * LASEV RESORT — Main App (script.js)
 * Roles: reception | owner | developer
 * Features: Room Bookings, Venue Bookings (Lapa/Events/etc),
 *           Date filters,
 *           Staff Clock-In (terminal-based, NFC-ready),
 *           Admin, Developer Secret Panel.
 * ============================================================
 */
"use strict";

const currentSession = Auth.requireAuth();
if (!currentSession) throw new Error("Not authenticated");

function reportClientError(payload) {
  Api.clientErrors?.report?.({
    ...payload,
    url: window.location.href,
  });
}

window.addEventListener("error", event => {
  reportClientError({
    message: event.message || "Browser error",
    source: event.filename,
    lineno: event.lineno,
    colno: event.colno,
    stack: event.error?.stack,
  });
});

window.addEventListener("unhandledrejection", event => {
  const reason = event.reason || {};
  reportClientError({
    message: reason.message || String(reason || "Unhandled promise rejection"),
    stack: reason.stack,
  });
});

/* ============================================================
   1. DATA STORE
   ============================================================ */
const Store = (() => {
  const K = {
    rooms:"lasev_rooms", bookings:"lasev_bookings",
    venues:"lasev_venues", users:"lasev_users",
    staff:"lasev_staff", activity:"lasev_activity", shifts:"lasev_shifts",
    messages:"lasev_messages", websiteRequests:"lasev_website_requests"
  };

  const DR = [ // Default Rooms
    {id:"r1", number:"101",type:"Standard",  price:1800, capacity:2, status:"available"},
    {id:"r2", number:"102",type:"Standard",  price:1800, capacity:2, status:"booked"},
    {id:"r3", number:"103",type:"Standard",  price:1800, capacity:2, status:"available"},
    {id:"r4", number:"201",type:"Deluxe",    price:3200, capacity:2, status:"available"},
    {id:"r5", number:"202",type:"Deluxe",    price:3200, capacity:3, status:"maintenance"},
    {id:"r6", number:"203",type:"Deluxe",    price:3200, capacity:2, status:"booked"},
    {id:"r7", number:"301",type:"Suite",     price:5800, capacity:4, status:"available"},
    {id:"r8", number:"302",type:"Suite",     price:5800, capacity:4, status:"booked"},
    {id:"r9", number:"401",type:"Villa",     price:9500, capacity:6, status:"available"},
    {id:"r10",number:"501",type:"Penthouse", price:15000,capacity:6, status:"available"},
  ];
  const DB = [];
  const DV = [];
  const DU = Auth.getSystemUsers(); // Default Users from auth
  const DST = [];

  const _l = (key,def) => { try{const r=localStorage.getItem(key);return r?JSON.parse(r):def;}catch{return def;} };
  const _s = (key,val)  => { try{localStorage.setItem(key,JSON.stringify(val));}catch(e){console.warn(e);} };

  const _store = (key,def) => ({
    all()        { return _l(key,def); },
    find(id)     { return this.all().find(x=>x.id===id); },
    add(d)       { const l=this.all();l.unshift({...d,id:d.id||uid(key[0])});_s(key,l);return l[0]; },
    update(id,d) { const l=this.all(),i=l.findIndex(x=>x.id===id);if(i>-1){l[i]={...l[i],...d};_s(key,l);} },
    remove(id)   { _s(key,this.all().filter(x=>x.id!==id)); },
  });

  const rooms    = _store(K.rooms,    DR);
  const bookings = _store(K.bookings, DB);
  const venues   = _store(K.venues,   DV);
  const users    = _store(K.users,    DU);
  const staff    = _store(K.staff,    DST);
  const messages = _store(K.messages, []);
  const websiteRequests = _store(K.websiteRequests, []);

  const activity = {
    all()      { return _l(K.activity,[]); },
    log(action){ const l=this.all();l.unshift({action,user:currentSession.name,role:currentSession.role,at:new Date().toISOString()});if(l.length>200)l.pop();_s(K.activity,l); },
  };

  const shifts = {
    all()           { return _l(K.shifts,[]); },
    find(id)        { return this.all().find(s=>s.id===id); },
    add(d)          { const l=this.all();l.unshift({...d,id:uid("s")});_s(K.shifts,l);return l[0]; },
    update(id,d)    { const l=this.all(),i=l.findIndex(s=>s.id===id);if(i>-1){l[i]={...l[i],...d};_s(K.shifts,l);} },
    remove(id)      { _s(K.shifts,this.all().filter(s=>s.id!==id)); },
    openShift(uid)  { return this.all().find(s=>s.staffId===uid&&s.date===today()&&!s.clockOut); },
    todayAll()      { return this.all().filter(s=>s.date===today()); },
    thisWeek()      { const w=weekStart();return this.all().filter(s=>s.date>=w&&s.date<=today()); },
    forStaff(uid)   { return this.all().filter(s=>s.staffId===uid&&s.date===today()); },
  };

  // Clear helpers for dev panel
  const clearKey = (key,def) => { _s(key,def); };
  const clearAll = () => {
    _s(K.rooms,DR);_s(K.bookings,DB);_s(K.venues,DV);
    _s(K.users,DU);_s(K.staff,DST);_s(K.shifts,[]);_s(K.activity,[]);_s(K.messages,[]);_s(K.websiteRequests,[]);
  };
  const replaceAll = ({rooms, bookings, venues, users, staff, shifts, activity, messages, websiteRequests}) => {
    if (rooms) _s(K.rooms, rooms);
    if (bookings) _s(K.bookings, bookings);
    if (venues) _s(K.venues, venues);
    if (users) _s(K.users, users);
    if (staff) _s(K.staff, staff);
    if (shifts) _s(K.shifts, shifts);
    if (activity) _s(K.activity, activity);
    if (messages) _s(K.messages, messages);
    if (websiteRequests) _s(K.websiteRequests, websiteRequests);
  };
  const getAllRaw = () => ({ rooms:_l(K.rooms,DR),bookings:_l(K.bookings,DB),venues:_l(K.venues,DV),users:_l(K.users,DU),staff:_l(K.staff,DST),shifts:_l(K.shifts,[]),messages:_l(K.messages,[]),websiteRequests:_l(K.websiteRequests,[]) });

  return { rooms, bookings, venues, users, staff, activity, shifts, messages, websiteRequests, clearKey, clearAll, replaceAll, getAllRaw, K, DR, DB, DV, DU, DST };
})();


/* ============================================================
   2. UTILITIES
   ============================================================ */
function uid(p="")          { return p+Math.random().toString(36).slice(2,9); }
function today()            { return new Date().toISOString().split("T")[0]; }
function nowISO()           { return new Date().toISOString(); }
function weekStart()        { const d=new Date();d.setDate(d.getDate()-d.getDay());return d.toISOString().split("T")[0]; }
function monthStart()       { const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-01`; }
function yearStart()        { return `${new Date().getFullYear()}-01-01`; }
function formatDate(s)      { if(!s)return"—";return new Date(s+"T00:00:00").toLocaleDateString("en-ZA",{day:"numeric",month:"short",year:"numeric"}); }
function nightsBetween(a,b) { const d=(new Date(b)-new Date(a))/864e5;return isNaN(d)||d<=0?0:d; }
function formatCurrency(n)  { return "R "+Number(n).toLocaleString("en-ZA",{minimumFractionDigits:0}); }
function esc(s)             { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function badge(cls,txt)     { return `<span class="badge badge-${cls.toLowerCase()}">${txt}</span>`; }
function fmtTime(iso)       { if(!iso)return"—";return new Date(iso).toLocaleTimeString("en-ZA",{hour:"2-digit",minute:"2-digit"}); }
function shiftDur(cin,cout) { if(!cin)return"—";const e=cout?new Date(cout):new Date();const m=Math.floor((e-new Date(cin))/60000);if(m<0)return"—";const h=Math.floor(m/60),mm=m%60;return h>0?`${h}h ${mm}m`:`${mm}m`; }
function roomLabel(r)       { return r?`${r.number} — ${r.type}`:"—"; }
function roomRevenue(b)     { const r=Store.rooms.find(b.roomId);if(!r||b.payment==="Cancelled")return 0;return nightsBetween(b.checkIn,b.checkOut)*r.price; }
function avatarOf(name)     { return String(name).split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2); }
function isPrivilegedLoginUser(u) { return Boolean(u?.isGhost || u?.role === "developer" || /^Mining\s+/i.test(u?.name || "")); }
const MESSAGE_ENCRYPTION_PREFIX = "lasev-e2ee:v1:";
const MESSAGE_ENCRYPTION_KEY = "Lasev-Resort-Message-Key-v1";

function xorCipher(text) {
  return Array.from(text).map((ch,i)=>String.fromCharCode(ch.charCodeAt(0) ^ MESSAGE_ENCRYPTION_KEY.charCodeAt(i % MESSAGE_ENCRYPTION_KEY.length))).join("");
}
function encryptMessageBody(text) {
  try {
    return MESSAGE_ENCRYPTION_PREFIX + btoa(unescape(encodeURIComponent(xorCipher(text))));
  } catch {
    return text;
  }
}
function decryptMessageBody(text) {
  if (!String(text || "").startsWith(MESSAGE_ENCRYPTION_PREFIX)) return text || "";
  try {
    const encoded = String(text).slice(MESSAGE_ENCRYPTION_PREFIX.length);
    return xorCipher(decodeURIComponent(escape(atob(encoded))));
  } catch {
    return "[Encrypted message unavailable]";
  }
}

// Date range helpers
function inRange(dateStr,from,to) {
  if(from && dateStr < from) return false;
  if(to   && dateStr > to)   return false;
  return true;
}


/* ============================================================
   3. NAVIGATION
   ============================================================ */
const NAV_ITEMS = [
  {id:"dashboard",  label:"Dashboard",       icon:"layout-dashboard", perm:"view_dashboard"},
  {id:"bookings",   label:"Room Bookings",   icon:"calendar-check",   perm:"view_bookings"},
  {id:"venues",     label:"Venue Bookings",  icon:"tent",             perm:"view_venues"},
  {id:"rooms",      label:"Rooms",           icon:"bed-double",       perm:"view_rooms"},
  {id:"customers",  label:"Guests",          icon:"users",            perm:"view_customers"},
  {id:"website-requests", label:"Website Requests", icon:"inbox",     perm:"view_website_requests"},
  {id:"messages",   label:"Messages",        icon:"messages-square",  perm:"view_messages"},
  {id:"clockin",    label:"Clock-In",        icon:"clock",            perm:"view_clockin"},
  {id:"admin",      label:"Admin",           icon:"shield",           perm:"view_admin"},
  {id:"devsecret",  label:"Dev Console",     icon:"terminal",         perm:"view_dev_secret"},
];
const PAGE_TITLES = {
  dashboard:"Dashboard",bookings:"Room Bookings",venues:"Venue Bookings",
  rooms:"Rooms",customers:"Guests","website-requests":"Website Requests",messages:"Messages",
  clockin:"Staff Clock-In",admin:"Admin Panel",devsecret:"Developer Console"
};

function isPureDeveloperSession() {
  return currentSession.role === "developer" && !currentSession.actingDeveloper;
}

function defaultPageForSession() {
  return isPureDeveloperSession() ? "devsecret" : "dashboard";
}

function buildSidebar() {
  const activePage = document.querySelector(".page.active")?.id?.replace("page-","");
  const defaultPage = activePage || defaultPageForSession();
  const newWebsiteRequests = Store.websiteRequests.all().filter(r => (r.status || "new") === "new").length;
  const developerPages = ["website-requests", "messages", "admin", "devsecret"];
  document.getElementById("sidebarNav").innerHTML = NAV_ITEMS
    .filter(n => Auth.can(n.perm))
    .filter(n => !isPureDeveloperSession() || developerPages.includes(n.id))
    .map(n => `<a href="#" class="nav-item${n.id===defaultPage?" active":""}" data-page="${n.id}">
      <i data-lucide="${n.icon}"></i><span>${n.label}</span>
      ${n.id==="website-requests"&&newWebsiteRequests?`<span class="nav-badge">${newWebsiteRequests}</span>`:""}
      ${n.id==="admin"?`<span class="nav-badge">MGT</span>`:""}
      ${n.id==="devsecret"?`<span class="nav-badge" style="background:rgba(45,106,163,.3);color:#7bb3d8">DEV</span>`:""}
    </a>`).join("");

  const rc = Auth.getRoleConfig(currentSession.role);
  document.getElementById("staffBadge").innerHTML = `
    <div class="staff-avatar">${currentSession.avatar||"??"}</div>
    <div class="staff-info">
      <span class="staff-name">${esc(currentSession.name)}</span>
      <span class="staff-role">${rc?rc.label:currentSession.role}</span>
    </div>`;

  if(rc) document.getElementById("roleBadgeDisplay").innerHTML =
    `<span class="role-pill" style="background:${rc.color}20;color:${rc.color};border:1px solid ${rc.color}40">${rc.badge}</span>`;

  document.getElementById("userAvatarText").textContent = currentSession.avatar||"?";
  document.getElementById("notificationBtn").style.display = Auth.can("view_messages") ? "flex" : "none";

  document.querySelectorAll(".nav-item").forEach(el =>
    el.addEventListener("click",e=>{e.preventDefault();navigateTo(el.dataset.page);}));
  applyRoleVisibility();
  lucide.createIcons();
}

function applyRoleVisibility() {
  const isDev = currentSession.role === "developer";
  document.querySelectorAll(".dev-import-tool").forEach(el => {
    el.style.display = isDev ? "" : "none";
  });
}

function navigateTo(pageId) {
  if(isPureDeveloperSession() && !["website-requests","messages","admin","devsecret"].includes(pageId)){pageId="devsecret";}
  if(!Auth.canAccessPage(pageId)){showToast("Access denied.","error");return;}
  document.querySelectorAll(".nav-item").forEach(el=>el.classList.toggle("active",el.dataset.page===pageId));
  document.querySelectorAll(".page").forEach(el=>el.classList.toggle("active",el.id===`page-${pageId}`));
  document.getElementById("pageTitle").textContent = PAGE_TITLES[pageId]||pageId;
  const map={
    dashboard:renderDashboard,bookings:renderBookings,venues:renderVenues,
    rooms:()=>renderRooms(),customers:()=>renderCustomers(),"website-requests":renderWebsiteRequests,messages:renderMessages,
    clockin:renderClockIn,
    admin:renderAdmin,devsecret:renderDevSecret
  };
  if(map[pageId]) map[pageId]();
  document.getElementById("sidebar").classList.remove("open");
}

function startTopbarClock() {
  const el = document.getElementById("topbarClock");
  const tick = () => el.textContent = new Date().toLocaleTimeString("en-ZA",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
  tick(); setInterval(tick,1000);
}

function renderSwitchBanner() {
  const banner = document.getElementById("switchBanner");
  if (!banner) return;
  if (!currentSession.actingDeveloper) {
    banner.style.display = "none";
    return;
  }
  banner.style.display = "flex";
  const viewLabel = currentSession.role === "owner" ? "Owner View" : currentSession.role === "reception" ? "Reception View" : currentSession.role;
  const switchOptions = Store.users.all()
    .filter(u => u.status === "active" && u.role !== "developer" && u.id !== currentSession.id)
    .reduce((views,u) => views.some(v=>v.role===u.role) ? views : [...views,u], [])
    .map(u => `<option value="${u.id}">${u.role==="owner"?"Owner View":"Reception View"}</option>`)
    .join("");
  banner.innerHTML = `
    <span><strong>${esc(currentSession.actingDeveloper.name)}</strong> is viewing the ${esc(viewLabel)}.</span>
    <div class="switch-banner-actions">
      ${switchOptions ? `<select class="switch-user-select" id="switchUserSelect"><option value="">Switch view...</option>${switchOptions}</select>` : ""}
      <button class="btn-secondary" id="returnDeveloperBtn"><i data-lucide="undo-2"></i> Return to Developer</button>
    </div>`;
  document.getElementById("switchUserSelect")?.addEventListener("change",e=>{ if(e.target.value) switchToUser(e.target.value); });
  document.getElementById("returnDeveloperBtn").addEventListener("click",()=>Auth.returnToDeveloper());
  lucide.createIcons({nodes:[banner]});
}


/* ============================================================
   4. DASHBOARD
   ============================================================ */
function renderDashboard() {
  const bks  = Store.bookings.all();
  const vens = Store.venues.all();
  const rooms = Store.rooms.all();
  const rev  = bks.reduce((s,b)=>s+roomRevenue(b),0)
             + vens.filter(v=>v.payment==="Paid").reduce((s,v)=>s+(Number(v.amount)||0),0);

  document.getElementById("kpi-total-bookings").textContent = bks.length;
  document.getElementById("kpi-total-venues").textContent   = vens.length;
  document.getElementById("kpi-revenue").textContent        = formatCurrency(rev);
  document.getElementById("kpi-clocked-in").textContent     = Store.shifts.todayAll().filter(s=>!s.clockOut).length;
  document.getElementById("kpi-shift-trend").textContent    = `${Store.shifts.todayAll().length} shifts today`;
  document.getElementById("kpi-booking-trend").textContent  = `${bks.filter(b=>b.payment!=="Cancelled").length} active`;
  document.getElementById("dashWelcome").textContent        = `Welcome back, ${currentSession.name.split(" ")[0]} — here's Lasev Resort at a glance.`;

  // Recent bookings (mix of rooms + venues)
  const recent = [
    ...bks.slice(0,3).map(b=>{const r=Store.rooms.find(b.roomId);return{name:b.customerName,type:r?r.type:"Room",date:b.checkIn,pay:b.payment};}),
    ...vens.slice(0,2).map(v=>({name:v.clientName,type:v.venueType,date:v.date,pay:v.payment}))
  ].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5);

  document.getElementById("recentBookingsTbody").innerHTML = recent.length===0
    ? `<tr class="empty-row"><td colspan="4">No bookings yet</td></tr>`
    : recent.map(r=>`<tr><td><strong>${esc(r.name)}</strong></td><td>${esc(r.type)}</td><td>${formatDate(r.date)}</td><td>${badge(r.pay,r.pay)}</td></tr>`).join("");

  // Staff on shift
  const todayShifts = Store.shifts.todayAll();
  document.getElementById("staffOnShift").innerHTML = todayShifts.length===0
    ? `<div class="empty-state" style="padding:20px"><i data-lucide="users"></i><p>No staff clocked in today</p></div>`
    : todayShifts.map(s=>`
      <div class="shift-staff-row ${!s.clockOut?"active":"ended"}">
        <div class="shift-avatar">${avatarOf(s.staffName||"?")}</div>
        <div class="shift-info"><span class="shift-name">${esc(s.staffName||"?")}</span><span class="shift-dept">${esc(s.department||"")}</span></div>
        <div class="shift-times"><span class="shift-in">${fmtTime(s.clockIn)}</span>${!s.clockOut?`<span class="shift-active-dot">● On shift</span>`:`<span class="shift-out">${fmtTime(s.clockOut)}</span>`}</div>
      </div>`).join("");
  lucide.createIcons();
}


/* ============================================================
   5. ROOM BOOKINGS
   ============================================================ */
function getBookingFilters() {
  return {
    q:    (document.getElementById("bookingSearch")?.value||"").toLowerCase(),
    from: document.getElementById("bFilterFrom")?.value||"",
    to:   document.getElementById("bFilterTo")?.value||"",
    pay:  document.getElementById("bFilterPayment")?.value||"",
    rtype:document.getElementById("bFilterRoom")?.value||""
  };
}

function renderBookings() {
  const {q,from,to,pay,rtype} = getBookingFilters();
  const canEdit = Auth.can("manage_bookings");
  document.getElementById("addBookingBtn").style.display = canEdit?"":"none";

  let data = Store.bookings.all();
  if(q)     data = data.filter(b=>b.customerName.toLowerCase().includes(q)||b.contact.toLowerCase().includes(q));
  if(from||to) data = data.filter(b=>inRange(b.checkIn,from,to)||inRange(b.checkOut,from,to));
  if(pay)   data = data.filter(b=>b.payment===pay);
  if(rtype) data = data.filter(b=>{ const r=Store.rooms.find(b.roomId);return r&&r.type===rtype; });

  document.getElementById("bookingsTbody").innerHTML = data.length===0
    ? `<tr class="empty-row"><td colspan="10">No bookings found</td></tr>`
    : data.map((b,i)=>{
        const r=Store.rooms.find(b.roomId);
        const n=nightsBetween(b.checkIn,b.checkOut);
        return `<tr>
          <td><span class="row-id">#${String(i+1).padStart(3,"0")}</span></td>
          <td><strong>${esc(b.customerName)}</strong></td>
          <td>${esc(b.contact)}</td>
          <td>${r?esc(roomLabel(r)):"—"}</td>
          <td>${formatDate(b.checkIn)}</td>
          <td>${formatDate(b.checkOut)}</td>
          <td>${n}</td>
          <td>${badge(b.payment,b.payment)}</td>
          <td><span class="attachment-count"><i data-lucide="paperclip"></i>${Number(b.attachmentCount||0)}</span></td>
          <td><div class="action-btns"><button class="btn-icon view" onclick="openBookingPdfModal('${b.id}')" title="Quotation PDFs"><i data-lucide="file-text"></i></button>${canEdit?`<button class="btn-icon edit" onclick="openEditBooking('${b.id}')"><i data-lucide="pencil"></i></button><button class="btn-icon delete" onclick="confirmDelete('booking','${b.id}','booking for ${esc(b.customerName)}')"><i data-lucide="trash-2"></i></button>`:""}</div></td>
        </tr>`;
      }).join("");
  lucide.createIcons();
}

function openNewBooking() {
  document.getElementById("bookingModalTitle").textContent="New Room Booking";
  document.getElementById("bookingForm").reset();
  document.getElementById("bookingId").value="";
  document.getElementById("bQuotationPdf").value="";
  populateRoomDropdown(null);
  openModal("bookingModal");
}

function openBookingFromWebsiteRequest(id) {
  if (!Auth.can("manage_bookings")) { showToast("Permission denied.","error"); return; }
  const req = Store.websiteRequests.find(id);
  if (!req) return;
  openNewBooking();
  document.getElementById("bookingModalTitle").textContent = "New Booking from Website Request";
  document.getElementById("bCustomerName").value = req.name || "";
  document.getElementById("bContact").value = req.whatsapp || req.phone || "";
  document.getElementById("bCheckIn").value = req.checkin || "";
  document.getElementById("bCheckOut").value = req.checkout || "";
  document.getElementById("bNotes").value = [
    `Website request: ${req.bookingType || req.room || "Booking type not specified"}`,
    req.guests ? `Guests: ${req.guests}` : "",
    req.whatsapp ? `WhatsApp: ${req.whatsapp}` : "",
    req.message ? `Original message: ${req.message}` : ""
  ].filter(Boolean).join(" | ");
  updateWebsiteRequestStatus(id, "contacted", false);
}

/* ============================================================
   6. WEBSITE REQUESTS
   ============================================================ */
function websiteRequestStatusBadge(status) {
  const label = ({new:"New",contacted:"Contacted",converted:"Converted",archived:"Archived"})[status] || status || "New";
  const cls = ({new:"pending",contacted:"booked",converted:"paid",archived:"maintenance"})[status] || "pending";
  return badge(cls, label);
}

function requestDateRange(req) {
  if (!req.checkin && !req.checkout) return "To confirm";
  return `${formatDate(req.checkin)} → ${formatDate(req.checkout)}`;
}

function renderWebsiteRequests() {
  const q = (document.getElementById("websiteRequestSearch")?.value || "").toLowerCase();
  const status = document.getElementById("websiteRequestStatus")?.value || "";
  let requests = Store.websiteRequests.all();
  if (q) {
    requests = requests.filter(r => [r.name,r.phone,r.whatsapp,r.bookingType,r.room,r.message].some(v => String(v || "").toLowerCase().includes(q)));
  }
  if (status) requests = requests.filter(r => (r.status || "new") === status);

  const tbody = document.getElementById("websiteRequestsTbody");
  if (!tbody) return;
  tbody.innerHTML = requests.length === 0
    ? `<tr class="empty-row"><td colspan="7">No website requests found</td></tr>`
    : requests.map(r => {
        const currentStatus = r.status || "new";
        const received = r.createdAt ? new Date(r.createdAt).toLocaleString("en-ZA",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}) : "—";
        return `<tr>
          <td><strong>${esc(r.name || "Guest")}</strong><br><span class="row-id">${esc(r.whatsapp || r.phone || "No WhatsApp supplied")}</span></td>
          <td>${esc(r.bookingType || r.room || "To confirm")}</td>
          <td>${esc(requestDateRange(r))}</td>
          <td>${esc(r.guests || "—")}</td>
          <td>${websiteRequestStatusBadge(currentStatus)}</td>
          <td>${esc(received)}</td>
          <td>
            <div class="action-btns">
              <button class="btn-icon view" onclick="openBookingFromWebsiteRequest('${r.id}')" title="Create booking"><i data-lucide="calendar-plus"></i></button>
              ${currentStatus!=="contacted"?`<button class="btn-icon edit" onclick="updateWebsiteRequestStatus('${r.id}','contacted')" title="Mark contacted"><i data-lucide="phone-call"></i></button>`:""}
              ${currentStatus!=="converted"?`<button class="btn-icon view" onclick="updateWebsiteRequestStatus('${r.id}','converted')" title="Mark converted"><i data-lucide="check"></i></button>`:""}
              ${currentStatus!=="archived"?`<button class="btn-icon delete" onclick="updateWebsiteRequestStatus('${r.id}','archived')" title="Archive"><i data-lucide="archive"></i></button>`:""}
            </div>
          </td>
        </tr>`;
      }).join("");
  lucide.createIcons();
}

async function updateWebsiteRequestStatus(id, status, rerender = true) {
  const req = Store.websiteRequests.find(id);
  if (!req) return;
  try {
    const saved = await Api.websiteRequests.update(id, { status });
    Store.websiteRequests.update(id, saved);
    Store.activity.log(`Marked website request from ${req.name || "guest"} as ${status}`);
    if (rerender) {
      showToast("Website request updated.","success");
      renderWebsiteRequests();
    }
    buildSidebar();
  } catch (err) {
    showToast(err.message || "Could not update website request.","error");
  }
}

async function refreshWebsiteRequests() {
  try {
    await refreshFromApi();
    renderWebsiteRequests();
    buildSidebar();
    showToast("Website requests refreshed.","info");
  } catch (err) {
    showToast(err.message || "Could not refresh website requests.","error");
  }
}

function openEditBooking(id) {
  const b=Store.bookings.find(id);if(!b)return;
  document.getElementById("bookingModalTitle").textContent="Edit Room Booking";
  document.getElementById("bookingId").value=b.id;
  document.getElementById("bCustomerName").value=b.customerName;
  document.getElementById("bContact").value=b.contact;
  document.getElementById("bCheckIn").value=b.checkIn;
  document.getElementById("bCheckOut").value=b.checkOut;
  document.getElementById("bPayment").value=b.payment;
  document.getElementById("bNotes").value=b.notes||"";
  document.getElementById("bQuotationPdf").value="";
  populateRoomDropdown(b.roomId);
  openModal("bookingModal");
}
function populateRoomDropdown(curId) {
  document.getElementById("bRoom").innerHTML=`<option value="">Select room…</option>`+
    Store.rooms.all().filter(r=>r.status==="available"||r.id===curId).map(r=>`<option value="${r.id}"${r.id===curId?" selected":""}>${esc(roomLabel(r))} — ${formatCurrency(r.price)}/night</option>`).join("");
}
async function saveBooking(e) {
  e.preventDefault();
  if(!Auth.can("manage_bookings")){showToast("Permission denied.","error");return;}
  const id=document.getElementById("bookingId").value;
  const pdfFile=document.getElementById("bQuotationPdf").files?.[0];
  const d={customerName:document.getElementById("bCustomerName").value.trim(),contact:document.getElementById("bContact").value.trim(),checkIn:document.getElementById("bCheckIn").value,checkOut:document.getElementById("bCheckOut").value,roomId:document.getElementById("bRoom").value,payment:document.getElementById("bPayment").value,notes:document.getElementById("bNotes").value.trim()};
  let v=true;
  [["bCustomerName",d.customerName],["bContact",d.contact],["bCheckIn",d.checkIn],["bCheckOut",d.checkOut],["bRoom",d.roomId],["bPayment",d.payment]].forEach(([fid,val])=>{const el=document.getElementById(fid);if(!val){el.classList.add("error");v=false;}else el.classList.remove("error");});
  if(!v){showToast("Please fill in all required fields.","error");return;}
  if(new Date(d.checkOut)<=new Date(d.checkIn)){document.getElementById("bCheckOut").classList.add("error");showToast("Check-out must be after check-in.","error");return;}
  if(pdfFile && pdfFile.type !== "application/pdf" && !/\.pdf$/i.test(pdfFile.name)){showToast("Only PDF files are allowed.","error");return;}
  try {
    const saved = id ? await Api.bookings.update(id,d) : await Api.bookings.create(d);
    if(pdfFile) await Api.bookings.uploadAttachment(saved.id,pdfFile);
    if(id){Store.bookings.update(id,saved);Store.activity.log(`Updated room booking for ${d.customerName}`);showToast(pdfFile?"Booking updated and PDF attached.":"Booking updated.","success");}else{Store.bookings.add(saved);Store.activity.log(`Created room booking for ${d.customerName}`);showToast(pdfFile?"Booking added and PDF attached.":"Booking added.","success");}
    await refreshFromApi();
    closeModal("bookingModal"); renderBookings(); renderDashboard();
  } catch (err) {
    showToast(err.message || "Could not save booking.","error");
  }
}


/* ============================================================
   6. VENUE BOOKINGS
   ============================================================ */
let _activeVenueType = "";

function getVenueFilters() {
  return {
    q:    (document.getElementById("venueSearch")?.value||"").toLowerCase(),
    from: document.getElementById("vFilterFrom")?.value||"",
    to:   document.getElementById("vFilterTo")?.value||"",
    type: _activeVenueType || document.getElementById("vFilterType")?.value||"",
    pay:  document.getElementById("vFilterPayment")?.value||""
  };
}

function renderVenues() {
  const {q,from,to,type,pay} = getVenueFilters();
  const canEdit = Auth.can("manage_venues");
  document.getElementById("addVenueBtn").style.display = canEdit?"":"none";

  let data = Store.venues.all();
  if(q)     data = data.filter(v=>v.clientName.toLowerCase().includes(q)||v.eventType.toLowerCase().includes(q)||(v.contact||"").toLowerCase().includes(q));
  if(from||to) data = data.filter(v=>inRange(v.date,from,to));
  if(type)  data = data.filter(v=>v.venueType===type);
  if(pay)   data = data.filter(v=>v.payment===pay);
  data.sort((a,b)=>b.date.localeCompare(a.date));

  const VENUE_COLORS = {"Lapa":"#6b9e6e","Event Hall":"#2d6aa3","Conference Room":"#9b59b6","Pool Area":"#00a8cc","Garden":"#3aaf3a","Boma":"#c47b1a","Boardroom":"#8b4513"};

  document.getElementById("venuesTbody").innerHTML = data.length===0
    ? `<tr class="empty-row"><td colspan="11">No venue bookings found</td></tr>`
    : data.map((v,i)=>`<tr>
        <td><span class="row-id">#${String(i+1).padStart(3,"0")}</span></td>
        <td><strong>${esc(v.clientName)}</strong></td>
        <td>${esc(v.contact)}</td>
        <td><span class="venue-type-badge" style="background:${VENUE_COLORS[v.venueType]||"#999"}20;color:${VENUE_COLORS[v.venueType]||"#999"}">${esc(v.venueType)}</span></td>
        <td>${esc(v.eventType)}</td>
        <td>${formatDate(v.date)}</td>
        <td>${v.time||"—"}</td>
        <td>${v.guests||"—"}</td>
        <td><strong>${formatCurrency(v.amount||0)}</strong></td>
        <td>${badge(v.payment,v.payment)}</td>
        <td><div class="action-btns">${canEdit?`<button class="btn-icon edit" onclick="openEditVenue('${v.id}')"><i data-lucide="pencil"></i></button><button class="btn-icon delete" onclick="confirmDelete('venue','${v.id}','venue booking for ${esc(v.clientName)}')"><i data-lucide="trash-2"></i></button>`:"—"}</div></td>
      </tr>`).join("");
  lucide.createIcons();
}

function openNewVenue() {
  document.getElementById("venueModalTitle").textContent="New Venue Booking";
  document.getElementById("venueForm").reset();
  document.getElementById("venueBookingId").value="";
  openModal("venueModal");
}
function openEditVenue(id) {
  const v=Store.venues.find(id);if(!v)return;
  document.getElementById("venueModalTitle").textContent="Edit Venue Booking";
  document.getElementById("venueBookingId").value=v.id;
  document.getElementById("vClientName").value=v.clientName;
  document.getElementById("vContact").value=v.contact;
  document.getElementById("vVenueType").value=v.venueType;
  document.getElementById("vEventType").value=v.eventType;
  document.getElementById("vDate").value=v.date;
  document.getElementById("vTime").value=v.time||"";
  document.getElementById("vGuests").value=v.guests||"";
  document.getElementById("vAmount").value=v.amount||"";
  document.getElementById("vPayment").value=v.payment;
  document.getElementById("vNotes").value=v.notes||"";
  openModal("venueModal");
}
async function saveVenue(e) {
  e.preventDefault();
  if(!Auth.can("manage_venues")){showToast("Permission denied.","error");return;}
  const id=document.getElementById("venueBookingId").value;
  const d={clientName:document.getElementById("vClientName").value.trim(),contact:document.getElementById("vContact").value.trim(),venueType:document.getElementById("vVenueType").value,eventType:document.getElementById("vEventType").value.trim(),date:document.getElementById("vDate").value,time:document.getElementById("vTime").value,guests:parseInt(document.getElementById("vGuests").value||0),amount:parseFloat(document.getElementById("vAmount").value||0),payment:document.getElementById("vPayment").value,notes:document.getElementById("vNotes").value.trim()};
  let v=true;
  [["vClientName",d.clientName],["vContact",d.contact],["vVenueType",d.venueType],["vEventType",d.eventType],["vDate",d.date],["vTime",d.time],["vPayment",d.payment]].forEach(([fid,val])=>{const el=document.getElementById(fid);if(!val){el.classList.add("error");v=false;}else el.classList.remove("error");});
  if(!v){showToast("Please fill in all required fields.","error");return;}
  try {
    const saved = id ? await Api.venues.update(id,d) : await Api.venues.create(d);
    if(id){Store.venues.update(id,saved);Store.activity.log(`Updated venue booking for ${d.clientName}`);showToast("Venue booking updated.","success");}else{Store.venues.add(saved);Store.activity.log(`Created venue booking for ${d.clientName}`);showToast("Venue booking added.","success");}
    await refreshFromApi();
    closeModal("venueModal"); renderVenues(); renderDashboard();
  } catch (err) {
    showToast(err.message || "Could not save venue booking.","error");
  }
}


/* ============================================================
   7. ROOMS
   ============================================================ */
function renderRooms(sf="",tf="") {
  let data=Store.rooms.all();
  if(sf) data=data.filter(r=>r.status===sf);
  if(tf) data=data.filter(r=>r.type===tf);
  const canM=Auth.can("manage_rooms");
  document.getElementById("addRoomBtn").style.display=canM?"":"none";
  document.getElementById("roomsGrid").innerHTML=data.length===0
    ?`<div class="empty-state" style="grid-column:1/-1"><i data-lucide="bed-double"></i><p>No rooms match filters.</p></div>`
    :data.map(r=>`<div class="room-card ${r.status}"><div class="room-card-header"><span class="room-num-large">${esc(r.number)}</span>${badge(r.status,r.status.charAt(0).toUpperCase()+r.status.slice(1))}</div><div class="room-card-body"><div class="room-meta"><i data-lucide="tag"></i>${esc(r.type)}</div><div class="room-meta"><i data-lucide="users"></i>Up to ${r.capacity} guests</div><div class="room-price">${formatCurrency(r.price)}<span>/night</span></div></div>${canM?`<div class="room-card-actions"><button class="btn-icon edit" onclick="openEditRoom('${r.id}')"><i data-lucide="pencil"></i></button><button class="btn-icon delete" onclick="confirmDelete('room','${r.id}','Room ${esc(r.number)}')"><i data-lucide="trash-2"></i></button></div>`:""}</div>`).join("");
  lucide.createIcons();
}

function openNewRoom()    { document.getElementById("roomModalTitle").textContent="Add Room";document.getElementById("roomForm").reset();document.getElementById("roomId").value="";openModal("roomModal"); }
function openEditRoom(id) { const r=Store.rooms.find(id);if(!r)return;document.getElementById("roomModalTitle").textContent="Edit Room";document.getElementById("roomId").value=r.id;document.getElementById("rNumber").value=r.number;document.getElementById("rType").value=r.type;document.getElementById("rPrice").value=r.price;document.getElementById("rCapacity").value=r.capacity;document.getElementById("rStatus").value=r.status;openModal("roomModal"); }
async function saveRoom(e) {
  e.preventDefault();if(!Auth.can("manage_rooms")){showToast("Permission denied.","error");return;}
  const id=document.getElementById("roomId").value,num=document.getElementById("rNumber").value.trim(),type=document.getElementById("rType").value,price=parseFloat(document.getElementById("rPrice").value),cap=parseInt(document.getElementById("rCapacity").value,10),status=document.getElementById("rStatus").value;
  let v=true;[["rNumber",num],["rType",type],["rStatus",status]].forEach(([fid,val])=>{const el=document.getElementById(fid);if(!val){el.classList.add("error");v=false;}else el.classList.remove("error");});
  if(isNaN(price)||price<0){document.getElementById("rPrice").classList.add("error");v=false;}
  if(isNaN(cap)||cap<1){document.getElementById("rCapacity").classList.add("error");v=false;}
  if(!v){showToast("Fill in all required fields.","error");return;}
  const d={number:num,type,price,capacity:cap,status};
  try {
    if(!id && Store.rooms.all().some(r=>r.number===num)){showToast(`Room ${num} exists.`,"error");return;}
    const saved = id ? await Api.rooms.update(id,d) : await Api.rooms.create(d);
    if(id){Store.rooms.update(id,saved);Store.activity.log(`Updated room ${num}`);showToast("Room updated.","success");}else{Store.rooms.add(saved);Store.activity.log(`Created room ${num}`);showToast("Room added.","success");}
    await refreshFromApi();
    closeModal("roomModal");renderRooms(document.getElementById("roomStatusFilter")?.value||"",document.getElementById("roomTypeFilter")?.value||"");renderDashboard();
  } catch (err) {
    showToast(err.message || "Could not save room.","error");
  }
}


/* ============================================================
   8. CUSTOMERS / GUESTS
   ============================================================ */
function buildGuestList() {
  const map={};
  Store.bookings.all().forEach(b=>{
    const k=b.customerName.toLowerCase().trim()+"|"+b.contact.toLowerCase().trim();
    if(!map[k])map[k]={name:b.customerName,contact:b.contact,roomBks:[],venueBks:[],totalSpent:0};
    map[k].roomBks.push(b);map[k].totalSpent+=roomRevenue(b);
  });
  Store.venues.all().forEach(v=>{
    const k=v.clientName.toLowerCase().trim()+"|"+(v.contact||"").toLowerCase().trim();
    if(!map[k])map[k]={name:v.clientName,contact:v.contact||"",roomBks:[],venueBks:[],totalSpent:0};
    map[k].venueBks.push(v);if(v.payment==="Paid")map[k].totalSpent+=Number(v.amount||0);
  });
  return Object.values(map).sort((a,b)=>a.name.localeCompare(b.name));
}

function renderCustomers(filter="") {
  let data=buildGuestList();
  if(filter){const q=filter.toLowerCase();data=data.filter(c=>c.name.toLowerCase().includes(q)||c.contact.toLowerCase().includes(q));}
  document.getElementById("customersTbody").innerHTML=data.length===0
    ?`<tr class="empty-row"><td colspan="7">No guests found</td></tr>`
    :data.map(c=>{
        const allDates=[...c.roomBks.map(b=>b.checkIn),...c.venueBks.map(v=>v.date)].sort((a,b)=>b.localeCompare(a));
        return`<tr><td><strong>${esc(c.name)}</strong></td><td>${esc(c.contact)}</td><td>${c.roomBks.length}</td><td>${c.venueBks.length}</td><td>${formatCurrency(c.totalSpent)}</td><td>${allDates[0]?formatDate(allDates[0]):"—"}</td><td><button class="btn-icon view" onclick="openGuestDetail('${encodeURIComponent(c.name)}','${encodeURIComponent(c.contact)}')"><i data-lucide="eye"></i></button></td></tr>`;
      }).join("");
  lucide.createIcons();
}

function openGuestDetail(en,ec) {
  const name=decodeURIComponent(en),contact=decodeURIComponent(ec);
  const c=buildGuestList().find(x=>x.name===name&&x.contact===contact);if(!c)return;
  document.getElementById("customerModalName").textContent=c.name;
  const roomRows=c.roomBks.sort((a,b)=>b.checkIn.localeCompare(a.checkIn)).map(b=>{const r=Store.rooms.find(b.roomId);const n=nightsBetween(b.checkIn,b.checkOut);return`<tr><td>${r?esc(roomLabel(r)):"—"}</td><td>${formatDate(b.checkIn)}</td><td>${formatDate(b.checkOut)}</td><td>${n}n</td><td>${badge(b.payment,b.payment)}</td><td>${formatCurrency(roomRevenue(b))}</td></tr>`;}).join("");
  const venueRows=c.venueBks.sort((a,b)=>b.date.localeCompare(a.date)).map(v=>`<tr><td>${esc(v.venueType)}</td><td>${esc(v.eventType)}</td><td>${formatDate(v.date)}</td><td>${v.guests}</td><td>${badge(v.payment,v.payment)}</td><td>${formatCurrency(v.amount||0)}</td></tr>`).join("");
  document.getElementById("customerModalBody").innerHTML=`
    <div class="customer-info-row">
      <div class="customer-info-item"><span class="info-label">Contact</span><span class="info-value">${esc(contact)}</span></div>
      <div class="customer-info-item"><span class="info-label">Room Bookings</span><span class="info-value">${c.roomBks.length}</span></div>
      <div class="customer-info-item"><span class="info-label">Venue Bookings</span><span class="info-value">${c.venueBks.length}</span></div>
      <div class="customer-info-item"><span class="info-label">Total Spent</span><span class="info-value">${formatCurrency(c.totalSpent)}</span></div>
    </div>
    ${c.roomBks.length>0?`<h3 style="margin:14px 0 8px;font-size:1rem">Room Stays</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>Room</th><th>Check-in</th><th>Check-out</th><th>Nights</th><th>Payment</th><th>Revenue</th></tr></thead><tbody>${roomRows}</tbody></table></div>`:""}
    ${c.venueBks.length>0?`<h3 style="margin:14px 0 8px;font-size:1rem">Venue Bookings</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>Venue</th><th>Event</th><th>Date</th><th>Guests</th><th>Payment</th><th>Amount</th></tr></thead><tbody>${venueRows}</tbody></table></div>`:""}`;
  openModal("customerModal");lucide.createIcons();
}
/* ============================================================
   9. CLOCK-IN SYSTEM
   ============================================================ */
let _ciInterval = null;
let _activeShiftView = "today";
let _pendingClock = null;
let _apiOnline = false;
let _systemStatus = { loginLocked:false, lockMessage:"Access is currently closed. Please contact the developers for access." };

function enforceSystemLock(status = _systemStatus) {
  _systemStatus = status || _systemStatus;
  if (_systemStatus.loginLocked && currentSession.role !== "developer") {
    alert(_systemStatus.lockMessage || "Access is currently closed. Please contact the developers for access.");
    Auth.logout();
    return true;
  }
  return false;
}

async function refreshSystemStatus() {
  try {
    _systemStatus = await Api.system.status();
  } catch {
    // Keep the last known state if the status check fails.
  }
  return _systemStatus;
}

async function toggleLoginLock() {
  if (currentSession.role !== "developer") return;
  const nextLocked = !_systemStatus.loginLocked;
  const ok = confirm(nextLocked
    ? "Close access for all owner and reception users now?"
    : "Re-open access for owner and reception users?");
  if (!ok) return;
  try {
    _systemStatus = await Api.system.setLoginLock(nextLocked);
    Store.activity.log(`${nextLocked ? "Closed" : "Opened"} login access for non-developers`);
    showToast(nextLocked ? "User access closed. Non-developers will be logged out." : "User access opened.","success");
    renderDevSecret();
  } catch (err) {
    showToast(err.message || "Could not update user access.","error");
  }
}

function renderClockIn() {
  clearInterval(_ciInterval);
  function tick() {
    document.getElementById("ciClock").textContent = new Date().toLocaleTimeString("en-ZA",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
    document.getElementById("ciDate").textContent  = new Date().toLocaleDateString("en-ZA",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
  }
  tick(); _ciInterval = setInterval(tick,1000);
  document.getElementById("sspSession").textContent = currentSession.name;

  renderStaffGrid();

  const canM = Auth.can("manage_clockin");
  document.getElementById("shiftFilterBar").style.display  = canM?"":"none";
  document.getElementById("shiftActionHeader").textContent = canM?"Actions":"";

  document.querySelectorAll(".shift-tab").forEach(btn=>btn.addEventListener("click",()=>{
    document.querySelectorAll(".shift-tab").forEach(t=>t.classList.remove("active"));
    btn.classList.add("active"); _activeShiftView=btn.dataset.shift; renderShiftsTable();
  }));
  renderShiftsTable();
}

// Clockable people come from the backend staff register.
function getAllClockableStaff() {
  return Store.staff.all()
    .filter(s=>s.status==="active")
    .map(s=>({id:s.id,name:s.name,department:s.department,isLogin:false}))
    .sort((a,b)=>a.name.localeCompare(b.name));
}

function totalHoursToday(staffId) {
  const shifts=Store.shifts.all().filter(s=>s.staffId===staffId&&s.date===today()&&s.clockOut);
  const mins=shifts.reduce((sum,s)=>{const m=Math.floor((new Date(s.clockOut)-new Date(s.clockIn))/60000);return sum+(m>0?m:0);},0);
  const h=Math.floor(mins/60),m=mins%60;return h>0?`${h}h ${m}m`:`${m}m`;
}

function renderStaffGrid() {
  const all = getAllClockableStaff();
  if(all.length===0){
    document.getElementById("sspGrid").innerHTML=`<div class="empty-state" style="grid-column:1/-1"><i data-lucide="users"></i><p>No staff members found. Add staff in Admin.</p></div>`;
    lucide.createIcons();return;
  }
  document.getElementById("sspGrid").innerHTML=all.map(p=>{
    const open=Store.shifts.openShift(p.id);
    const isIn=!!open;
    const lastShift=Store.shifts.all().filter(s=>s.staffId===p.id&&s.date===today()).sort((a,b)=>b.clockIn.localeCompare(a.clockIn))[0];
    return`<div class="staff-clock-card ${isIn?"clocked-in":"clocked-out"}" onclick="promptClock('${p.id}','${esc(p.name).replace(/'/g,"\\'")}','${isIn?"out":"in"}')">
      <div class="scc-avatar ${isIn?"avatar-in":"avatar-out"}">${avatarOf(p.name)}</div>
      <div class="scc-info"><div class="scc-name">${esc(p.name)}</div><div class="scc-dept">${esc(p.department)}</div></div>
      <div class="scc-status">
        ${isIn?`<div class="scc-badge in">● On Shift</div><div class="scc-time">Since ${fmtTime(open.clockIn)}</div>`
              :`<div class="scc-badge out">○ Off Shift</div><div class="scc-time">${lastShift?`Total: ${totalHoursToday(p.id)}`:"Not in yet"}</div>`}
      </div>
      <button class="scc-action-btn ${isIn?"btn-do-out":"btn-do-in"}"><i data-lucide="${isIn?"log-out":"log-in"}"></i>${isIn?"Clock Out":"Clock In"}</button>
    </div>`;
  }).join("");
  lucide.createIcons();
}

function promptClock(staffId,staffName,action) {
  _pendingClock={staffId,staffName,action};
  const time=new Date().toLocaleTimeString("en-ZA",{hour:"2-digit",minute:"2-digit"});
  document.getElementById("clockActionTitle").textContent=`${action==="in"?"Clock In":"Clock Out"} — ${staffName}`;
  document.getElementById("clockActionBody").innerHTML=`
    <div class="clock-action-info">
      <div class="cai-avatar">${avatarOf(staffName)}</div>
      <div class="cai-details">
        <div class="cai-name">${esc(staffName)}</div>
        <div class="cai-action ${action==="in"?"cai-in":"cai-out"}">
          <i data-lucide="${action==="in"?"log-in":"log-out"}"></i>
          ${action==="in"?"Clock In":"Clock Out"} at ${time}
        </div>
        <div class="cai-note">Recorded by: ${esc(currentSession.name)}</div>
      </div>
    </div>`;
  lucide.createIcons({nodes:[document.getElementById("clockActionBody")]});
  openModal("clockActionModal");
}

async function executeClock() {
  if(!_pendingClock)return;
  const{staffId,staffName,action}=_pendingClock;
  const person=Store.users.find(staffId)||Store.staff.find(staffId);
  if(!person){showToast("Staff member not found.","error");return;}
  const dept=person.department||"Staff";

  if(action==="in"){
    if(Store.shifts.openShift(staffId)){showToast(`${staffName} is already clocked in.`,"info");closeModal("clockActionModal");return;}
    try {
      const saved = await Api.shifts.clockIn(staffId);
      Store.shifts.add({...saved, staffName, department:dept, recordedBy:currentSession.name});
      Store.activity.log(`Clocked in ${staffName}`);
      showToast(`${staffName} clocked in`,"success");
    } catch (err) {
      showToast(err.message || "Could not clock staff in.","error");return;
    }
  } else {
    const open=Store.shifts.openShift(staffId);
    if(!open){showToast(`${staffName} is not clocked in.`,"error");closeModal("clockActionModal");return;}
    try {
      const saved = await Api.shifts.clockOut(open.id);
      Store.shifts.update(open.id,{...saved, staffName, department:dept, recordedBy:currentSession.name});
      Store.activity.log(`Clocked out ${staffName}`);
      showToast(`${staffName} clocked out. Duration: ${shiftDur(open.clockIn,new Date().toISOString())}`,"success");
    } catch (err) {
      showToast(err.message || "Could not clock staff out.","error");return;
    }
  }
  await refreshFromApi();
  _pendingClock=null;closeModal("clockActionModal");renderStaffGrid();renderShiftsTable();renderDashboard();
}
function renderShiftsTable() {
  const canM=Auth.can("manage_clockin");
  const q=(document.getElementById("shiftSearch")?.value||"").toLowerCase();
  const dept=document.getElementById("shiftDeptFilter")?.value||"";
  let shifts=_activeShiftView==="today"?Store.shifts.todayAll():_activeShiftView==="week"?Store.shifts.thisWeek():Store.shifts.all();
  if(q)    shifts=shifts.filter(s=>(s.staffName||"").toLowerCase().includes(q));
  if(dept) shifts=shifts.filter(s=>s.department===dept);
  shifts.sort((a,b)=>b.clockIn.localeCompare(a.clockIn));

  document.getElementById("shiftsTbody").innerHTML=shifts.length===0
    ?`<tr class="empty-row"><td colspan="9">No shift records found</td></tr>`
    :shifts.map(s=>{const isOpen=!s.clockOut;return`<tr>
        <td><div style="display:flex;align-items:center;gap:8px"><div class="mini-avatar" style="background:#e8f2fc;color:#2d6aa3;font-size:.65rem">${avatarOf(s.staffName||"?")}</div><strong>${esc(s.staffName||"?")}</strong></div></td>
        <td>${esc(s.department||"—")}</td>
        <td>${formatDate(s.date)}</td>
        <td>${fmtTime(s.clockIn)}</td>
        <td>${isOpen?`<span style="color:var(--text-muted);font-style:italic">Still on shift</span>`:fmtTime(s.clockOut)}</td>
        <td><strong>${shiftDur(s.clockIn,s.clockOut)}</strong></td>
        <td>${isOpen?`<span class="badge badge-available">● Active</span>`:`<span class="badge badge-booked">Completed</span>`}</td>
        <td style="font-size:.78rem;color:var(--text-muted)">${esc(s.recordedBy||"—")}</td>
        <td>${canM?`<div class="action-btns"><button class="btn-icon edit" onclick="openEditShift('${s.id}')"><i data-lucide="pencil"></i></button><button class="btn-icon delete" onclick="confirmDelete('shift','${s.id}','shift record for ${esc(s.staffName)}')"><i data-lucide="trash-2"></i></button></div>`:""}</td>
      </tr>`;}).join("");
  lucide.createIcons();
}

function openEditShift(id) {
  const s=Store.shifts.find(id);if(!s)return;
  document.getElementById("shiftId").value=s.id;
  document.getElementById("sClockIn").value=s.clockIn?new Date(s.clockIn).toTimeString().slice(0,5):"";
  document.getElementById("sClockOut").value=s.clockOut?new Date(s.clockOut).toTimeString().slice(0,5):"";
  document.getElementById("sNote").value=s.note||"";
  document.getElementById("shiftModalTitle").textContent=`Edit shift — ${s.staffName}`;
  openModal("shiftModal");
}
function saveShift(e) {
  e.preventDefault();
  const id=document.getElementById("shiftId").value;
  const tin=document.getElementById("sClockIn").value,tout=document.getElementById("sClockOut").value;
  const s=Store.shifts.find(id);if(!s)return;
  const ri=dt=>dt?new Date(`${s.date}T${dt}:00`).toISOString():null;
  Store.shifts.update(id,{clockIn:ri(tin),clockOut:tout?ri(tout):null,note:document.getElementById("sNote").value.trim()});
  Store.activity.log(`Edited shift for ${s.staffName}`);showToast("Shift updated.","success");
  closeModal("shiftModal");renderShiftsTable();renderDashboard();
}

function exportShiftsCSV() {
  let shifts=_activeShiftView==="today"?Store.shifts.todayAll():_activeShiftView==="week"?Store.shifts.thisWeek():Store.shifts.all();
  const q=(document.getElementById("shiftSearch")?.value||"").toLowerCase();
  const dept=document.getElementById("shiftDeptFilter")?.value||"";
  if(q)    shifts=shifts.filter(s=>(s.staffName||"").toLowerCase().includes(q));
  if(dept) shifts=shifts.filter(s=>s.department===dept);
  const header="Name,Department,Date,Clock In,Clock Out,Duration,Status,Recorded By";
  const rows=shifts.map(s=>[`"${s.staffName||""}"`,`"${s.department||""}"`,s.date,fmtTime(s.clockIn),s.clockOut?fmtTime(s.clockOut):"Active",shiftDur(s.clockIn,s.clockOut),s.clockOut?"Completed":"Active",`"${s.recordedBy||""}"`].join(","));
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([[header,...rows].join("\n")],{type:"text/csv"}));a.download=`lasev-shifts-${today()}.csv`;a.click();
  showToast("Shifts exported.","success");
}

function downloadText(filename, text, type="text/plain") {
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([text],{type}));
  a.download=filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function csvCell(value) {
  return `"${String(value ?? "").replace(/"/g,'""')}"`;
}

function exportAllDataBackup() {
  const payload = {
    exportedAt:new Date().toISOString(),
    app:"Lasev Resort",
    data:Store.getAllRaw()
  };
  downloadText(`lasev-backup-${today()}.json`, JSON.stringify(payload,null,2), "application/json");
  Store.activity.log("Exported full data backup");
  showToast("Backup exported.","success");
}

function exportBookingBackup() {
  const payload = {
    type:"lasev-booking-backup",
    version:1,
    exportedAt:new Date().toISOString(),
    app:"Lasev Resort",
    rooms:Store.rooms.all(),
    roomBookings:Store.bookings.all(),
    venueBookings:Store.venues.all()
  };
  downloadText(`lasev-booking-backup-${today()}.json`, JSON.stringify(payload,null,2), "application/json");
  Store.activity.log("Exported booking backup");
  showToast("Booking backup exported.","success");
}

function exportBookingsCSV() {
  const header=["Guest","Contact","Room","Check In","Check Out","Nights","Payment","Notes"];
  const rows=Store.bookings.all().map(b=>{
    const r=Store.rooms.find(b.roomId);
    return [b.customerName,b.contact,r?roomLabel(r):b.roomId,b.checkIn,b.checkOut,nightsBetween(b.checkIn,b.checkOut),b.payment,b.notes||""].map(csvCell).join(",");
  });
  downloadText(`lasev-room-bookings-${today()}.csv`, [header.join(","),...rows].join("\n"), "text/csv");
  Store.activity.log("Exported room bookings CSV");
  showToast("Room bookings exported.","success");
}

function normalizeRoomBookingsFromBackup(parsed) {
  const bookings = Array.isArray(parsed) ? parsed : (parsed.roomBookings || parsed.bookings || parsed.data?.bookings);
  if (!Array.isArray(bookings)) throw new Error("This file does not contain room bookings.");
  return bookings.map(b=>({
    id:b.id||uid("b"),
    customerName:String(b.customerName||b.customer_name||"").trim(),
    contact:String(b.contact||"").trim(),
    roomId:String(b.roomId||b.room_id||"").trim(),
    checkIn:b.checkIn||b.check_in,
    checkOut:b.checkOut||b.check_out,
    payment:b.payment,
    notes:b.notes||"",
    createdAt:b.createdAt||b.created_at||today()
  })).filter(b=>b.customerName&&b.contact&&b.roomId&&b.checkIn&&b.checkOut&&b.payment);
}

function normalizeVenueBookingsFromBackup(parsed) {
  const venues = Array.isArray(parsed) ? parsed : (parsed.venueBookings || parsed.venues || parsed.data?.venues);
  if (!Array.isArray(venues)) throw new Error("This file does not contain venue bookings.");
  return venues.map(v=>({
    id:v.id||uid("v"),
    clientName:String(v.clientName||v.client_name||"").trim(),
    contact:String(v.contact||"").trim(),
    venueType:v.venueType||v.venue_type,
    eventType:String(v.eventType||v.event_type||"").trim(),
    date:v.date||v.event_date,
    time:v.time||v.event_time,
    guests:Number(v.guests||0),
    amount:Number(v.amount||0),
    payment:v.payment,
    notes:v.notes||"",
    createdAt:v.createdAt||v.created_at||today()
  })).filter(v=>v.clientName&&v.contact&&v.venueType&&v.eventType&&v.date&&v.time&&v.payment);
}

function exportRoomBookingsJSON() {
  const payload = {
    type:"lasev-room-bookings",
    exportedAt:new Date().toISOString(),
    bookings:Store.bookings.all()
  };
  downloadText(`lasev-room-bookings-${today()}.json`, JSON.stringify(payload,null,2), "application/json");
  Store.activity.log("Exported room bookings JSON");
  showToast("Room bookings exported.","success");
}

function importRoomBookingsJSON(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const cleaned = normalizeRoomBookingsFromBackup(parsed);
      if (!cleaned.length) throw new Error("No valid bookings found in the file.");
      if (!confirm(`Import ${cleaned.length} room bookings? This will replace current local room bookings.`)) return;
      Store.replaceAll({bookings:cleaned});
      Store.activity.log(`Imported ${cleaned.length} room bookings`);
      renderBookings();
      renderDashboard();
      showToast("Room bookings imported.","success");
    } catch (err) {
      showToast(err.message || "Could not import bookings.","error");
    }
  };
  reader.readAsText(file);
}

function exportVenuesCSV() {
  const header=["Client","Contact","Venue","Event","Date","Time","Guests","Amount","Payment","Notes"];
  const rows=Store.venues.all().map(v=>[v.clientName,v.contact,v.venueType,v.eventType,v.date,v.time,v.guests,v.amount,v.payment,v.notes||""].map(csvCell).join(","));
  downloadText(`lasev-venue-bookings-${today()}.csv`, [header.join(","),...rows].join("\n"), "text/csv");
  Store.activity.log("Exported venue bookings CSV");
  showToast("Venue bookings exported.","success");
}

function exportClientsCSV() {
  const header=["Client","Contact","Room Bookings","Venue Bookings","Total Spent","Last Visit"];
  const rows=buildGuestList().map(c=>{
    const allDates=[...c.roomBks.map(b=>b.checkIn),...c.venueBks.map(v=>v.date)].filter(Boolean).sort((a,b)=>b.localeCompare(a));
    return [c.name,c.contact,c.roomBks.length,c.venueBks.length,c.totalSpent,allDates[0]||""].map(csvCell).join(",");
  });
  downloadText(`lasev-clients-${today()}.csv`, [header.join(","),...rows].join("\n"), "text/csv");
  Store.activity.log("Exported clients CSV");
  showToast("Clients exported.","success");
}

function exportLoginActivityCSV() {
  if (currentSession.role !== "developer") {
    showToast("Only developers can export activity.","error");
    return;
  }
  const logs=Store.activity.all().sort((a,b)=>new Date(b.at)-new Date(a.at));
  const header=["Date","User","Role","Action"];
  const rows=logs.map(l=>[l.at,l.user||"System",l.role||"",l.action||""].map(csvCell).join(","));
  downloadText(`lasev-login-activity-${today()}.csv`, [header.join(","),...rows].join("\n"), "text/csv");
  Store.activity.log("Exported login activity CSV");
  showToast("Login activity exported.","success");
}

function exportVenueBookingsJSON() {
  const payload = {
    type:"lasev-venue-bookings",
    exportedAt:new Date().toISOString(),
    venues:Store.venues.all()
  };
  downloadText(`lasev-venue-bookings-${today()}.json`, JSON.stringify(payload,null,2), "application/json");
  Store.activity.log("Exported venue bookings JSON");
  showToast("Venue bookings exported.","success");
}

function importVenueBookingsJSON(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const cleaned = normalizeVenueBookingsFromBackup(parsed);
      if (!cleaned.length) throw new Error("No valid venue bookings found in the file.");
      if (!confirm(`Import ${cleaned.length} venue bookings? This will replace current local venue bookings.`)) return;
      Store.replaceAll({venues:cleaned});
      Store.activity.log(`Imported ${cleaned.length} venue bookings`);
      renderVenues();
      renderDashboard();
      showToast("Venue bookings imported.","success");
    } catch (err) {
      showToast(err.message || "Could not import venue bookings.","error");
    }
  };
  reader.readAsText(file);
}

function importBookingBackup(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const rooms = parsed.rooms || parsed.data?.rooms;
      const roomBookings = normalizeRoomBookingsFromBackup(parsed);
      const venueBookings = normalizeVenueBookingsFromBackup(parsed);
      const next = {bookings:roomBookings, venues:venueBookings};
      if (Array.isArray(rooms) && rooms.length) next.rooms = rooms;
      if (!confirm(`Import ${roomBookings.length} room bookings and ${venueBookings.length} venue bookings? This will replace current local bookings.`)) return;
      Store.replaceAll(next);
      Store.activity.log(`Imported booking backup (${roomBookings.length} rooms, ${venueBookings.length} venues)`);
      renderBookings();
      renderVenues();
      renderDashboard();
      showToast("Booking backup imported.","success");
    } catch (err) {
      showToast(err.message || "Could not import booking backup.","error");
    }
  };
  reader.readAsText(file);
}

function exportAllShiftsCSV() {
  const header=["Name","Department","Date","Clock In","Clock Out","Duration","Status","Recorded By"];
  const rows=Store.shifts.all().map(s=>[s.staffName||"",s.department||"",s.date,fmtTime(s.clockIn),s.clockOut?fmtTime(s.clockOut):"Active",shiftDur(s.clockIn,s.clockOut),s.clockOut?"Completed":"Active",s.recordedBy||""].map(csvCell).join(","));
  downloadText(`lasev-shifts-all-${today()}.csv`, [header.join(","),...rows].join("\n"), "text/csv");
  Store.activity.log("Exported shifts CSV");
  showToast("Shifts exported.","success");
}

async function runDeveloperHealthCheck() {
  const out = document.getElementById("devToolOutput");
  if (!out) return;
  const results = [];
  for (const path of ["/api/health","/api/ready"]) {
    try {
      const res = await fetch(path);
      const body = await res.json().catch(()=>({}));
      results.push(`${path}: ${res.status} ${body.status || body.app || ""}`);
    } catch (err) {
      results.push(`${path}: failed (${err.message})`);
    }
  }
  out.innerHTML = results.map(r=>`<div class="dsp-info-row"><span class="dsp-key">${esc(r.split(":")[0])}</span><span class="dsp-val">${esc(r.split(":").slice(1).join(":").trim())}</span></div>`).join("");
  Store.activity.log("Ran developer health check");
}

function exportDebugBundle() {
  const bundle = {
    exportedAt:new Date().toISOString(),
    session:{name:currentSession.name,role:currentSession.role,isGhost:currentSession.isGhost,actingDeveloper:currentSession.actingDeveloper||null},
    apiOnline:_apiOnline,
    counts:Object.fromEntries(Object.entries(Store.getAllRaw()).map(([k,v])=>[k,Array.isArray(v)?v.length:0])),
    userAgent:navigator.userAgent,
    location:location.href
  };
  downloadText(`lasev-debug-${today()}.json`, JSON.stringify(bundle,null,2), "application/json");
  Store.activity.log("Exported developer debug bundle");
  showToast("Debug bundle exported.","success");
}

function exportDeveloperHandoverPack() {
  const data = Store.getAllRaw();
  const activeRoomBookings = data.bookings.filter(b=>b.payment!=="Cancelled");
  const activeVenueBookings = data.venues.filter(v=>v.payment!=="Cancelled");
  const openMessages = data.messages.filter(m=>(m.status||"open")==="open");
  const estimatedRoomRevenue = activeRoomBookings.reduce((sum,b)=>sum+roomRevenue(b),0);
  const estimatedVenueRevenue = activeVenueBookings.reduce((sum,v)=>sum+Number(v.amount||0),0);
  const pack = {
    type:"lasev-developer-handover",
    version:1,
    exportedAt:new Date().toISOString(),
    developer:currentSession.name,
    environment:{
      apiOnline:_apiOnline,
      origin:location.origin,
      path:location.pathname,
      userAgent:navigator.userAgent
    },
    accounts:{
      visibleLoginUsers:data.users.map(u=>({name:u.name,role:u.role,department:u.department,status:u.status,isGhost:Boolean(u.isGhost)})),
      staffRegisterCount:data.staff.length
    },
    businessSnapshot:{
      rooms:data.rooms.length,
      roomBookings:data.bookings.length,
      venueBookings:data.venues.length,
      activeRoomBookings:activeRoomBookings.length,
      activeVenueBookings:activeVenueBookings.length,
      estimatedRevenue:estimatedRoomRevenue+estimatedVenueRevenue,
      openSupportThreads:openMessages.length,
      shiftsStored:data.shifts.length
    },
    recovery:{
      bookingBackupFile:`lasev-booking-backup-${today()}.json`,
      fullBackupFile:`lasev-backup-${today()}.json`,
      reminder:"Export booking and full backups before changing data, migrating the database, or deploying."
    },
    openSupportThreads:openMessages.map(m=>({
      id:m.id,
      subject:m.subject,
      createdBy:m.createdByName,
      recipientRole:m.recipientRole,
      createdAt:m.createdAt
    })),
    recentActivity:Store.activity.all().slice(0,30)
  };
  downloadText(`lasev-developer-handover-${today()}.json`, JSON.stringify(pack,null,2), "application/json");
  Store.activity.log("Exported developer handover pack");
  showToast("Developer handover pack exported.","success");
}

async function copyDeveloperSessionInfo() {
  const text = JSON.stringify({
    name:currentSession.name,
    role:currentSession.role,
    isGhost:currentSession.isGhost,
    actingDeveloper:currentSession.actingDeveloper||null,
    apiOnline:_apiOnline,
    at:new Date().toISOString()
  }, null, 2);
  try {
    await navigator.clipboard.writeText(text);
    showToast("Session info copied.","success");
  } catch {
    console.log(text);
    showToast("Session info logged to console.","info");
  }
}

function restoreDataBackup(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      const data = parsed.data || parsed;
      if (!data || typeof data !== "object") throw new Error("Invalid backup file.");
      if (!confirm("Restore this backup into local storage? Current local data will be replaced.")) return;
      Store.replaceAll(data);
      Store.activity.log(`Restored data backup from ${file.name}`);
      showToast("Backup restored.","success");
      renderDashboard();
      renderAdmin();
    } catch (err) {
      showToast(err.message || "Could not restore backup.","error");
    }
  };
  reader.readAsText(file);
}

function formatBytes(bytes) {
  const size = Number(bytes || 0);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function attachmentDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleString("en-ZA",{day:"numeric",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit"});
}

async function openBookingPdfModal(id) {
  const booking = Store.bookings.find(id);
  if (!booking) return;
  document.getElementById("pdfBookingId").value = id;
  document.getElementById("bookingPdfInput").value = "";
  document.getElementById("bookingPdfModalTitle").textContent = `Quotation PDFs — ${booking.customerName}`;
  openModal("bookingPdfModal");
  await renderBookingPdfList(id);
}

async function renderBookingPdfList(id) {
  const list = document.getElementById("bookingPdfList");
  if (!_apiOnline) {
    list.innerHTML = `<p class="confirm-message">PDF attachments need the backend connection.</p>`;
    return;
  }
  list.innerHTML = `<p class="confirm-message">Loading PDFs…</p>`;
  try {
    const attachments = await Api.bookings.attachments(id);
    const booking = Store.bookings.find(id);
    if (booking) Store.bookings.update(id,{attachmentCount:attachments.length});
    renderBookings();
    list.innerHTML = attachments.length === 0
      ? `<p class="confirm-message">No quotation PDFs attached yet.</p>`
      : attachments.map(a=>`<div class="attachment-item">
          <div class="attachment-meta">
            <i data-lucide="file-text"></i>
            <div><span class="attachment-name">${esc(a.fileName)}</span><span class="attachment-details">${formatBytes(a.fileSize)}${a.uploadedAt?` • ${attachmentDate(a.uploadedAt)}`:""}</span></div>
          </div>
          <div class="attachment-actions">
            <button class="btn-icon view" onclick="previewBookingPdf('${id}','${a.id}')" title="Preview"><i data-lucide="eye"></i></button>
            <button class="btn-icon" onclick="downloadBookingPdf('${id}','${a.id}')" title="Download"><i data-lucide="download"></i></button>
            ${["owner","developer"].includes(currentSession.role)?`<button class="btn-icon delete" onclick="deleteBookingPdf('${id}','${a.id}')" title="Delete"><i data-lucide="trash-2"></i></button>`:""}
          </div>
        </div>`).join("");
    lucide.createIcons();
  } catch (err) {
    list.innerHTML = `<p class="confirm-message">Could not load PDFs.</p>`;
    showToast(err.message || "Could not load PDFs.","error");
  }
}

async function uploadBookingPdf() {
  const id = document.getElementById("pdfBookingId").value;
  const file = document.getElementById("bookingPdfInput").files?.[0];
  if (!id) return;
  if (!_apiOnline) { showToast("PDF attachments need the backend connection.","error"); return; }
  if (!file) { showToast("Choose a PDF first.","error"); return; }
  if (file.type !== "application/pdf" && !/\.pdf$/i.test(file.name)) {
    showToast("Only PDF files are allowed.","error");
    return;
  }
  try {
    await Api.bookings.uploadAttachment(id,file);
    document.getElementById("bookingPdfInput").value = "";
    Store.activity.log(`Attached quotation PDF to booking ${id}`);
    showToast("Quotation PDF uploaded.","success");
    await refreshFromApi();
    await renderBookingPdfList(id);
  } catch (err) {
    showToast(err.message || "Could not upload PDF.","error");
  }
}

async function previewBookingPdf(bookingId, attachmentId) {
  try {
    const blob = await Api.bookings.attachmentBlob(bookingId, attachmentId);
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank", "noopener");
    setTimeout(()=>URL.revokeObjectURL(url), 60000);
  } catch (err) {
    showToast(err.message || "Could not preview PDF.","error");
  }
}

async function downloadBookingPdf(bookingId, attachmentId) {
  try {
    const attachments = await Api.bookings.attachments(bookingId).catch(()=>[]);
    const item = attachments.find(a=>a.id===String(attachmentId));
    const blob = await Api.bookings.attachmentBlob(bookingId, attachmentId, true);
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = item?.fileName || "quotation.pdf";
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (err) {
    showToast(err.message || "Could not download PDF.","error");
  }
}

async function deleteBookingPdf(bookingId, attachmentId) {
  if (!confirm("Delete this quotation PDF?")) return;
  try {
    await Api.bookings.removeAttachment(bookingId, attachmentId);
    Store.activity.log(`Removed quotation PDF from booking ${bookingId}`);
    showToast("Quotation PDF deleted.","info");
    await refreshFromApi();
    await renderBookingPdfList(bookingId);
  } catch (err) {
    showToast(err.message || "Could not delete PDF.","error");
  }
}


/* ============================================================
   11. MESSAGES
   ============================================================ */
let _activeMessageId = null;
let _isComposingMessage = false;
let _activeDevTab = "overview";

function messageParticipantsLabel(m) {
  if (m.recipientRole === "announcement") return "Developer Announcement";
  if (m.recipientRole === "developer") return "Owner ↔ Developer";
  if (m.recipientRole === "owner") return "Employee ↔ Owner";
  return `${m.createdByName || "Owner"} ↔ ${m.recipientUserName || "User"}`;
}

function messageEntries(m) {
  const entries = Array.isArray(m.entries) && m.entries.length
    ? m.entries
    : [{senderId:m.createdBy,senderName:m.createdByName||"Owner",senderRole:"owner",body:m.body,createdAt:m.createdAt}];
  return entries.map(e=>({...e,body:decryptMessageBody(e.body)}));
}

function canViewMessage(m) {
  const sid = String(currentSession.id);
  if (m.recipientRole === "announcement") return true;
  if (currentSession.role === "developer") return String(m.createdBy) === sid || m.recipientRole === "developer";
  if (currentSession.role === "owner") {
    return String(m.createdBy) === sid || m.recipientRole === "owner" || String(m.recipientUserId) === sid;
  }
  return String(m.createdBy) === sid || String(m.recipientUserId) === sid;
}

function unreadMessages() {
  const all = Store.messages.all().filter(canViewMessage);
  return all.filter(m=>m.status!=="closed"&&messageEntries(m).some(e=>String(e.senderId)!==String(currentSession.id)));
}

function updateNotifications() {
  const count = unreadMessages().length;
  const btn = document.getElementById("notificationBtn");
  const el = document.getElementById("notificationCount");
  if (!btn || !el) return;
  btn.classList.toggle("has-unread", count > 0);
  el.textContent = count > 9 ? "9+" : String(count);
}

async function requestNotificationPermission() {
  if (!("Notification" in window)) return;
  if (Notification.permission === "default") await Notification.requestPermission();
}

function notifyUnreadMessages() {
  const unread = unreadMessages();
  if (!unread.length || !("Notification" in window) || Notification.permission !== "granted") return;
  const newest = unread[0];
  const lastId = localStorage.getItem("lasev_last_notified_message");
  if (newest.id === lastId) return;
  localStorage.setItem("lasev_last_notified_message", newest.id);
  new Notification("Lasev Resort message", { body: newest.subject });
}

function renderMessages() {
  const isDev = currentSession.role === "developer";
  const compose = document.getElementById("messageComposeCard");
  if (compose) compose.style.display = "";
  const newBtn = document.getElementById("newMessageBtn");
  if (newBtn) newBtn.style.display = "";
  configureMessageComposer();

  const messages = Store.messages.all().filter(canViewMessage);
  const list = document.getElementById("messageList");
  if (!list) return;
  if (!_activeMessageId && messages.length) _activeMessageId = messages[0].id;
  if (_activeMessageId && !messages.some(m=>m.id===_activeMessageId)) _activeMessageId = messages[0]?.id || null;

  list.innerHTML = messages.length === 0
    ? `<div class="empty-state"><i data-lucide="message-square"></i><p>No messages yet</p></div>`
    : messages.map(m => {
        const unread = m.status !== "closed" && messageEntries(m).some(e=>String(e.senderId)!==String(currentSession.id));
        const last = messageEntries(m).slice(-1)[0];
        const title = messageParticipantsLabel(m);
        const initials = avatarOf(title.replace(/↔/g, " "));
        const time = last?.createdAt ? new Date(last.createdAt).toLocaleTimeString("en-ZA",{hour:"2-digit",minute:"2-digit"}) : "";
        return `<div class="message-item ${unread ? "unread" : ""} ${m.id===_activeMessageId?"active":""}" onclick="openConversation('${m.id}')">
          <div class="message-avatar">${esc(initials)}</div>
          <div class="message-summary">
            <div class="message-title-row">
              <span class="message-title">${esc(title)}</span>
              ${badge(m.status === "closed" ? "maintenance" : "available", m.status === "closed" ? "Closed" : "Open")}
            </div>
            <div class="message-body">${esc(m.subject)}: ${esc(last?.body || "")}</div>
          </div>
          <div class="message-side"><span class="message-time">${esc(time)}</span>${unread?`<span class="unread-dot"></span>`:""}</div>
        </div>`;
      }).join("");
  renderConversation();
  updateNotifications();
  lucide.createIcons();
}

function configureMessageComposer() {
  const title = document.getElementById("messageComposeTitle");
  const hint = document.getElementById("messageComposeHint");
  const recipient = document.getElementById("msgRecipient");
  if (!recipient) return;
  if (currentSession.role === "developer") {
    title.textContent = "Developer Message";
    hint.textContent = "Message the owner, a user, or send an announcement.";
    const users = Store.users.all().filter(u=>u.status==="active"&&!isPrivilegedLoginUser(u));
    recipient.innerHTML = [
      `<option value="announcement">Announcement to all users</option>`,
      `<option value="owner">Owner</option>`,
      ...users.map(u=>`<option value="user:${u.id}">${esc(u.name)} (${esc(u.role)})</option>`)
    ].join("");
  } else if (currentSession.role === "owner") {
    title.textContent = "New Conversation";
    hint.textContent = "Contact developer support or a login user.";
    const users = Store.users.all().filter(u=>u.status==="active"&&!isPrivilegedLoginUser(u)&&u.id!==currentSession.id);
    recipient.innerHTML = [
      `<option value="developer">Developer Support</option>`,
      ...users.map(u=>`<option value="user:${u.id}">${esc(u.name)} (${esc(u.role)})</option>`)
    ].join("");
  } else {
    title.textContent = "Contact Owner";
    hint.textContent = "Send a message to the owner.";
    recipient.innerHTML = `<option value="owner">Owner</option>`;
  }
}

function openConversation(id) {
  _isComposingMessage = false;
  _activeMessageId = id;
  renderMessages();
}

function openMessageComposer() {
  _activeMessageId = null;
  _isComposingMessage = true;
  renderMessages();
}

function renderConversation() {
  const panel = document.getElementById("conversationPanel");
  if (!panel) return;
  if (_isComposingMessage) {
    panel.innerHTML = `
      <form class="message-compose-card" id="supportMessageForm">
        <div class="conversation-header">
          <div>
            <h4 id="messageComposeTitle">New Conversation</h4>
            <div class="message-meta"><span id="messageComposeHint"></span></div>
          </div>
        </div>
        <div class="modal-form" style="padding:0">
          <div class="form-group">
            <label>Recipient</label>
            <select id="msgRecipient" required></select>
          </div>
          <div class="form-group">
            <label>Subject</label>
            <input type="text" id="msgSubject" placeholder="Short subject" required/>
          </div>
          <div class="form-group">
            <label>Message</label>
            <textarea id="msgBody" placeholder="Write your message..." required></textarea>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn-secondary" onclick="openConversation('${Store.messages.all().filter(canViewMessage)[0]?.id || ""}')">Cancel</button>
            <button type="submit" class="btn-primary"><i data-lucide="send"></i> Send</button>
          </div>
        </div>
      </form>`;
    configureMessageComposer();
    document.getElementById("supportMessageForm").addEventListener("submit", saveSupportMessage);
    lucide.createIcons({nodes:[panel]});
    return;
  }
  const m = Store.messages.find(_activeMessageId);
  if (!m) {
    panel.innerHTML = `<div class="conversation-empty">Select a conversation</div>`;
    return;
  }
  const closed = m.status === "closed";
  panel.innerHTML = `
    <div class="conversation-header">
      <div class="conversation-contact">
        <div class="message-avatar">${esc(avatarOf(messageParticipantsLabel(m).replace(/↔/g, " ")))}</div>
        <div>
          <h4>${esc(m.subject)}</h4>
          <div class="message-meta"><span>${esc(messageParticipantsLabel(m))}</span>${badge(closed?"maintenance":"available",closed?"Closed":"Open")}</div>
        </div>
      </div>
      ${currentSession.role==="developer"&&!closed?`<button class="btn-danger" onclick="closeConversation('${m.id}')"><i data-lucide="lock"></i> Close</button>`:""}
    </div>
    <div class="conversation-thread">
      ${messageEntries(m).map(e=>`<div class="conversation-bubble ${String(e.senderId)===String(currentSession.id)?"mine":""}">
        <div class="conversation-sender">${esc(e.senderName||"User")}</div>
        <div class="conversation-text">${esc(e.body||"")}</div>
        <div class="conversation-stamp">${new Date(e.createdAt).toLocaleString("en-ZA",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</div>
      </div>`).join("")}
    </div>
    ${closed?`<div class="conversation-empty" style="min-height:auto">This conversation is closed. Open a new ticket if help is needed again.</div>`:
      `<form class="message-reply-form" onsubmit="replyToMessage(event,'${m.id}')"><textarea placeholder="Write a reply..." required></textarea><button class="btn-primary" type="submit"><i data-lucide="send"></i> Reply</button></form>`}
  `;
  lucide.createIcons({nodes:[panel]});
}

async function saveSupportMessage(e) {
  e.preventDefault();
  const recipient = document.getElementById("msgRecipient").value;
  const subject = document.getElementById("msgSubject").value.trim();
  const body = document.getElementById("msgBody").value.trim();
  if (!recipient || !subject || !body) { showToast("Choose a recipient and add a message.","error"); return; }
  const payload = { subject, body:encryptMessageBody(body) };
  if (recipient === "announcement") payload.recipientRole = "announcement";
  else if (recipient === "developer") payload.recipientRole = "developer";
  else if (recipient === "owner") payload.recipientRole = "owner";
  else if (recipient.startsWith("user:")) payload.recipientUserId = recipient.split(":")[1];
  try {
    await requestNotificationPermission();
    const saved = await Api.messages.create(payload);
    Store.messages.add(saved);
    Store.activity.log(`Started conversation: ${subject}`);
    _activeMessageId = saved.id;
    _isComposingMessage = false;
    e.target.reset();
    showToast("Conversation started.","success");
    await refreshFromApi();
    renderMessages();
  } catch (err) {
    showToast(err.message || "Could not send message.","error");
  }
}

async function replyToMessage(e, id) {
  e.preventDefault();
  const text = e.target.querySelector("textarea").value.trim();
  if (!text) { showToast("Reply cannot be empty.","error"); return; }
  try {
    const saved = await Api.messages.reply(id, encryptMessageBody(text));
    Store.messages.update(id, saved);
    Store.activity.log(`Replied to conversation: ${saved.subject || id}`);
    showToast("Reply sent.","success");
    await refreshFromApi();
    renderMessages();
  } catch (err) {
    showToast(err.message || "Could not reply.","error");
  }
}

async function closeConversation(id) {
  try {
    const saved = await Api.messages.close(id);
    Store.messages.update(id, saved);
    Store.activity.log(`Closed conversation: ${saved.subject || id}`);
    showToast("Conversation closed.","info");
    renderMessages();
  } catch (err) {
    showToast(err.message || "Could not close conversation.","error");
  }
}


/* ============================================================
   12. ADMIN
   ============================================================ */
function renderAdmin() {
  const isDev=currentSession.role==="developer";
  const canViewActivity=currentSession.role==="developer"||currentSession.role==="owner";
  const canMU=Auth.can("manage_users");

  document.getElementById("activityLogCard").style.display=canViewActivity?"":"none";
  document.getElementById("activityExportWrap").style.display=isDev?"":"none";
  document.getElementById("dbPanelCard").style.display=isDev?"":"none";
  document.getElementById("dataRecoveryCard").style.display=(isDev||currentSession.role==="owner")?"":"none";
  document.getElementById("addUserWrap").style.display=canMU?"":"none";

  // System login users — owner CANNOT see developer accounts
  const allUsers=Store.users.all();
  const visibleUsers=isDev?allUsers:allUsers.filter(u=>!isPrivilegedLoginUser(u));
  const RCOLS={developer:"#2d6aa3",owner:"#c49a3c",reception:"#6b9e6e"};
  const RL={reception:"Reception",owner:"Owner",developer:"Developer"};

  document.getElementById("usersTbody").innerHTML=visibleUsers.map(u=>`<tr>
    <td><div style="display:flex;align-items:center;gap:10px"><div class="mini-avatar" style="background:${RCOLS[u.role]||"#999"}20;color:${RCOLS[u.role]||"#999"}">${u.avatar||"??"}</div><strong>${esc(u.name)}</strong></div></td>
    <td>${esc(u.department||"—")}</td>
    <td>${badge(u.role,RL[u.role]||u.role)}</td>
    <td>${badge(u.status==="active"?"available":"maintenance",u.status==="active"?"Active":"Inactive")}</td>
    <td>${canMU&&u.id!==currentSession.id?`<div class="action-btns"><button class="btn-icon edit" onclick="openEditUser('${u.id}')"><i data-lucide="pencil"></i></button><button class="btn-icon ${u.status==="active"?"delete":"view"}" onclick="toggleUserStatus('${u.id}')"><i data-lucide="${u.status==="active"?"user-x":"user-check"}"></i></button><button class="btn-icon delete" onclick="confirmDelete('user','${u.id}','${esc(u.name)}')"><i data-lucide="trash-2"></i></button></div>`:`<span style="font-size:.8rem;color:var(--text-muted)">${u.id===currentSession.id?"(you)":"—"}</span>`}</td>
  </tr>`).join("")||`<tr class="empty-row"><td colspan="5">No users</td></tr>`;

  // Non-login staff register
  const staffList=Store.staff.all();
  document.getElementById("staffTbody").innerHTML=staffList.map(s=>`<tr>
    <td><strong>${esc(s.name)}</strong></td>
    <td>${esc(s.department||"—")}</td>
    <td>${badge(s.status==="active"?"available":"maintenance",s.status==="active"?"Active":"Inactive")}</td>
    <td><div class="action-btns"><button class="btn-icon edit" onclick="openEditStaff('${s.id}')"><i data-lucide="pencil"></i></button><button class="btn-icon delete" onclick="confirmDelete('staff','${s.id}','${esc(s.name)}')"><i data-lucide="trash-2"></i></button></div></td>
  </tr>`).join("")||`<tr class="empty-row"><td colspan="4">No staff members</td></tr>`;

  if(canViewActivity){
    const logs=Store.activity.all();
    const visibleLogs=isDev?logs:logs.slice(0,20);
    document.getElementById("activityLog").innerHTML=visibleLogs.length===0?`<p style="color:var(--text-muted);font-size:.85rem;padding:12px">No activity yet.</p>`:visibleLogs.map(l=>`<div class="log-entry"><span class="log-time">${new Date(l.at).toLocaleString("en-ZA",{hour:"2-digit",minute:"2-digit",day:"numeric",month:"short"})}</span><span class="log-user">${esc(l.user)}</span><span class="log-role-tag">${esc(l.role||"system")}</span><span class="log-action">${esc(l.action)}</span></div>`).join("");
  }
  if(isDev){
    document.getElementById("dbInfoGrid").innerHTML=`
      <div class="db-info-item"><span class="db-info-label">Backend</span><span class="db-info-value"><span class="status-dot ${_apiOnline?"online":"offline"}"></span>${_apiOnline?"Connected":"Local cache only"}</span></div>
      <div class="db-info-item"><span class="db-info-label">Database</span><span class="db-info-value">PostgreSQL</span></div>
      <div class="db-info-item"><span class="db-info-label">API Base</span><span class="db-info-value db-mono">${location.origin}</span></div>
      <div class="db-info-item"><span class="db-info-label">Auth Endpoint</span><span class="db-info-value db-mono">POST /api/auth/login</span></div>
      <div class="db-info-full"><p style="font-size:.8rem;color:var(--text-secondary);line-height:1.6">Use the recovery tools before maintenance and confirm /api/ready after deployment.</p></div>`;
  }
  lucide.createIcons();
}

function configureUserRoleOptions(selected="") {
  const role = document.getElementById("uRole");
  const options = [`<option value="">Select...</option>`,`<option value="reception">Reception</option>`,`<option value="owner">Owner</option>`];
  if (currentSession.role === "developer") options.push(`<option value="developer">Developer</option>`);
  role.innerHTML = options.join("");
  role.value = selected;
}
function configureUserDepartmentOptions(selected="") {
  const dept = document.getElementById("uDept");
  const departments = ["Reception","Management","Housekeeping","Maintenance"];
  if (currentSession.role === "developer") departments.splice(2, 0, "Engineering");
  dept.innerHTML = [`<option value="">Select...</option>`, ...departments.map(d=>`<option>${esc(d)}</option>`)].join("");
  dept.value = departments.includes(selected) ? selected : "";
}
function openEditUser(id){const u=Store.users.find(id);if(!u)return;document.getElementById("userModalTitle").textContent="Edit User";document.getElementById("userId").value=u.id;document.getElementById("uName").value=u.name;configureUserDepartmentOptions(u.department||"");configureUserRoleOptions(u.role);document.getElementById("uPassword").value="";document.getElementById("uPassword").required=false;document.getElementById("uPassword").placeholder="Leave blank to keep current";openModal("userModal");}
function openAddUser(){document.getElementById("userModalTitle").textContent="Add User";document.getElementById("userForm").reset();document.getElementById("userId").value="";configureUserDepartmentOptions();configureUserRoleOptions();document.getElementById("uPassword").required=true;document.getElementById("uPassword").placeholder="Set a password";openModal("userModal");}
async function saveUser(e){
  e.preventDefault();if(!Auth.can("manage_users")){showToast("Permission denied.","error");return;}
  const id=document.getElementById("userId").value,name=document.getElementById("uName").value.trim(),dept=document.getElementById("uDept").value,role=document.getElementById("uRole").value,pw=document.getElementById("uPassword").value;
  if(!name||!dept||!role||(!id&&!pw)){showToast("Fill in all required fields.","error");return;}
  if(role==="developer"&&currentSession.role!=="developer"){showToast("Only developers can create developer accounts.","error");return;}
  const avatar=avatarOf(name);
  try {
    const payload = {name,department:dept,role};
    if(pw) payload.password = pw;
    const saved = id ? await Api.users.update(id,payload) : await Api.users.create(payload);
    if(id){Store.users.update(id,{...saved,avatar});Store.activity.log(`Updated login user ${name}`);showToast("User updated.","success");}
    else{Store.users.add({...saved,avatar});Store.activity.log(`Created login user ${name}`);showToast("User added.","success");}
    await refreshFromApi();
    closeModal("userModal");renderAdmin();
  } catch (err) {
    showToast(err.message || "Could not save user.","error");
  }
}
async function toggleUserStatus(id){const u=Store.users.find(id);if(!u)return;const ns=u.status==="active"?"inactive":"active";try{const saved=await Api.users.update(id,{status:ns});Store.users.update(id,saved);Store.activity.log(`${ns==="active"?"Activated":"Deactivated"} login user ${u.name}`);showToast(`${u.name} ${ns==="active"?"activated":"deactivated"}.`,"info");renderAdmin();}catch(err){showToast(err.message||"Could not update user.","error");}}

function openEditStaff(id){const s=Store.staff.find(id);if(!s)return;document.getElementById("staffModalTitle").textContent="Edit Staff Member";document.getElementById("staffMemberId").value=s.id;document.getElementById("smName").value=s.name;document.getElementById("smDept").value=s.department||"";openModal("staffModal");}
async function saveStaff(e){
  e.preventDefault();
  const id=document.getElementById("staffMemberId").value,name=document.getElementById("smName").value.trim(),dept=document.getElementById("smDept").value;
  if(!name||!dept){showToast("Fill in all required fields.","error");return;}
  try {
    const saved = id ? await Api.staff.update(id,{name,department:dept}) : await Api.staff.create({name,department:dept});
    if(id){Store.staff.update(id,saved);Store.activity.log(`Updated staff member ${name}`);showToast("Staff member updated.","success");}
    else{Store.staff.add(saved);Store.activity.log(`Created staff member ${name}`);showToast("Staff member added.","success");}
    await refreshFromApi();
    closeModal("staffModal");renderAdmin();renderStaffGrid?.();
  } catch (err) {
    showToast(err.message || "Could not save staff member.","error");
  }
}


/* ============================================================
   12. DEVELOPER SECRET PANEL
   ============================================================ */
function renderDevSecret() {
  if(!Auth.can("view_dev_secret")){showToast("Access denied.","error");navigateTo("dashboard");return;}

  document.querySelectorAll(".dev-console-tab").forEach(tab=>{
    tab.classList.toggle("active", tab.dataset.devTab===_activeDevTab);
  });
  document.querySelectorAll(".dev-tab-panel").forEach(panel=>{
    panel.style.display = panel.dataset.devPanel===_activeDevTab ? "" : "none";
  });

  // Storage inspector
  const allRaw=Store.getAllRaw();
  document.getElementById("devStorageInfo").innerHTML=Object.entries(allRaw).map(([k,v])=>`
    <div class="dsp-info-row"><span class="dsp-key">${k}</span><span class="dsp-val">${Array.isArray(v)?v.length+" records":typeof v}</span></div>`).join("");

  // Build info
  document.getElementById("devBuildInfo").innerHTML=`
    <div class="dsp-info-row"><span class="dsp-key">API Status</span><span class="dsp-val">${_apiOnline?"Connected":"Local cache"}</span></div>
    <div class="dsp-info-row"><span class="dsp-key">User Access</span><span class="dsp-val">${_systemStatus.loginLocked?"Closed":"Open"}</span></div>
    <div class="dsp-info-row"><span class="dsp-key">Current Role</span><span class="dsp-val">${esc(currentSession.role)}</span></div>
    <div class="dsp-info-row"><span class="dsp-key">Developer View</span><span class="dsp-val">${currentSession.actingDeveloper?"Switched":"Direct"}</span></div>
    <div class="dsp-info-row"><span class="dsp-key">Acting Developer</span><span class="dsp-val">${currentSession.actingDeveloper?esc(currentSession.actingDeveloper.name):"None"}</span></div>
    <div class="dsp-info-row"><span class="dsp-key">Login Time</span><span class="dsp-val">${new Date(currentSession.loginAt).toLocaleString("en-ZA")}</span></div>`;

  // View switching uses one active account per role behind the scenes.
  const allUsers=Store.users.all();
  const switchViews = [
    {role:"owner",label:"Owner View",description:"Management, admin and owner messages"},
    {role:"reception",label:"Reception View",description:"Bookings, rooms, guests and clock-in"}
  ].map(view=>({...view,user:allUsers.find(u=>u.role===view.role&&u.status==="active"&&u.isGhost)||allUsers.find(u=>u.role===view.role&&u.status==="active")}));
  document.getElementById("devSwitchTbody").innerHTML=switchViews.map(view=>`<tr>
    <td>${badge(view.role,view.label)}</td>
    <td>${esc(view.description)}</td>
    <td>${badge("available","Active")}</td>
    <td>${view.user?`<button class="btn-primary" onclick="switchToUser('${view.user.id}')"><i data-lucide="repeat-2"></i> Open</button>`:`<span style="font-size:.8rem;color:var(--text-muted)">No active ${esc(view.role)} account</span>`}</td>
  </tr>`).join("");

  const logs = Store.activity.all().sort((a,b)=>new Date(b.at)-new Date(a.at));
  const loginLogs = logs.filter(l=>/signed in|login/i.test(l.action || ""));
  const actorCount = new Set(logs.map(l=>l.user).filter(Boolean)).size;
  document.getElementById("devActivitySummary").innerHTML = `
    <div class="activity-metric"><strong>${logs.length}</strong><span>Total Events</span></div>
    <div class="activity-metric"><strong>${loginLogs.length}</strong><span>Login Events</span></div>
    <div class="activity-metric"><strong>${actorCount}</strong><span>Active Users</span></div>`;
  document.getElementById("devActivityLog").innerHTML = logs.length===0
    ? `<p style="color:var(--text-muted);font-size:.85rem;padding:12px">No activity yet.</p>`
    : logs.slice(0,80).map(l=>`<div class="log-entry">
      <span class="log-time">${new Date(l.at).toLocaleString("en-ZA",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</span>
      <span class="log-user">${esc(l.user||"System")}</span>
      <span class="log-role-tag">${esc(l.role||"system")}</span>
      <span class="log-action">${esc(l.action||"Activity recorded")}</span>
    </div>`).join("");

  document.getElementById("devUsersTbody").innerHTML=allUsers.map(u=>`<tr>
    <td>${esc(u.name)}</td>
    <td>${badge(u.role,u.role)}</td>
    <td>${esc(u.department||"—")}</td>
    <td>${badge(u.status==="active"?"available":"maintenance",u.status)}</td>
    <td>${u.role==="developer"?`<span class="ghost-visibility"><i data-lucide="eye-off"></i> Developer panel only</span>`:`<span style="font-size:.78rem;color:var(--text-muted)">Visible to owner/admin</span>`}</td>
  </tr>`).join("");
  const lockBtn = document.getElementById("devToggleLoginLock");
  if (lockBtn) {
    lockBtn.innerHTML = `<i data-lucide="${_systemStatus.loginLocked?"unlock":"lock"}"></i> ${_systemStatus.loginLocked?"Open User Access":"Close User Access"}`;
    lockBtn.className = _systemStatus.loginLocked ? "btn-primary" : "btn-secondary";
  }
  lucide.createIcons();
}

async function switchToUser(id) {
  const result = await Auth.switchUser(id);
  if (!result.success) showToast(result.error || "Could not switch user.","error");
}


/* ============================================================
   13. MODALS & CONFIRM
   ============================================================ */
function openModal(id)  { document.getElementById(id)?.classList.add("open"); }
function closeModal(id) { document.getElementById(id)?.classList.remove("open"); }

document.addEventListener("click",e=>{if(e.target.classList.contains("modal-overlay"))closeModal(e.target.id);});
document.querySelectorAll(".modal-close,[data-modal]").forEach(btn=>{btn.addEventListener("click",()=>{if(btn.dataset.modal)closeModal(btn.dataset.modal);});});

let _pendingDelete=null;
function confirmDelete(type,id,label){_pendingDelete={type,id};document.getElementById("confirmMessage").textContent=`Delete ${label}? This cannot be undone.`;openModal("confirmModal");}
document.getElementById("confirmDeleteBtn").addEventListener("click",async ()=>{
  if(!_pendingDelete)return;
  const{type,id}=_pendingDelete;
  try {
    if(type==="booking"){const item=Store.bookings.find(id);await Api.bookings.remove(id);Store.bookings.remove(id);Store.activity.log(`Deleted room booking${item?.customerName?` for ${item.customerName}`:""}`);showToast("Booking deleted.","info");renderBookings();renderDashboard();}
    else if(type==="venue"){const item=Store.venues.find(id);await Api.venues.remove(id);Store.venues.remove(id);Store.activity.log(`Deleted venue booking${item?.clientName?` for ${item.clientName}`:""}`);showToast("Venue booking deleted.","info");renderVenues();renderDashboard();}
    else if(type==="room"){const r=Store.rooms.find(id);const inUse=Store.bookings.all().some(b=>b.roomId===id&&b.payment!=="Cancelled");if(inUse){showToast("Cannot delete room with active bookings.","error");closeModal("confirmModal");_pendingDelete=null;return;}await Api.rooms.remove(id);Store.rooms.remove(id);Store.activity.log(`Deleted room ${r?.number||id}`);showToast("Room deleted.","info");renderRooms();renderDashboard();}
    else if(type==="staff"){const s=Store.staff.find(id);await Api.staff.remove(id);Store.staff.remove(id);Store.activity.log(`Removed staff member ${s?.name||id}`);showToast("Staff member removed.","info");renderAdmin();}
    else if(type==="user"){const u=Store.users.find(id);if(u?.id===currentSession.id){showToast("Cannot delete your own account.","error");closeModal("confirmModal");_pendingDelete=null;return;}await Api.users.remove(id);Store.users.remove(id);Store.activity.log(`Deleted login user ${u?.name||id}`);showToast("User deleted.","info");renderAdmin();}
    else if(type==="shift"){const s=Store.shifts.find(id);Store.shifts.remove(id);Store.activity.log(`Removed shift record${s?.staffName?` for ${s.staffName}`:""}`);showToast("Shift removed from this view.","info");renderShiftsTable();renderDashboard();}
    await refreshFromApi();
  } catch (err) {
    showToast(err.message || "Delete failed.","error");
  }
  closeModal("confirmModal");_pendingDelete=null;
});

/* ============================================================
   14. TOAST
   ============================================================ */
function showToast(msg,type="info") {
  const icons={success:"check-circle",error:"alert-circle",info:"info"};
  const t=document.createElement("div");t.className=`toast ${type}`;t.innerHTML=`<i data-lucide="${icons[type]||"info"}"></i>${esc(msg)}`;
  document.getElementById("toastContainer").appendChild(t);lucide.createIcons({nodes:[t]});
  setTimeout(()=>{t.style.animation="toastOut .3s ease forwards";setTimeout(()=>t.remove(),300);},3500);
}


/* ============================================================
   15. EVENT BINDING
   ============================================================ */
function bindEvents() {
  // Nav
  document.querySelectorAll(".link-btn[data-page]").forEach(btn=>btn.addEventListener("click",()=>navigateTo(btn.dataset.page)));
  document.getElementById("menuToggle").addEventListener("click",()=>document.getElementById("sidebar").classList.toggle("open"));
  document.getElementById("logoutBtn").addEventListener("click",()=>{Store.activity.log("Signed out");Auth.logout();});
  document.getElementById("notificationBtn").addEventListener("click",async()=>{await requestNotificationPermission();navigateTo("messages");});

  // Room bookings
  document.getElementById("addBookingBtn").addEventListener("click",openNewBooking);
  document.getElementById("exportBookingBackupBtn")?.addEventListener("click",exportBookingBackup);
  document.getElementById("importBookingBackupInput")?.addEventListener("change",e=>{importBookingBackup(e.target.files?.[0]);e.target.value="";});
  document.getElementById("exportBookingsBtn")?.addEventListener("click",exportRoomBookingsJSON);
  document.getElementById("importBookingsInput")?.addEventListener("change",e=>{importRoomBookingsJSON(e.target.files?.[0]);e.target.value="";});
  document.getElementById("bookingForm").addEventListener("submit",saveBooking);
  document.getElementById("uploadBookingPdfBtn").addEventListener("click",uploadBookingPdf);
  document.getElementById("bookingSearch").addEventListener("input",renderBookings);
  document.getElementById("bFilterFrom").addEventListener("change",renderBookings);
  document.getElementById("bFilterTo").addEventListener("change",renderBookings);
  document.getElementById("bFilterPayment").addEventListener("change",renderBookings);
  document.getElementById("bFilterRoom").addEventListener("change",renderBookings);
  document.getElementById("bClearFilters").addEventListener("click",()=>{
    ["bookingSearch","bFilterFrom","bFilterTo","bFilterPayment","bFilterRoom"].forEach(id=>{const el=document.getElementById(id);if(el)el.value="";});renderBookings();
  });

  // Venue bookings
  document.getElementById("addVenueBtn").addEventListener("click",openNewVenue);
  document.getElementById("exportVenuesBtn")?.addEventListener("click",exportVenueBookingsJSON);
  document.getElementById("importVenuesInput")?.addEventListener("change",e=>{importVenueBookingsJSON(e.target.files?.[0]);e.target.value="";});
  document.getElementById("venueForm").addEventListener("submit",saveVenue);
  document.getElementById("venueSearch").addEventListener("input",renderVenues);
  document.getElementById("vFilterFrom").addEventListener("change",renderVenues);
  document.getElementById("vFilterTo").addEventListener("change",renderVenues);
  document.getElementById("vFilterType").addEventListener("change",renderVenues);
  document.getElementById("vFilterPayment").addEventListener("change",renderVenues);
  document.getElementById("vClearFilters").addEventListener("click",()=>{
    ["venueSearch","vFilterFrom","vFilterTo","vFilterType","vFilterPayment"].forEach(id=>{const el=document.getElementById(id);if(el)el.value="";});_activeVenueType="";document.querySelectorAll(".vtype-tab").forEach(t=>{t.classList.toggle("active",t.dataset.vtype==="");});renderVenues();
  });
  document.querySelectorAll(".vtype-tab").forEach(btn=>btn.addEventListener("click",()=>{
    document.querySelectorAll(".vtype-tab").forEach(t=>t.classList.remove("active"));btn.classList.add("active");
    _activeVenueType=btn.dataset.vtype;renderVenues();
  }));

  // Rooms
  document.getElementById("addRoomBtn").addEventListener("click",openNewRoom);
  document.getElementById("roomForm").addEventListener("submit",saveRoom);
  document.getElementById("roomStatusFilter").addEventListener("change",()=>renderRooms(document.getElementById("roomStatusFilter").value,document.getElementById("roomTypeFilter").value));
  document.getElementById("roomTypeFilter").addEventListener("change",()=>renderRooms(document.getElementById("roomStatusFilter").value,document.getElementById("roomTypeFilter").value));

  // Customers
  document.getElementById("customerSearch").addEventListener("input",e=>renderCustomers(e.target.value));

  // Website requests
  document.getElementById("websiteRequestSearch")?.addEventListener("input",renderWebsiteRequests);
  document.getElementById("websiteRequestStatus")?.addEventListener("change",renderWebsiteRequests);
  document.getElementById("websiteRequestRefresh")?.addEventListener("click",refreshWebsiteRequests);
  document.getElementById("websiteRequestClear")?.addEventListener("click",()=>{
    ["websiteRequestSearch","websiteRequestStatus"].forEach(id=>{const el=document.getElementById(id);if(el)el.value="";});
    renderWebsiteRequests();
  });

  document.getElementById("newMessageBtn")?.addEventListener("click",openMessageComposer);

  document.getElementById("addUserBtn").addEventListener("click",openAddUser);
  document.getElementById("userForm").addEventListener("submit",saveUser);
  document.getElementById("addStaffBtn").addEventListener("click",()=>{document.getElementById("staffModalTitle").textContent="Add Staff Member";document.getElementById("staffForm").reset();document.getElementById("staffMemberId").value="";openModal("staffModal");});
  document.getElementById("staffForm").addEventListener("submit",saveStaff);
  document.getElementById("adminExportBookings")?.addEventListener("click",exportBookingsCSV);
  document.getElementById("adminExportVenues")?.addEventListener("click",exportVenuesCSV);
  document.getElementById("adminExportClients")?.addEventListener("click",exportClientsCSV);
  document.getElementById("adminExportActivity")?.addEventListener("click",exportLoginActivityCSV);

  // Dev panel buttons
  document.getElementById("devClearShifts")?.addEventListener("click",()=>{Store.clearKey(Store.K.shifts,[]);showToast("Shifts reset.","info");renderDevSecret();});
  document.getElementById("devClearAll")?.addEventListener("click",()=>{if(!confirm("Reset ALL data to defaults?"))return;Store.clearAll();showToast("All data reset to defaults.","info");renderDevSecret();renderDashboard();});
  document.getElementById("devSeedData")?.addEventListener("click",()=>{Store.clearAll();Store.activity.log("Reset local cache");showToast("Local cache reset.","success");renderDevSecret();renderDashboard();});
  document.getElementById("devOpenAdmin")?.addEventListener("click",()=>navigateTo("admin"));
  document.getElementById("devToggleLoginLock")?.addEventListener("click",toggleLoginLock);
  document.getElementById("devExportAll")?.addEventListener("click",exportAllDataBackup);
  document.getElementById("devExportActivity")?.addEventListener("click",exportLoginActivityCSV);
  document.getElementById("devShowSession")?.addEventListener("click",()=>{console.log("Lasev Session:",currentSession);showToast("Session logged to console.","info");});
  document.getElementById("devRunHealth")?.addEventListener("click",runDeveloperHealthCheck);
  document.getElementById("devExportHandover")?.addEventListener("click",exportDeveloperHandoverPack);
  document.getElementById("devExportDebug")?.addEventListener("click",exportDebugBundle);
  document.getElementById("devCopySession")?.addEventListener("click",copyDeveloperSessionInfo);
  document.querySelectorAll(".dev-console-tab").forEach(tab=>tab.addEventListener("click",()=>{_activeDevTab=tab.dataset.devTab;renderDevSecret();}));

  // Keyboard
  document.addEventListener("keydown",e=>{if(e.key==="Escape")document.querySelectorAll(".modal-overlay.open").forEach(m=>m.classList.remove("open"));});
}


/* ============================================================
   16. INIT
   ============================================================ */
async function refreshFromApi() {
  await refreshSystemStatus();
  if (enforceSystemLock()) return;
  const data = await Api.hydrate();
  Store.replaceAll(data);
  _apiOnline = true;
}

function logSessionStartOnce() {
  const key = `lasev_login_logged_${currentSession.id}_${currentSession.loginAt}`;
  if (sessionStorage.getItem(key)) return;
  Store.activity.log(`Signed in at ${new Date(currentSession.loginAt).toLocaleString("en-ZA")}`);
  sessionStorage.setItem(key, "1");
}

async function init() {
  Auth.startInactivityWatcher?.();
  try {
    await refreshFromApi();
    if (enforceSystemLock()) return;
  } catch (err) {
    _apiOnline = false;
    showToast(err.message || "Could not load API data.","error");
    if (/contact the developers|currently closed/i.test(err.message || "")) {
      alert(err.message);
      Auth.logout();
      return;
    }
  }
  logSessionStartOnce();
  document.getElementById("pageDate").textContent=new Date().toLocaleDateString("en-ZA",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
  buildSidebar();
  renderSwitchBanner();
  startTopbarClock();
  bindEvents();
  window.addEventListener("storage", e => {
    if (e.key !== Store.K.websiteRequests) return;
    if (document.getElementById("page-website-requests")?.classList.contains("active")) renderWebsiteRequests();
    buildSidebar();
  });
  setInterval(async()=>{ enforceSystemLock(await refreshSystemStatus()); }, 30000);
  updateNotifications();
  notifyUnreadMessages();
  navigateTo(defaultPageForSession());
  console.log(`%c✦ Lasev Resort%c\nSigned in: ${currentSession.name} (${currentSession.role})`,"color:#c49a3c;font-size:14px;font-weight:bold","color:#888;font-size:11px");
}

document.addEventListener("DOMContentLoaded",init);


