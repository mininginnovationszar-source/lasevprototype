const authService = require('../services/auth.service');
const activity    = require('../services/activityLog.service');

async function login(req, res, next) {
  try {
    const { name, password } = req.body;
    const result = await authService.login(name, password);
    await activity.log('Signed in', result.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

// Returns the current user from the JWT (used by frontend on page load)
function me(req, res) {
  res.json({ user: req.user });
}

async function switchUser(req, res, next) {
  try {
    const result = await authService.switchUser(req.user, req.body.userId);
    await activity.log(`Switched view to ${result.user.name} (${result.user.role})`, req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = { login, me, switchUser };
