// Format a number as South African Rand
function formatRand(amount) {
  return `R ${Number(amount).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
}

// Calculate total for a room booking
function calcBookingTotal(pricePerNight, nights) {
  return Math.round(pricePerNight * nights * 100) / 100;
}

module.exports = { formatRand, calcBookingTotal };
