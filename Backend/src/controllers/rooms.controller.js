const roomService = require('../services/room.service');
const activity    = require('../services/activityLog.service');

async function getAll(req, res, next) {
  try {
    const rooms = await roomService.getAllRooms();
    res.json(rooms);
  } catch (err) { next(err); }
}

async function getOne(req, res, next) {
  try {
    const room = await roomService.getRoomById(req.params.id);
    res.json(room);
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const room = await roomService.createRoom(req.body);
    await activity.log(`Created room ${room.number}`, req.user);
    res.status(201).json(room);
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const room = await roomService.updateRoom(req.params.id, req.body);
    await activity.log(`Updated room ${room.number}`, req.user);
    res.json(room);
  } catch (err) { next(err); }
}

async function remove(req, res, next) {
  try {
    const room = await roomService.getRoomById(req.params.id).catch(() => null);
    await roomService.deleteRoom(req.params.id);
    await activity.log(`Deleted room ${room?.number || req.params.id}`, req.user);
    res.json({ message: 'Room deleted.' });
  } catch (err) { next(err); }
}

module.exports = { getAll, getOne, create, update, remove };
