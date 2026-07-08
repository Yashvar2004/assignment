module.exports = (req, res) => {
  res.status(200).json({
    status: 'ok',
    message: 'Backend is working',
    timestamp: new Date().toISOString(),
  });
};
