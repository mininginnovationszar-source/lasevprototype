const hamburger = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobileMenu');
const bookingForm = document.getElementById('booking-form');
const quickBookForm = document.getElementById('quick-book-form');
const navbar = document.getElementById('navbar');
const API_BASE = String(window.LASEV_API_BASE || '').replace(/\/+$/, '').replace(/\/api$/, '');

function syncNavbarWithHero() {
    navbar?.classList.toggle('scrolled', window.scrollY > 36);
}

syncNavbarWithHero();
window.addEventListener('scroll', syncNavbarWithHero, { passive: true });

  hamburger.addEventListener('click', () => {
    const open = mobileMenu.classList.toggle('open');
    hamburger.setAttribute('aria-expanded', String(open));
    hamburger.innerHTML = open ? '<i data-lucide="x"></i>' : '<i data-lucide="menu"></i>';
    lucide.createIcons();
  });

  mobileMenu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      mobileMenu.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
      hamburger.innerHTML = '<i data-lucide="menu"></i>';
      lucide.createIcons();
    });
  });

function getValue(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

async function saveWebsiteRequest(data) {
    const response = await fetch(`${API_BASE}/api/website-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(result.message || 'Could not send your request. Please try again.');
    }
    return result;
}

async function submitWebsiteRequest(event) {
    event.preventDefault();

    const form = event.target;
    const feedback = form.querySelector('.request-feedback') || document.getElementById('booking-error');
    const name = getValue('book-name') || getValue('quick-name');
    const whatsapp = getValue('book-whatsapp') || getValue('quick-whatsapp');
    const bookingType = getValue('book-booking-type') || getValue('quick-booking-type');
    const checkin = getValue('book-checkin');
    const checkout = getValue('book-checkout');
    const guests = getValue('book-guests') || getValue('quick-guests');
    if (feedback) {
      feedback.textContent = '';
      feedback.classList.remove('success');
    }

    if (!name || !bookingType || !whatsapp || !guests) {
      if (feedback) feedback.textContent = 'Please add your name, booking type, WhatsApp contact, and number of guests.';
      return;
    }

    let nightsText = '';
    if (checkin && checkout) {
      const checkInDate = new Date(checkin);
      const checkOutDate = new Date(checkout);
      if (checkOutDate <= checkInDate) {
        if (feedback) feedback.textContent = 'Check-out must be after check-in.';
        return;
      }
      const nights = Math.round((checkOutDate - checkInDate) / 86400000);
      nightsText = `\nDuration: ${nights} night${nights === 1 ? '' : 's'}`;
    }

    const fmt = date => date ? new Date(date + 'T00:00:00').toLocaleDateString('en-ZA', {
      day:'numeric',
      month:'long',
      year:'numeric'
    }) : 'To be confirmed';

    const message =
`Website booking request

Name: ${name}
WhatsApp: ${whatsapp}
Booking type: ${bookingType}
Check-in: ${fmt(checkin)}
Check-out: ${fmt(checkout)}${nightsText}
Guests: ${guests}`;

    try {
      await saveWebsiteRequest({
        name,
        whatsapp,
        phone: whatsapp,
        bookingType,
        checkin,
        checkout,
        guests,
        nightsText: nightsText.trim(),
        message
      });

      if (feedback) {
        feedback.textContent = 'Request sent to the resort desk. We will confirm availability soon.';
        feedback.classList.add('success');
      }
      form.reset();
    } catch (err) {
      if (feedback) {
        feedback.textContent = err.message || 'Could not send your request. Please try again.';
        feedback.classList.remove('success');
      }
    }
}

bookingForm?.addEventListener('submit', submitWebsiteRequest);
quickBookForm?.addEventListener('submit', submitWebsiteRequest);

lucide.createIcons();
