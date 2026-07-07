"use strict";

const Api = (() => {
  const RAW_API_BASE = window.LASEV_API_BASE
    || (["127.0.0.1:5500", "localhost:5500"].includes(window.location.host) ? "http://localhost:3000" : "");
  const API_BASE = String(RAW_API_BASE).replace(/\/+$/, "").replace(/\/api$/, "");
  const TOKEN_KEY = "lasev_token";

  const dateOnly = value => {
    if (!value) return "";
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    return new Date(value).toISOString().split("T")[0];
  };

  const timeOnly = value => {
    if (!value) return "";
    return String(value).slice(0, 5);
  };

  const avatarOf = name => String(name || "?").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);

  function setToken(token, remember) {
    const target = remember ? localStorage : sessionStorage;
    target.setItem(TOKEN_KEY, token);
    (remember ? sessionStorage : localStorage).removeItem(TOKEN_KEY);
  }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY);
  }

  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
  }

  function saveToken(token, remember = false) {
    setToken(token, remember);
  }

  async function request(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";

    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;

    if (!res.ok) {
      if (res.status === 401 || res.status === 423) clearToken();
      throw new Error(data?.message || "API request failed.");
    }
    return data;
  }

  async function requestBlob(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
    if (!res.ok) {
      let message = "API request failed.";
      try {
        const data = await res.json();
        message = data?.message || message;
      } catch (_err) {}
      if (res.status === 401 || res.status === 423) clearToken();
      throw new Error(message);
    }
    return res.blob();
  }

  const toRoom = r => ({
    id: String(r.id),
    number: r.number,
    type: r.type,
    price: Number(r.price || 0),
    capacity: Number(r.capacity || 0),
    status: r.status,
  });

  const toBooking = b => ({
    id: String(b.id),
    customerName: b.customer_name ?? b.customerName,
    contact: b.contact,
    roomId: String(b.room_id ?? b.roomId),
    checkIn: dateOnly(b.check_in ?? b.checkIn),
    checkOut: dateOnly(b.check_out ?? b.checkOut),
    payment: b.payment,
    notes: b.notes || "",
    createdAt: dateOnly(b.created_at ?? b.createdAt),
    attachmentCount: Number(b.attachment_count ?? b.attachmentCount ?? 0),
  });

  const fromBooking = b => ({
    customerName: b.customerName,
    contact: b.contact,
    roomId: Number(b.roomId),
    checkIn: b.checkIn,
    checkOut: b.checkOut,
    payment: b.payment,
    notes: b.notes || "",
  });

  const toVenue = v => ({
    id: String(v.id),
    clientName: v.client_name ?? v.clientName,
    contact: v.contact,
    venueType: v.venue_type ?? v.venueType,
    eventType: v.event_type ?? v.eventType,
    date: dateOnly(v.event_date ?? v.date),
    time: timeOnly(v.event_time ?? v.time),
    guests: Number(v.guests || 0),
    amount: Number(v.amount || 0),
    payment: v.payment,
    notes: v.notes || "",
    createdAt: dateOnly(v.created_at ?? v.createdAt),
  });

  const fromVenue = v => ({
    clientName: v.clientName,
    contact: v.contact,
    venueType: v.venueType,
    eventType: v.eventType,
    eventDate: v.date,
    eventTime: v.time,
    guests: v.guests,
    amount: v.amount,
    payment: v.payment,
    notes: v.notes || "",
  });

  const toUser = u => ({
    id: String(u.id),
    name: u.name,
    department: u.department || "",
    role: u.role,
    status: u.status || "active",
    isGhost: Boolean(u.is_ghost ?? u.isGhost),
    avatar: avatarOf(u.name),
    actingDeveloper: u.actingDeveloper || u.acting_developer || null,
  });

  const toStaff = s => ({
    id: String(s.id),
    name: s.name,
    department: s.department,
    status: s.status || "active",
  });

  const toShift = s => ({
    id: String(s.id),
    staffId: String(s.staff_id ?? s.staffId),
    staffName: s.staff_name ?? s.staffName,
    department: s.department || "",
    date: dateOnly(s.shift_date ?? s.date),
    clockIn: s.clock_in ?? s.clockIn,
    clockOut: s.clock_out ?? s.clockOut,
    note: s.note || "",
    recordedBy: (s.recorded_by_name ?? s.recordedBy) || "",
  });

  const toActivity = a => ({
    id: String(a.id),
    action: a.action,
    user: a.user_name || "System",
    role: a.user_role || "",
    at: a.created_at || new Date().toISOString(),
  });

  const toMessage = m => ({
    id: String(m.id),
    subject: m.subject,
    body: m.body || m.entries?.[0]?.body || "",
    status: m.status || "open",
    createdBy: m.created_by ? String(m.created_by) : "",
    createdByName: m.created_by_name || "Owner",
    recipientRole: m.recipient_role || "",
    recipientUserId: m.recipient_user_id ? String(m.recipient_user_id) : "",
    recipientUserName: m.recipient_user_name || "",
    developerReply: m.developer_reply || "",
    readByOwner: Boolean(m.read_by_owner),
    readByDeveloper: Boolean(m.read_by_developer),
    repliedAt: m.replied_at || "",
    createdAt: m.created_at || new Date().toISOString(),
    entries: (m.entries || []).map(e => ({
      id: String(e.id),
      senderId: e.sender_id ? String(e.sender_id) : "",
      senderName: e.sender_name || "User",
      senderRole: e.sender_role || "",
      body: e.body || "",
      createdAt: e.created_at || new Date().toISOString(),
    })),
  });

  const toWebsiteRequest = r => ({
    id: String(r.id),
    name: r.name || "",
    whatsapp: r.whatsapp || r.phone || "",
    phone: r.phone || r.whatsapp || "",
    bookingType: r.bookingType || r.booking_type || "",
    checkin: dateOnly(r.checkin || r.check_in),
    checkout: dateOnly(r.checkout || r.check_out),
    guests: Number(r.guests || 0),
    message: r.message || "",
    source: r.source || "website",
    status: r.status || "new",
    handledBy: r.handledBy || r.handled_by || "",
    createdAt: r.createdAt || r.created_at || new Date().toISOString(),
    updatedAt: r.updatedAt || r.updated_at || "",
  });

  async function login(name, password, remember) {
    const result = await request("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ name, password }),
    });
    setToken(result.token, remember);
    return { ...result, user: toUser(result.user) };
  }

  async function switchUser(userId) {
    const normalizedUserId = /^\d+$/.test(String(userId)) ? Number(userId) : userId;
    const result = await request("/api/auth/switch-user", {
      method: "POST",
      body: JSON.stringify({ userId: normalizedUserId }),
    });
    setToken(result.token, false);
    return { ...result, user: toUser(result.user) };
  }

  async function hydrate() {
    const [rooms, bookings, venues, staff, users, shifts, activity, messages, websiteRequests] = await Promise.all([
      request("/api/rooms").then(rows => rows.map(toRoom)),
      request("/api/bookings").then(rows => rows.map(toBooking)),
      request("/api/venues").then(rows => rows.map(toVenue)),
      request("/api/staff").then(rows => rows.map(toStaff).filter(s => s.status !== "inactive")),
      request("/api/users").then(rows => rows.map(toUser)).catch(() => []),
      request(`/api/staff/shifts?date=${dateOnly(new Date())}`).then(rows => rows.map(toShift)),
      request("/api/activity?limit=all").then(rows => rows.map(toActivity)).catch(() => []),
      request("/api/messages").then(rows => rows.map(toMessage)).catch(() => []),
      request("/api/website-requests").then(rows => rows.map(toWebsiteRequest)).catch(() => []),
    ]);
    return { rooms, bookings, venues, staff, users, shifts, activity, messages, websiteRequests };
  }

  return {
    login, hydrate, clearToken, getToken, saveToken, switchUser,
    rooms: {
      create: data => request("/api/rooms", { method: "POST", body: JSON.stringify(data) }).then(toRoom),
      update: (id, data) => request(`/api/rooms/${id}`, { method: "PUT", body: JSON.stringify(data) }).then(toRoom),
      remove: id => request(`/api/rooms/${id}`, { method: "DELETE" }),
    },
    bookings: {
      create: data => request("/api/bookings", { method: "POST", body: JSON.stringify(fromBooking(data)) }).then(toBooking),
      update: (id, data) => request(`/api/bookings/${id}`, { method: "PUT", body: JSON.stringify(fromBooking(data)) }).then(toBooking),
      remove: id => request(`/api/bookings/${id}`, { method: "DELETE" }),
      attachments: id => request(`/api/bookings/${id}/attachments`).then(rows => rows.map(a => ({
        id: String(a.id),
        bookingId: String(a.booking_id ?? a.bookingId),
        fileName: a.file_name ?? a.fileName,
        contentType: a.content_type ?? a.contentType,
        fileSize: Number(a.file_size ?? a.fileSize ?? 0),
        uploadedAt: a.uploaded_at ?? a.uploadedAt,
      }))),
      uploadAttachment: (id, file) => request(`/api/bookings/${id}/attachments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/pdf",
          "X-File-Name": encodeURIComponent(file.name || "quotation.pdf"),
        },
        body: file,
      }),
      attachmentBlob: (bookingId, attachmentId, download = false) =>
        requestBlob(`/api/bookings/${bookingId}/attachments/${attachmentId}${download ? "?download=1" : ""}`),
      removeAttachment: (bookingId, attachmentId) => request(`/api/bookings/${bookingId}/attachments/${attachmentId}`, { method: "DELETE" }),
    },
    venues: {
      create: data => request("/api/venues", { method: "POST", body: JSON.stringify(fromVenue(data)) }).then(toVenue),
      update: (id, data) => request(`/api/venues/${id}`, { method: "PUT", body: JSON.stringify(fromVenue(data)) }).then(toVenue),
      remove: id => request(`/api/venues/${id}`, { method: "DELETE" }),
    },
    staff: {
      create: data => request("/api/staff", { method: "POST", body: JSON.stringify(data) }).then(toStaff),
      update: (id, data) => request(`/api/staff/${id}`, { method: "PUT", body: JSON.stringify(data) }).then(toStaff),
      remove: id => request(`/api/staff/${id}`, { method: "DELETE" }),
    },
    users: {
      create: data => request("/api/users", { method: "POST", body: JSON.stringify(data) }).then(toUser),
      update: (id, data) => request(`/api/users/${id}`, { method: "PUT", body: JSON.stringify(data) }).then(toUser),
      remove: id => request(`/api/users/${id}`, { method: "DELETE" }),
    },
    shifts: {
      clockIn: staffId => request("/api/staff/shifts/clock-in", { method: "POST", body: JSON.stringify({ staffId: Number(staffId) }) }).then(toShift),
      clockOut: shiftId => request("/api/staff/shifts/clock-out", { method: "POST", body: JSON.stringify({ shiftId: Number(shiftId) }) }).then(toShift),
    },
    messages: {
      create: data => request("/api/messages", { method: "POST", body: JSON.stringify(data) }).then(toMessage),
      reply: (id, body) => request(`/api/messages/${id}/reply`, { method: "PUT", body: JSON.stringify({ body }) }).then(toMessage),
      close: id => request(`/api/messages/${id}/close`, { method: "PUT" }).then(toMessage),
      markRead: id => request(`/api/messages/${id}/read`, { method: "PUT" }).then(toMessage),
    },
    websiteRequests: {
      update: (id, data) => request(`/api/website-requests/${id}`, { method: "PUT", body: JSON.stringify(data) }).then(toWebsiteRequest),
    },
    system: {
      status: () => request("/api/system/status"),
      setLoginLock: locked => request("/api/system/login-lock", { method: "POST", body: JSON.stringify({ locked }) })
        .catch(err => {
          if (!/route not found/i.test(err.message || "")) throw err;
          return request("/api/login-lock", { method: "POST", body: JSON.stringify({ locked }) });
        }),
    },
    clientErrors: {
      report: data => request("/api/client-errors", { method: "POST", body: JSON.stringify(data) }).catch(() => null),
    },
  };
})();
