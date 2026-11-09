const router = require('express').Router();
const { Notification } = require('../models');
const { authenticate } = require('../middleware/authorization');

router.use(authenticate);

router.get('/', async (req, res, next) => {
  try {
    const notifications = await Notification.findAll({
      where: { userId: req.user.id },
      order: [['createdAt', 'DESC']],
      limit: 100
    });
    res.json(notifications);
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/read', async (req, res, next) => {
  try {
    const notification = await Notification.findOne({
      where: { id: req.params.id, userId: req.user.id }
    });
    if (!notification) return res.status(404).json({ message: 'Notification introuvable.' });
    notification.isRead = true;
    await notification.save();
    res.json(notification);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
