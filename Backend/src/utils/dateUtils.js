// Returns number of nights between two date strings
function countNights(checkIn, checkOut) {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((new Date(checkOut) - new Date(checkIn)) / msPerDay);
}

// Format a date as YYYY-MM-DD
function toDateString(date) {
  return new Date(date).toISOString().split('T')[0];
}

module.exports = { countNights, toDateString };
